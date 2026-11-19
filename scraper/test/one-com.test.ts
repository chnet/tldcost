import { describe, expect, it } from 'vitest';
import {
  checkUsDisplay,
  euroCents,
  ONECOM_PRICE_LIST,
  oneCom,
  parseCell,
} from '../src/adapters/one-com.js';
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
/**
 * SYNTHETIC US display, not a fetched page: the German fixture under the settings the data run's
 * runners were shown (countryCode, showVAT, vatPercentage as in the run log of 2026-11-19), plus the
 * assumed currency USD in onecomConfig and the heading, without the gross note. A German address
 * cannot see the real page; the rows and amounts are the German ones, unchanged.
 */
const usPage = [
  ["onecomConfig.showVAT = 'true';", "onecomConfig.showVAT = 'false';"],
  ["onecomConfig.vatPercentage = '19';", "onecomConfig.vatPercentage = '0';"],
  ["onecomConfig.country = 'Deutschland';", "onecomConfig.country = 'United States';"],
  [
    "onecomConfig.countryCode = 'DE';",
    'onecomConfig.countryCode = \'US\';\nonecomConfig.currency = "USD";',
  ],
  [
    '<table class="pubPriceList-table',
    '<h1 class="pubPriceList-title">\n\t\t\tDomainpreise in USD\n\t\t</h1>\n<table class="pubPriceList-table',
  ],
  ['Alle Preise inkl. 19% MwSt.', ''],
].reduce((html, [from, to]) => {
  if (!html.includes(from as string)) throw new Error(`fixture changed: ${from}`);
  return html.replace(from as string, to as string);
}, page);
const US_LINE = {
  currency: 'onecomConfig.currency = "USD";',
  heading: 'Domainpreise in USD',
  showVAT: "onecomConfig.showVAT = 'false';",
};

/** The inline country and VAT settings as the German page has them (overrides per key). */
const config = (over: Record<string, string> = {}) =>
  '<script>' +
  Object.entries({ showVAT: 'true', vatPercentage: '19', countryCode: 'DE', ...over })
    .map(([k, v]) => `onecomConfig.${k} = '${v}';`)
    .join('\n') +
  '</script>';
const DE = config();
/** The settings lines exactly as in the fixture. */
const DE_LINE = {
  countryCode: "onecomConfig.countryCode = 'DE';",
  showVAT: "onecomConfig.showVAT = 'true';",
  vatPercentage: "onecomConfig.vatPercentage = '19';",
};

