import { describe, expect, it } from 'vitest';
import {
  DOMAINFACTORY_SOURCE_URL,
  domainfactory,
  parseTable,
  parseTerms,
  textOf,
} from '../src/adapters/domainfactory.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, fixture, testHttp } from './helpers.js';

const PAGE = fixture('domainfactory/domains.html');
const ROBOTS = { 'https://www.df.eu/robots.txt': { body: 'User-agent: *\nAllow: /\n' } };
const run = (body: string, tlds: readonly string[] = MVP_TLDS) =>
  domainfactory.fetch(
    ctxFor(testHttp({ ...ROBOTS, [DOMAINFACTORY_SOURCE_URL]: { body } }).http, tlds),
  );

/** One table row in the page's markup. */
const row = (tld: string, promo: string, regular: string, marker = '') =>
  `<tr><td class="df-tld__item-label caption"> .${tld}${marker} </td>` +
  `<td class="df-tld__item-info">${promo}</td><td class="df-tld__item-info">${regular}</td></tr>`;
const MONTHLY =
  'Die folgenden Preise sind Monatspreise und verstehen sich für einen Abrechnungszeitraum von 12 Monaten.';
const table = (rows: string, statement = MONTHLY) =>
  `<li class="m-accordion__item"><div class="m-accordion__header">Alle Domainendungen</div><table><tr><td>${statement}</td></tr>${rows}</table>`;

describe('domainfactory page parsing', () => {
  it('textOf: tags, entities and soft hyphens', () => {
    expect(textOf('<p>Einrichtungs­gebühr&nbsp;0,00&nbsp;&euro; &amp; x</p>')).toBe(
      'Einrichtungsgebühr 0,00 € & x',
    );
  });

  it('reads the "Alle Domainendungen" table: monthly promo and regular prices in cents', () => {
    const rows = parseTable(PAGE);
    const plain = { marked: false, promoAboveRegular: false };
    const marked = { marked: true, promoAboveRegular: false };
    expect(rows.get('de')).toEqual({ promo: 8, regular: 99, ...plain });
    expect(rows.get('com')).toEqual({ promo: 8, regular: 199, ...marked });
    expect(rows.get('net')).toEqual({ promo: null, regular: 219, ...marked });
    expect(rows.get('io')).toEqual({ promo: 539, regular: 849, ...marked });
    expect(rows.get('online')).toEqual({ promo: 9, regular: 449, ...marked });
    // a "promo" equal to the regular price is no promo (.rocks: 2,69 € / 2,69 €)
    expect(rows.get('rocks')).toEqual({ promo: null, regular: 269, ...marked });
    expect(rows.has('dev')).toBe(false);
  });

  it('reads the whole label: a multi-label or IDN row never replaces a real one', () => {
    const rows = parseTable(
      table(
        row('com', '0,08 €', '1,99 €', ' #') +
          row('com.de', '', '0,49 €') +
          row('co.uk', '', '0,89 €') +
          row('köln', '', '2,49 €', ' #') +
          row('shop*', '', '0,99 €'),
      ),
    );
    // a footnote sign after the label is not part of the TLD
    expect([...rows.keys()]).toEqual(['com', 'com.de', 'co.uk', 'köln', 'shop']);
    expect(rows.get('com')).toMatchObject({ promo: 8, regular: 199, marked: true });
    expect(rows.get('köln')).toMatchObject({ regular: 249, marked: true });
    expect(() => parseTable(table(row('com', '', '1,99 €') + row('COM', '', '2,99 €')))).toThrow(
      /\.com: listed twice/,
    );
  });

  it('ignores amounts inside the price tooltip markup', () => {
    const tip =
      '<span class="price"><span>1,99&nbsp;&euro;</span></span><span class="sg-tooltip discount" ' +
      'data-tooltip-content="<p><strong>Mengenrabatt</strong></p><p>ab 50 Domains: 0,50 €</p>"></span>';
    const before =
      '<span class="sg-tooltip" data-tooltip-content="<p>ab 50 Domains: 0,50 €</p>"></span>' +
      '<span class="price"><span>1,99&nbsp;&euro;</span></span>';
    expect(parseTable(table(row('com', '', tip))).get('com')?.regular).toBe(199);
    expect(parseTable(table(row('com', '', before))).get('com')?.regular).toBe(199);
  });

  it('reads setup fee, verbatim promo conditions and the ICANN note', () => {
    expect(parseTerms(PAGE)).toEqual({
      setup: 0,
      promoConditions:
        'Preis für die Registrierung pro Monat für die ersten 12 Monate wie angegeben. Ab dem 13. Monat fällt der dann reguläre Domainpreis an. Abrechnungszeitraum 12 Monate. Das Angebot gilt nur einmal pro Kunde und für Neuregistrierungen.',
      icannIncluded: true,
      markerIsResellerDiscount: true,
    });
    // statements that are missing stay unknown
    expect(parseTerms('Alle Beträge inklusive gesetzlicher Mehrwertsteuer.')).toEqual({
      setup: null,
      promoConditions: null,
      icannIncluded: false,
      markerIsResellerDiscount: false,
    });
  });

  it('fails instead of guessing when a required statement or value is missing', () => {
    expect(() => parseTable('<p>nothing</p>')).toThrow(/Alle Domainendungen/);
    expect(() => parseTable(table(row('de', '', '0,99 €'), 'Jahrespreise'))).toThrow(/monthly/);
    expect(() => parseTable(table(''))).toThrow(/no TLD rows/);
    expect(() =>
      parseTable(table('<tr><td class="df-tld__item-label caption"> .de </td></tr>')),
    ).toThrow(/expected 2 price cells/);
    expect(() => parseTable(table(row('de', '0,08 €', 'Preis auf Anfrage')))).toThrow(
      /no regular price/,
    );
    expect(() => parseTerms('<p>Preise zzgl. MwSt.</p>')).toThrow(/gross/);
    // the section may end the page (no further accordion item)
    expect(parseTable(table(row('de', '', '1.234,50&nbsp;&euro;*'))).get('de')).toEqual({
      promo: null,
      regular: 123450,
      marked: false,
      promoAboveRegular: false,
    });
  });
});

