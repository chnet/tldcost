import { describe, expect, it } from 'vitest';
import { euroCents, ONECOM_PRICE_LIST, oneCom, parseCell } from '../src/adapters/one-com.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, fixture, testHttp } from './helpers.js';

const ROBOTS = {
  'https://www.one.com/robots.txt': {
    body: 'User-agent: *\nDisallow: /admin/\nDisallow: /de/bestellung\n',
  },
};
const run = (body: string, tlds: readonly string[] = MVP_TLDS) =>
  oneCom.fetch(ctxFor(testHttp({ ...ROBOTS, [ONECOM_PRICE_LIST]: { body } }).http, tlds));
const page = fixture('one-com/preise.html');

/** A price list with one row (cells as given) and the notes under the table. */
const listWith = (cells: { reg: string; transfer?: string; renewal: string }, notes = true) =>
  `<table><tbody><tr data-pub-price-row><th scope="row" class="x">\n.de\n</th>` +
  `<td data-label='Registrierung'>${cells.reg}</td>` +
  (cells.transfer === undefined ? '' : `<td data-label='Umzug'>${cells.transfer}</td>`) +
  `<td data-label='Erneuerung'>${cells.renewal}</td></tr></tbody></table>` +
  (notes ? '<p>Sonderangebote gelten nur für den ersten Vertragszeitraum.</p>' : '') +
  '<p>Alle Preise inkl. 19% MwSt.</p>';

describe('one.com adapter', () => {
  it('maps the public price list (gross, per year, first-year offers as promo)', async () => {
    const result = await run(page);
    expect(result.notOffered).toEqual(['dev', 'app']);
    expect(result.skipped).toEqual([{ tld: 'ai', reason: expect.stringMatching(/multi-year/) }]);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.offers).toHaveLength(17);
    const de = result.offers.find((o) => o.tld === 'de');
    expect(de).toMatchObject({
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'year',
        setup: 0,
        year1: 90,
        year1_regular: 1799,
        renewal: 1799,
        transfer_in: 90,
        term_years: 1,
        renewal_term_years: 1,
      },
      promo: {
        conditions: 'Sonderangebote gelten nur für den ersten Vertragszeitraum.',
        valid_until: null,
      },
      evidence: {
        source_url: ONECOM_PRICE_LIST,
        fetched_at: '2026-11-13T06:00:00Z',
        method: 'scrape',
        confidence: 'high',
      },
    });
    expect(de?.evidence.evidence_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // reduced without the hosting badge
    expect(result.offers.find((o) => o.tld === 'berlin')).toMatchObject({
      price: { year1: 4784, year1_regular: 7789, renewal: 7789 },
      promo: { conditions: 'Sonderangebote gelten nur für den ersten Vertragszeitraum.' },
    });
    // current price equals the struck-through one: no promo
    expect(result.offers.find((o) => o.tld === 'xyz')).toMatchObject({
      price: { year1: 2388, year1_regular: 2388, renewal: 2388 },
      promo: null,
    });
    expect(result.offers).toMatchSnapshot();
  });

  it('reads multi-level TLDs and the other price notations', async () => {
    const result = await run(page, ['co.uk', 'nl', 'travel', 'lotto']);
    expect(result.failed).toEqual([]);
    const by = (t: string) => result.offers.find((o) => o.tld === t)?.price;
    expect(by('nl')).toMatchObject({ year1: 400, year1_regular: 1949 });
    expect(by('travel')).toMatchObject({ year1: 6600, year1_regular: 20999 });
    expect(by('lotto')).toMatchObject({ year1: 279109, renewal: 279109 });
    expect(by('co.uk')).toBeDefined();
  });

  it('parses German prices and cells', () => {
    expect(euroCents('17,99')).toBe(1799);
    expect(euroCents(' 4,- ')).toBe(400);
    expect(euroCents('2.791,09')).toBe(279109);
    expect(() => euroCents('17.99')).toThrow(/not a German euro price/);
    expect(() => euroCents('Gratis')).toThrow(/not a German euro price/);
    expect(parseCell('  \n ')).toBeNull();
    expect(parseCell('<span>28,80</span>')).toEqual({ current: 2880, regular: null });
    expect(
      parseCell(
        '<span class="pubPriceList-badge">Gratis mit Hosting</span> 0,90 <span class="line-through">17,99</span>',
      ),
    ).toEqual({ current: 90, regular: 1799 });
  });

  it('reports rows it cannot trust per TLD', async () => {
    const above = await run(
      listWith({ reg: '9,99<span class="line-through">5,00</span>', renewal: '5,00' }),
      ['de'],
    );
    expect(above.failed).toEqual([{ tld: 'de', reason: expect.stringMatching(/above/) }]);

    const noNote = await run(
      listWith({ reg: '1,00<span class="line-through">5,00</span>', renewal: '5,00' }, false),
      ['de'],
    );
    expect(noNote.failed).toEqual([
      { tld: 'de', reason: expect.stringMatching(/without the note/) },
    ]);

    const missing = await run(listWith({ reg: '1,00', renewal: '' }), ['de']);
    expect(missing.failed).toEqual([{ tld: 'de', reason: expect.stringMatching(/missing/) }]);

    await expect(run(listWith({ reg: 'auf Anfrage', renewal: '5,00' }), ['de'])).rejects.toThrow(
      /not a German euro price/,
    );
  });

  it('warns when the standard price differs from renewal; no transfer column means null', async () => {
    const result = await run(
      listWith({ reg: '1,00<span class="line-through">5,00</span>', renewal: '6,00' }),
      ['de'],
    );
    expect(result.warnings).toEqual([
      '.de: standard registration price 500 differs from renewal 600',
    ]);
    expect(result.offers[0]?.price).toMatchObject({ year1: 100, year1_regular: 500, renewal: 600 });
    expect(result.offers[0]?.price.transfer_in).toBeNull();
  });

  it('throws when the page no longer looks like the price list', async () => {
    await expect(run('<p>Wartung</p>')).rejects.toThrow(/without "Alle Preise inkl. 19% MwSt."/);
    await expect(run('<p>Alle Preise inkl. 19% MwSt.</p>')).rejects.toThrow(/no price rows/);
    // a row without a TLD header is not a price row
    await expect(
      run(
        '<tr data-pub-price-row><th scope="row">Summe</th><td>1,00</td></tr>' +
          '<p>Alle Preise inkl. 19% MwSt.</p>',
      ),
    ).rejects.toThrow(/no price rows/);
  });
});
