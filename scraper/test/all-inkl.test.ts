import { describe, expect, it } from 'vitest';
import {
  ADDON_ONLY,
  ALLINKL_SOURCE_URL,
  allinkl,
  parsePrice,
  parseTable,
} from '../src/adapters/all-inkl.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, fixture, testHttp } from './helpers.js';

const PAGE = fixture('all-inkl/preise.html');
const TARIFF = ['de', 'com', 'net', 'org', 'eu', 'info', 'at', 'ch', 'biz'];
const run = (html: string, tlds: readonly string[] = MVP_TLDS) => {
  const { http } = testHttp({
    'https://all-inkl.com/robots.txt': { body: 'User-agent: *\nDisallow: /members\n' },
    [ALLINKL_SOURCE_URL]: { body: html, headers: { 'content-type': 'text/html' } },
  });
  return allinkl.fetch(ctxFor(http, tlds, '2026-11-15T05:00:00Z'));
};
/** The fixture with one exact snippet replaced (fails the test if it is not there). */
const edit = (from: string | RegExp, to: string) => {
  expect(PAGE).toMatch(from);
  return PAGE.replace(from, to);
};

describe('all-inkl price text', () => {
  it('reads gross euro amounts with the footnote star', () => {
    expect(parsePrice('9,90 €*')).toBe(990);
    expect(parsePrice('0,00 €*')).toBe(0);
    expect(parsePrice('1.234,50 €*')).toBe(123450);
  });

  it('rejects other formats', () => {
    for (const bad of ['9,90 €', '9,90 €**', '9.90 €*', 'auf Anfrage', '12.34,00 €*']) {
      expect(() => parsePrice(bad), bad).toThrow(/unexpected price text/);
    }
  });
});

describe('all-inkl price table', () => {
  it('parses the rows with the domain-plan flag and the two-year marker', () => {
    const rows = parseTable(PAGE);
    expect(rows).toHaveLength(21);
    expect(rows.filter((r) => r.domainTariff).map((r) => r.tld)).toEqual([
      'de',
      'at',
      'com',
      'net',
      'org',
      'info',
      'biz',
      'eu',
      'ch',
    ]);
    expect(rows.find((r) => r.tld === 'de')).toEqual({
      tld: 'de',
      domainTariff: true,
      twoYears: false,
      setup: '0,00 €*',
      yearly: '9,90 €*',
    });
    expect(rows.find((r) => r.tld === 'io')).toMatchObject({
      domainTariff: false,
      setup: '9,90 €*',
      yearly: '69,90 €*',
    });
    expect(rows.find((r) => r.tld === 'gr')?.twoYears).toBe(true);
    // a row without a class attribute is not a domain plan
    const noClass = edit(
      /<tr class="domain-classic domain-tarif">(\s*<td><strong><a href="https:\/\/all-inkl\.com\/domains\/de-tld">)/,
      '<tr>$1',
    );
    expect(parseTable(noClass).find((r) => r.tld === 'de')?.domainTariff).toBe(false);
  });

  it('fails closed when the page layout changes', () => {
    expect(() => parseTable('<p>nothing</p>')).toThrow(/expected one price table, found 0/);
    expect(() => parseTable(PAGE.replace('Höhe von 19%', 'Höhe von 20%'))).toThrow(
      /VAT note \(gross prices\) not found/,
    );
    expect(() => parseTable(PAGE.replace('>Jahresgebühr<', '>Monatsgebühr<'))).toThrow(
      /unexpected table header/,
    );
    expect(() => parseTable(PAGE.replace(/<thead>[\s\S]*?<\/thead>/, ''))).toThrow(
      /unexpected table header undefined/,
    );
    const badTld = edit(/>\.de<\/a>/, '>Deutschland-Paket</a>');
    expect(() => parseTable(badTld)).toThrow(/unexpected row "Deutschland-Paket/);
    const threeCells = edit(/(<td>Deutschland<\/td>)/, '');
    expect(() => parseTable(threeCells)).toThrow(/unexpected row/);
    const emptyRow = edit('<tbody>', '<tbody><tr></tr>');
    expect(() => parseTable(emptyRow)).toThrow(/unexpected row ""/);
    const extraAttr = edit(
      /<tr class="domain-classic domain-tarif">(\s*<td><strong><a href="https:\/\/all-inkl\.com\/domains\/de-tld">)/,
      '<tr class="domain-classic domain-tarif" data-x="1">$1',
    );
    expect(() => parseTable(extraAttr)).toThrow(/found 22 <tr> but parsed 21 rows/);
    const noRows = edit(/(<table class="table-domains">)[\s\S]*?(<\/table>)/, '$1$2');
    expect(() => parseTable(noRows)).toThrow(/unexpected table header undefined/);
  });
});

describe('all-inkl adapter', () => {
  it('writes the domain-plan TLDs and skips the add-on-only ones (owner rule)', async () => {
    const result = await run(PAGE);
    expect(result.offers.map((o) => o.tld)).toEqual(TARIFF);
    expect(result.notOffered).toEqual(['ai']);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual(
      MVP_TLDS.filter((t) => !TARIFF.includes(t) && t !== 'ai').map((tld) => ({
        tld,
        reason: ADDON_ONLY,
      })),
    );
    expect(result.offers[0]).toEqual({
      tld: 'de',
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'year',
        setup: 0,
        year1: 990,
        year1_regular: 990,
        renewal: 990,
        term_years: 1,
        renewal_term_years: 1,
      },
      promo: null,
      evidence: {
        source_url: ALLINKL_SOURCE_URL,
        fetched_at: '2026-11-15T05:00:00Z',
        method: 'scrape',
        evidence_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        confidence: 'medium',
      },
    });
    expect(Object.fromEntries(result.offers.map((o) => [o.tld, [o.price.setup, o.price.renewal]])))
      .toMatchInlineSnapshot(`
      {
        "at": [
          0,
          1990,
        ],
        "biz": [
          0,
          1490,
        ],
        "ch": [
          0,
          2990,
        ],
        "com": [
          0,
          1490,
        ],
        "de": [
          0,
          990,
        ],
        "eu": [
          0,
          1490,
        ],
        "info": [
          0,
          1490,
        ],
        "net": [
          0,
          1490,
        ],
        "org": [
          0,
          1490,
        ],
      }
    `);
  });

  it('skips two-year rows and reports unreadable prices per TLD', async () => {
    // .gr is billed two years in advance; pretend it were a domain-plan row
    const gr = edit(
      /<tr class="domain-classic">(\s*<td><strong>\.gr<\/strong>\*\*)/,
      '<tr class="domain-classic domain-tarif">$1',
    );
    const two = await run(gr, ['gr']);
    expect(two.skipped).toEqual([
      { tld: 'gr', reason: 'billed two years in advance, per-year vs per-term price not stated' },
    ]);
    const bad = edit(
      /(\.com<\/a><\/strong><\/td>\s*<td>[^<]*<\/td>\s*<td>)0,00&nbsp;€\*/,
      '$1auf Anfrage',
    );
    const result = await run(bad, ['com', 'de']);
    expect(result.failed).toEqual([{ tld: 'com', reason: 'unexpected price text "auf Anfrage"' }]);
    expect(result.offers.map((o) => o.tld)).toEqual(['de']);
  });
});