describe('domainfactory adapter', () => {
  it('maps the MVP TLDs: gross, monthly, promo with conditions, setup, ICANN for gTLDs only', async () => {
    const result = await run(PAGE);
    expect(result.notOffered).toEqual(['dev', 'app', 'ai']);
    expect(result.failed).toEqual([]);
    expect(result.offers).toHaveLength(17);
    const de = result.offers.find((o) => o.tld === 'de');
    expect(de).toMatchObject({
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'month',
        setup: 0,
        year1: 8,
        year1_regular: 99,
        renewal: 99,
        term_years: 1,
        renewal_term_years: 1,
        icann_fee_included: null,
      },
      promo: { conditions: expect.stringMatching(/einmal pro Kunde/), valid_until: null },
      evidence: {
        source_url: DOMAINFACTORY_SOURCE_URL,
        fetched_at: '2026-11-13T06:00:00Z',
        method: 'scrape',
        evidence_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        confidence: 'high',
      },
    });
    const net = result.offers.find((o) => o.tld === 'net');
    expect(net?.promo).toBeNull();
    expect(net?.price).toMatchObject({ year1: 219, year1_regular: 219, renewal: 219 });
    expect(net?.price.icann_fee_included).toBe(true);
    expect(result.offers.find((o) => o.tld === 'berlin')?.price.icann_fee_included).toBe(true);
  });

  it('a promo without the stated conditions fails that TLD; no ICANN note means unknown', async () => {
    const page = `${table(row('de', '0,08 €', '0,99 €') + row('com', '', '1,99 €'))}<p>Alle Beträge inklusive gesetzlicher Mehrwertsteuer.</p>`;
    const result = await run(page, ['de', 'com']);
    expect(result.failed).toEqual([
      { tld: 'de', reason: 'promo price without the stated promo conditions' },
    ]);
    expect(result.offers.map((o) => [o.tld, o.price.setup, o.price.icann_fee_included])).toEqual([
      ['com', null, null],
    ]);
  });

  it('a promo above the regular price or a "#" without its footnote fails that TLD', async () => {
    const gross = '<p>Alle Beträge inklusive gesetzlicher Mehrwertsteuer.</p>';
    const page = `${table(row('de', '1,49 €', '0,99 €') + row('com', '', '1,99 €', ' #') + row('net', '', '2,19 €'))}${gross}`;
    const result = await run(page, ['de', 'com', 'net']);
    expect(result.failed).toEqual([
      { tld: 'de', reason: 'promo price above the regular price' },
      { tld: 'com', reason: 'marker "#" without the reseller-discount footnote' },
    ]);
    expect(result.offers.map((o) => o.tld)).toEqual(['net']);
    // with the footnote the marked TLD is an ordinary offer
    const note =
      '<p>#Reseller-Rabatt: Rabattfähig auf Basis des für Sie geltenden Rabattniveaus.</p>';
    const ok = await run(`${table(row('com', '', '1,99 €', ' #'))}${gross}${note}`, ['com']);
    expect(ok.failed).toEqual([]);
    expect(ok.offers[0]?.price.year1).toBe(199);
  });
});