/** A price list with one row (cells as given) and the notes under the table. */
const listWith = (cells: { reg: string; transfer?: string; renewal: string }, notes = true) =>
  DE +
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
    await expect(run(`${DE}<p>Wartung</p>`)).rejects.toThrow(
      /without "Alle Preise inkl. 19% MwSt.".*VAT statement changed/,
    );
    await expect(run(`${DE}<p>Alle Preise inkl. 19% MwSt.</p>`)).rejects.toThrow(/no price rows/);
    // a row without a TLD header is not a price row
    await expect(
      run(
        DE +
          '<tr data-pub-price-row><th scope="row">Summe</th><td>1,00</td></tr>' +
          '<p>Alle Preise inkl. 19% MwSt.</p>',
      ),
    ).rejects.toThrow(/no price rows/);
  });

  it('accepts the gross note with other whitespace', async () => {
    const list = page.replace('Alle Preise inkl. 19% MwSt.', 'Alle Preise inkl.\n\t19 % MwSt.');
    expect(list).not.toBe(page);
    expect((await run(list)).offers).toHaveLength(17);
  });

  it("throws on another country's price display (server-side country detection)", async () => {
    // a visitor outside Germany: other country, no VAT shown, no gross note (the US display has a
    // branch of its own, see below)
    const abroad = page
      .replace(DE_LINE.countryCode, "onecomConfig.countryCode = 'GB';")
      .replace(DE_LINE.showVAT, "onecomConfig.showVAT = 'false';")
      .replace(DE_LINE.vatPercentage, "onecomConfig.vatPercentage = '0';")
      .replace('Alle Preise inkl. 19% MwSt.', '');
    await expect(run(abroad)).rejects.toThrow(
      /^not the German price display \(countryCode "GB", showVAT "false", vatPercentage "0", notice "Geld-zurück-Garantie[^"]*"\): country detection changed the prices$/,
    );
    // German country code but another VAT rate, even with the note still on the page
    await expect(
      run(page.replace(DE_LINE.vatPercentage, "onecomConfig.vatPercentage = '20';")),
    ).rejects.toThrow(/not the German price display \(.*vatPercentage "20"/);
    await expect(
      run(page.replace(DE_LINE.showVAT, "onecomConfig.showVAT = 'false';")),
    ).rejects.toThrow(/not the German price display \(.*showVAT "false"/);
  });

  it('throws when the country and VAT settings are missing', async () => {
    await expect(run(page.replace(DE_LINE.countryCode, ''))).rejects.toThrow(
      /without the onecomConfig country and VAT settings \(countryCode null, .*\): layout changed/,
    );
  });

  describe('US display (owner decision 2026-11-19, Fremdmarkt; synthetic fixture)', () => {
    it('records the US prices as quoted: USD, net, foreign_market with the literal row', async () => {
      const logs: string[] = [];
      const ctx = ctxFor(
        testHttp({ ...ROBOTS, [ONECOM_PRICE_LIST]: { body: usPage } }).http,
        MVP_TLDS,
      );
      const result = await oneCom.fetch({ ...ctx, log: (m) => logs.push(m) });
      expect(result.failed).toEqual([]);
      expect(result.offers).toHaveLength(17);
      expect(logs).toEqual([
        expect.stringMatching(/^one-com: US price display \(Domainpreise in USD\), \d+ rows/),
      ]);
      const de = result.offers.find((o) => o.tld === 'de');
      expect(de).toMatchObject({
        currency: 'USD',
        vat_included: false,
        price: { year1: 90, year1_regular: 1799, renewal: 1799, transfer_in: 90 },
        promo: { conditions: 'Sonderangebote gelten nur für den ersten Vertragszeitraum.' },
        foreign_market: { country: 'US', currency: 'USD' },
        evidence: { source_url: ONECOM_PRICE_LIST, method: 'scrape', confidence: 'high' },
      });
      // the quote is the page's own text: heading and the row of the TLD
      expect(de?.foreign_market?.quote).toMatch(
        /^Domainpreise in USD: \.de Gratis mit Hosting 0,90 17,99 Gratis mit Hosting 0,90 17,99 17,99$/,
      );
      for (const o of result.offers) {
        expect(o.foreign_market?.quote).toContain(`.${o.tld} `);
        expect(o.foreign_market?.quote.length).toBeLessThanOrEqual(500);
      }
    });

    it('the German page stays on the German branch: EUR, gross, no foreign_market', async () => {
      const result = await run(page);
      for (const o of result.offers) {
        expect(o).toMatchObject({ currency: 'EUR', vat_included: true });
        expect(o.foreign_market).toBeUndefined();
      }
    });

    it('throws for a US view in EUR: no decision for it', async () => {
      await expect(
        run(usPage.replace(US_LINE.currency, 'onecomConfig.currency = "EUR";')),
      ).rejects.toThrow(
        /^US view in EUR \(countryCode "US", .*currency "EUR".*\): owner decision needed$/,
      );
    });

    it('throws unless config and heading both say USD', async () => {
      await expect(
        run(usPage.replace(US_LINE.currency, 'onecomConfig.currency = "GBP";')),
      ).rejects.toThrow(/US view without the currency USD in config and heading .*layout changed/);
      await expect(run(usPage.replace(US_LINE.heading, 'Domainpreise in EUR'))).rejects.toThrow(
        /US view without the currency USD in config and heading \(.*heading "Domainpreise in EUR"/,
      );
      await expect(
        run(usPage.replace(/<h1 class="pubPriceList-title">[\s\S]*?<\/h1>/, '')),
      ).rejects.toThrow(/heading null\b.*layout changed/);
      await expect(run(usPage.replace(US_LINE.currency, ''))).rejects.toThrow(
        /currency null.*layout changed/,
      );
    });

    it('throws when the US display shows VAT or has no notices', async () => {
      // showVAT true with country US: not the US display, not the German one either
      await expect(
        run(usPage.replace(US_LINE.showVAT, "onecomConfig.showVAT = 'true';")),
      ).rejects.toThrow(/^not the US price display \(countryCode "US", showVAT "true"/);
      await expect(
        run(
          usPage.replace("onecomConfig.vatPercentage = '0';", "onecomConfig.vatPercentage = '19';"),
        ),
      ).rejects.toThrow(/not the US price display/);
      // a VAT statement in the notices, or the German gross note anywhere
      await expect(
        run(usPage.replace('Geld-zurück-Garantie', 'Alle Preise zzgl. MwSt. Geld-zurück-Garantie')),
      ).rejects.toThrow(/US view with a VAT statement .*VAT statement changed/);
      await expect(
        run(usPage.replace('</body>', '<p>Alle Preise inkl. 19% MwSt.</p></body>')),
      ).rejects.toThrow(/US view with a VAT statement/);
      await expect(run(usPage.replace(/<p class="notices">[\s\S]*?<\/p>/, ''))).rejects.toThrow(
        /US view without the notices under the table/,
      );
    });

    it('throws when the US display has no price rows', () => {
      expect(() => checkUsDisplay(usPage)).not.toThrow();
      return expect(
        run(usPage.replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody></tbody>')),
      ).rejects.toThrow(/no price rows/);
    });

    it('a German display other than DE/19 % still throws on the German branch', async () => {
      // e.g. Austria: not the US branch, the German check names it
      await expect(
        run(page.replace(DE_LINE.countryCode, "onecomConfig.countryCode = 'AT';")),
      ).rejects.toThrow(/^not the German price display \(countryCode "AT"/);
    });
  });
});
