import { describe, expect, it } from 'vitest';
import {
  euroCents,
  parseFootnotes,
  parsePromo,
  parseRows,
  UD_PRICE_LIST,
  unitedDomains,
} from '../src/adapters/united-domains.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, fixture, testHttp } from './helpers.js';

const ROBOTS = {
  'https://www.united-domains.de/robots.txt': {
    body: 'User-agent: *\nDisallow: /whois/\nDisallow: /suchergebnis\n',
  },
};
const run = (body: string, tlds: readonly string[] = MVP_TLDS) =>
  unitedDomains.fetch(ctxFor(testHttp({ ...ROBOTS, [UD_PRICE_LIST]: { body } }).http, tlds));
const page = fixture('united-domains/preisliste.html');

const SECTION = '<div class="mol-price-list__rows mol-price-list--tlds">';
const config = (c: object | string) =>
  `<script>var UdFrontendConfig = ${typeof c === 'string' ? c : JSON.stringify(c)};</script>`;
const DE_CONFIG = config({ LOCALE: 'de_DE', VAT_RATE: 1.19, VAT_TEXT: 'inkl. 19 % MwSt.' });
const NOTES =
  DE_CONFIG +
  '<div class="vat-note">In den Preisen ist die Mehrwertsteuer (<a href="/mwst-hinweis/">MwSt.</a>) ' +
  'in Höhe von 19 % enthalten. <b>Es fallen keine Einrichtungsgebühren an.</b></div>';

interface RowSpec {
  label?: string;
  price?: string;
  dataPrice?: string | null;
  unit?: string | null;
}
/** One TLD row in the page's markup. */
const row = ({ label = '&#46;de', price = '5 €', dataPrice = '5', unit = '/Jahr' }: RowSpec) =>
  `<div\n class="mol-price-list__row"\n data-searchable-text="${label}"` +
  (dataPrice === null ? '' : ` data-price="${dataPrice}"`) +
  '>\n<div\n class="\n mol-price-list__row-cell\n mol-price-list__row-name\n ">\n' +
  `${label}\n</div>\n<div class="mol-price-list__row-cell mol-price-list__row-price"><div>` +
  `<span class="mol-price-list__row-price-number">${price}</span><!--\n-->` +
  (unit === null
    ? ''
    : `<span class="mol-price-list__row-price-unit"><!--\n-->${unit}<!--\n--></span>`) +
  '</div></div>\n</div>\n';
const footnote = (n: number, text: string) =>
  `<div class="footnote">\n<sup>${n}</sup> ${text}\n</div>`;
const listWith = (rows: RowSpec[], notes: string[] = [], tail = NOTES) =>
  `${SECTION}${rows.map(row).join('')}</div>${notes.join('')}${tail}`;
const DE_PROMO =
  '.de-Aktion: 5&nbsp;&euro; (inkl. 19 % MwSt.) im ersten Jahr für Neuregistrierungen von ' +
  '.de-Domains. Ab dem 2. Jahr 19&nbsp;&euro; (inkl. 19 % MwSt.) / Jahr. Vertragslaufzeit mind. 12 Monate.';

describe('united-domains adapter', () => {
  it('maps the public price list (gross, per year, first-year promos from the footnotes)', async () => {
    const result = await run(page);
    expect(result.notOffered).toEqual([]);
    expect(result.skipped).toEqual([{ tld: 'ai', reason: expect.stringMatching(/multi-year/) }]);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.offers).toHaveLength(19);
    const de = result.offers.find((o) => o.tld === 'de');
    expect(de).toMatchObject({
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'year',
        setup: 0,
        year1: 500,
        year1_regular: null,
        renewal: 1900,
        term_years: 1,
        renewal_term_years: 1,
        transfer_in: null,
      },
      promo: {
        conditions:
          '.de-Aktion: 5 € (inkl. 19 % MwSt.) im ersten Jahr für Neuregistrierungen von .de-Domains. ' +
          'Ab dem 2. Jahr 19 € (inkl. 19 % MwSt.) / Jahr. Vertragslaufzeit mind. 12 Monate.',
        valid_until: null,
      },
      evidence: {
        source_url: UD_PRICE_LIST,
        fetched_at: '2026-11-13T06:00:00Z',
        method: 'scrape',
        confidence: 'high',
      },
    });
    expect(de?.evidence.evidence_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // regular price every year: no promo
    expect(result.offers.find((o) => o.tld === 'xyz')).toMatchObject({
      price: { year1: 1900, year1_regular: 1900, renewal: 1900 },
      promo: null,
    });
    // the .io footnote has a stray "€" and its own wording
    expect(result.offers.find((o) => o.tld === 'io')?.price).toMatchObject({
      year1: 4000,
      renewal: 9900,
    });
    expect(result.offers).toMatchSnapshot();
  });

  it('keeps full labels: multi-level, punycode IDN, thousands; "unverbindlich" fails', async () => {
    const result = await run(page, ['com.de', 'co.at', 'koeln', 'xn--fiqs8s', 'eg', 'xn--fiqz9s']);
    const by = (t: string) => result.offers.find((o) => o.tld === t)?.price;
    expect(by('com.de')).toMatchObject({ year1: 2900, renewal: 2900 });
    expect(by('co.at')).toBeDefined();
    expect(by('koeln')).toBeDefined();
    expect(by('xn--fiqs8s')).toBeDefined();
    expect(by('eg')).toMatchObject({ year1: 101900 });
    expect(result.failed).toEqual([
      { tld: 'xn--fiqz9s', reason: 'not a euro price: "unverbindlich"' },
    ]);
    // "de" is not mistaken for "com.de", and product rows after the TLD section are not TLDs
    const rows = parseRows(page);
    expect(rows.get('de')?.price).toBe('5 €');
    expect([...rows.keys()].every((k) => /^[a-z0-9.-]+$/.test(k))).toBe(true);
    expect(rows.size).toBe(26);
  });

  it('parses prices and promo footnotes', () => {
    expect(euroCents('5 €')).toBe(500);
    expect(euroCents(' 1.019 € ')).toBe(101900);
    expect(euroCents('7,50 €')).toBe(750);
    expect(() => euroCents('5')).toThrow(/not a euro price/);
    expect(() => euroCents('1019.00 €')).toThrow(/not a euro price/);
    const note = DE_PROMO.replaceAll('&nbsp;&euro;', ' €');
    expect(parsePromo(note, 'de', 500)).toEqual({ renewal: 1900, conditions: note });
    // footnote without the dot, multi-level label
    expect(
      parsePromo(
        'com.de-Aktion: 9 € (inkl. 19 % MwSt.) im ersten Jahr x. Ab dem 2. Jahr 29 €/Jahr.',
        'com.de',
        900,
      ),
    ).toMatchObject({ renewal: 2900 });
    expect(() => parsePromo(note, 'com.de', 500)).toThrow(/not a first-year promo for \.com\.de/);
    expect(() => parsePromo(note, 'de', 600)).toThrow(/differs from the list price/);
    expect(() => parsePromo(note.replace(/Ab dem 2\. Jahr/, 'Danach'), 'de', 500)).toThrow(
      /one follow-up price/,
    );
    expect(() => parsePromo(`${note} Ab dem 2. Jahr 20 €.`, 'de', 500)).toThrow(/one follow-up/);
    expect(() => parsePromo(`${note}${' x'.repeat(250)}`, 'de', 500)).toThrow(/500 characters/);
  });

  it('reports TLDs it cannot trust, per TLD', async () => {
    const promo = await run(listWith([{ unit: '/1. Jahr<sup>1</sup>' }], [footnote(1, DE_PROMO)]), [
      'de',
    ]);
    expect(promo.offers[0]?.price).toMatchObject({ year1: 500, renewal: 1900 });

    const cases: [RowSpec, string[], RegExp][] = [
      [{ unit: '/1. Jahr<sup>2</sup>' }, [footnote(1, DE_PROMO)], /footnote 2 missing/],
      [{ unit: '/1. Jahr' }, [], /unknown unit "\/1\. Jahr" \(footnote null\)/],
      [
        { unit: '/Jahr<sup>1</sup>' },
        [footnote(1, DE_PROMO)],
        /unknown unit "\/Jahr" \(footnote 1\)/,
      ],
      [{ unit: '/2 Jahre' }, [], /unknown unit/],
      [{ unit: null }, [], /unknown unit null/],
      [{ dataPrice: '6' }, [], /data-price "6" differs from 5 €/],
      [{ dataPrice: null }, [], /data-price null/],
    ];
    for (const [spec, notes, reason] of cases) {
      const result = await run(listWith([spec], notes), ['de', 'com']);
      expect(result.notOffered).toEqual(['com']);
      expect(result.failed).toEqual([{ tld: 'de', reason: expect.stringMatching(reason) }]);
      expect(result.offers).toEqual([]);
    }
  });

  it('throws when the page, the section or a row is not as expected', async () => {
    await expect(run('<p>Wartung</p>')).rejects.toThrow(/without "In den Preisen/);
    await expect(
      run(NOTES.replace('<b>Es fallen keine Einrichtungsgebühren an.</b>', '')),
    ).rejects.toThrow(/without "Es fallen keine/);
    await expect(run(NOTES)).rejects.toThrow(/exactly one TLD section/);
    await expect(run(`${SECTION}</div>${SECTION}</div>${NOTES}`)).rejects.toThrow(
      /exactly one TLD section/,
    );
    await expect(run(`${SECTION}</div>${NOTES}`)).rejects.toThrow(/no TLD rows/);
    await expect(run(listWith([{}, { label: '&#46;DE' }]))).rejects.toThrow(
      /duplicate TLD label \.de/,
    );
    await expect(run(listWith([{ label: 'Summe' }]))).rejects.toThrow(/unexpected TLD row/);
    await expect(run(listWith([{ label: '&#46;de x' }]))).rejects.toThrow(/unexpected TLD row/);
    await expect(
      run(listWith([{ price: '5 €</span><span class="mol-price-list__row-price-number">6 €' }])),
    ).rejects.toThrow(/unexpected TLD row/);
    // a row whose start marker changed is swallowed by its neighbour: label count gives it away
    const changed = row({ label: '&#46;com' }).replace(
      'class="mol-price-list__row"',
      'class="mol-price-list__row is-top"',
    );
    await expect(run(`${SECTION}${row({})}${changed}</div>${NOTES}`)).rejects.toThrow(
      /2 TLD labels in 1 rows/,
    );
    // label counts match, but one row has none and the next has two
    const noName = row({}).replace('mol-price-list__row-name', 'mol-price-list__row-label');
    const twoNames = row({ label: '&#46;com' }).replace(
      '<div class="mol-price-list__row-cell mol-price-list__row-price">',
      '<div class="mol-price-list__row-cell mol-price-list__row-name">&#46;net</div>' +
        '<div class="mol-price-list__row-cell mol-price-list__row-price">',
    );
    await expect(run(`${SECTION}${noName}${twoNames}</div>${NOTES}`)).rejects.toThrow(
      /unexpected TLD row/,
    );
    await expect(
      run(listWith([{}], [footnote(1, DE_PROMO), footnote(1, DE_PROMO)])),
    ).rejects.toThrow(/duplicate footnote 1/);
  });

  it('only accepts the German price display (server-side country detection)', async () => {
    const page1 = listWith([{}]);
    await expect(run(page1)).resolves.toMatchObject({ offers: [{ tld: 'de' }] });
    // the real page has more variables after the config in the same script
    const more = page1.replace(DE_CONFIG, DE_CONFIG.replace('</script>', ' var x = {};</script>'));
    await expect(run(more)).resolves.toMatchObject({ offers: [{ tld: 'de' }] });
    await expect(run(page1.replace(DE_CONFIG, ''))).rejects.toThrow(
      /one UdFrontendConfig, found 0/,
    );
    await expect(run(page1 + DE_CONFIG)).rejects.toThrow(/one UdFrontendConfig, found 2/);
    await expect(run(page1.replace(DE_CONFIG, config('{LOCALE: 1}')))).rejects.toThrow(/not JSON/);
    await expect(
      run(page1.replace(DE_CONFIG, config({ LOCALE: 'de_AT', VAT_RATE: 1.2 }))),
    ).rejects.toThrow(/LOCALE "de_AT", VAT_RATE 1.2\): country detection/);
    await expect(
      run(page1.replace(DE_CONFIG, config({ LOCALE: 'de_DE', VAT_RATE: 1 }))),
    ).rejects.toThrow(/VAT_RATE 1\)/);
    await expect(run(page1.replace(DE_CONFIG, config({})))).rejects.toThrow(
      /LOCALE undefined, VAT_RATE undefined/,
    );
  });

  it('reads footnotes verbatim without markup', () => {
    expect(
      parseFootnotes(
        footnote(4, 'Aktion gilt nicht für <a href="/x">Premium-Domains</a>.') + footnote(5, 'b'),
      ),
    ).toEqual(
      new Map([
        ['4', 'Aktion gilt nicht für Premium-Domains.'],
        ['5', 'b'],
      ]),
    );
  });
});
