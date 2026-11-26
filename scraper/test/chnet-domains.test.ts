import { describe, expect, it } from 'vitest';
import {
  CHNET_DOMAINS_SOURCE_URL,
  LISTED_TLDS,
  NOT_LISTED,
  TWO_YEAR,
  chnetDomains,
  parsePrice,
  parseTable,
} from '../src/adapters/chnet-domains.js';
import { MVP_TLDS } from '../src/tlds.js';
import { UA, ctxFor, fixture, testHttp } from './helpers.js';

const PAGE = fixture('chnet-domains/preise.html');
const run = (html: string, tlds: readonly string[] = MVP_TLDS) => {
  const { http, calls } = testHttp({
    'https://chnet.domains/robots.txt': { body: 'User-agent: *\nAllow: /\n' },
    [CHNET_DOMAINS_SOURCE_URL]: { body: html, headers: { 'content-type': 'text/html' } },
  });
  return { calls, result: chnetDomains.fetch(ctxFor(http, tlds, '2026-11-25T06:00:00Z')) };
};
/** The fixture with one exact snippet replaced (fails the test if it is not there). */
const edit = (from: string | RegExp, to: string) => {
  expect(PAGE).toMatch(from);
  return PAGE.replace(from, to);
};
const DE_ROW = /<tr data-tld="de" data-cat="other">[\s\S]*?<\/tr>/;

describe('chnet.domains price text', () => {
  it('reads gross euro amounts', () => {
    expect(parsePrice('5,50 €')).toBe(550);
    expect(parsePrice('75,54 €')).toBe(7554);
    expect(parsePrice('1.234,50 €')).toBe(123450);
  });

  it('rejects other formats', () => {
    for (const bad of ['5,50', '5,50 €*', '5.50 €', 'auf Anfrage', '12.34,00 €']) {
      expect(() => parsePrice(bad), bad).toThrow(/unexpected price text/);
    }
  });
});

describe('chnet.domains price table', () => {
  it('parses the rows with the mark for special registry requirements', () => {
    const rows = parseTable(PAGE);
    expect(rows).toHaveLength(17);
    expect(rows.filter((r) => r.specialTerms).map((r) => r.tld)).toEqual([
      'app',
      'berlin',
      'dev',
      'eu',
    ]);
    expect(rows.find((r) => r.tld === 'de')).toEqual({
      tld: 'de',
      specialTerms: false,
      yearly: '5,50 €',
    });
    expect(rows.find((r) => r.tld === 'eu')).toEqual({
      tld: 'eu',
      specialTerms: true,
      yearly: '12,71 €',
    });
  });

  it('fails closed when the page layout changes', () => {
    expect(() => parseTable('<p>nothing</p>')).toThrow(/expected one price table, found 0/);
    const twoTables = edit('</table>', '</table><table class="cd-pl-table"></table>');
    expect(() => parseTable(twoTables)).toThrow(/expected one price table, found 2/);
    expect(() =>
      parseTable(PAGE.replace('inklusive 19 % USt., abgerechnet', 'abgerechnet')),
    ).toThrow(/price basis note not found/);
    expect(() => parseTable(PAGE.replace('>Preis pro Jahr<', '>Preis pro Monat<'))).toThrow(
      /unexpected table header/,
    );
    expect(() => parseTable(PAGE.replace(/<thead>[\s\S]*?<\/thead>/, ''))).toThrow(
      /unexpected table header undefined/,
    );
    const badTld = edit('>.de</a>', '>Deutschland-Paket</a>');
    expect(() => parseTable(badTld)).toThrow(/unexpected row "Deutschland-Paket/);
    const otherTld = edit(
      '<tr data-tld="de" data-cat="other">',
      '<tr data-tld="com" data-cat="other">',
    );
    expect(() => parseTable(otherTld)).toThrow(/unexpected row "\.de/);
    const otherMark = edit(
      /(<a href="\/eu-domain-registrieren\/">\.eu<\/a> <span class="cd-pl-mark" title=")Besondere Vergabebedingungen(">[\s\S]*?<span class="cd-sr">)Besondere Vergabebedingungen/,
      '$1Sonderpreis$2Sonderpreis',
    );
    expect(() => parseTable(otherMark)).toThrow(/unexpected row "\.eu § Sonderpreis/);
    const threeCells = edit(
      /(<tr data-tld="de" data-cat="other">[\s\S]*?)<td class="cd-pl-cat">[^<]*<\/td>/,
      '$1',
    );
    expect(() => parseTable(threeCells)).toThrow(/unexpected row "\.de/);
    const emptyRow = edit('<tbody>', '<tbody><tr></tr>');
    expect(() => parseTable(emptyRow)).toThrow(/unexpected row ""/);
    const extraAttr = edit(
      '<tr data-tld="de" data-cat="other">',
      '<tr data-tld="de" data-cat="other" data-x="1">',
    );
    expect(() => parseTable(extraAttr)).toThrow(/found 18 <tr> but parsed 17 rows/);
    const duplicate = PAGE.replace(DE_ROW, (row) => row + row);
    expect(() => parseTable(duplicate)).toThrow(/duplicate row \.de/);
    const noRows = edit(/(<table class="cd-pl-table"[^>]*>)[\s\S]*?(<\/table>)/, '$1$2');
    expect(() => parseTable(noRows)).toThrow(/unexpected table header undefined/);
  });
});

describe('chnet.domains adapter', () => {
  it('writes the listed TLDs, skips the others on the list and fetches only robots.txt and the list', async () => {
    const { calls, result: pending } = run(PAGE);
    const result = await pending;
    expect(result.offers.map((o) => o.tld)).toEqual(
      MVP_TLDS.filter((t) => LISTED_TLDS.includes(t)),
    );
    expect(result.offers).toHaveLength(14);
    expect(result.skipped).toEqual(
      ['at', 'ch', 'berlin'].map((tld) => ({ tld, reason: NOT_LISTED })),
    );
    expect(result.notOffered).toEqual(['me', 'co', 'ai']);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual([
      'https://chnet.domains/robots.txt',
      CHNET_DOMAINS_SOURCE_URL,
    ]);
    expect(calls[1]?.headers['user-agent']).toBe(UA);
    expect(result.offers[0]).toEqual({
      tld: 'de',
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'year',
        setup: 0,
        year1: 550,
        year1_regular: 550,
        renewal: 550,
        term_years: 1,
        renewal_term_years: 1,
      },
      promo: null,
      evidence: {
        source_url: CHNET_DOMAINS_SOURCE_URL,
        fetched_at: '2026-11-25T06:00:00Z',
        method: 'scrape',
        evidence_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        confidence: 'high',
      },
    });
    for (const o of result.offers) {
      expect(o.price.year1_regular, o.tld).toBe(o.price.year1);
      expect(o.price.renewal, o.tld).toBe(o.price.year1);
    }
    expect(Object.fromEntries(result.offers.map((o) => [o.tld, o.price.year1]))).toEqual({
      de: 550,
      com: 1557,
      net: 1557,
      org: 1557,
      eu: 1271,
      io: 7554,
      dev: 3127,
      app: 3127,
      shop: 5269,
      info: 1557,
      online: 5269,
      xyz: 2128,
      biz: 1557,
      cloud: 3699,
    });
  });

  it('skips 24-month TLDs and reports unreadable prices per TLD', async () => {
    const two = await run(PAGE, ['gr', 'nu', 'tk']).result;
    expect(two.skipped).toEqual(['gr', 'nu', 'tk'].map((tld) => ({ tld, reason: TWO_YEAR })));
    expect(two.offers).toEqual([]);
    const bad = edit(
      /(<a href="\/com-domain-registrieren\/">\.com<\/a>[\s\S]*?<td class="cd-pl-num cd-pl-price">)15,57\u00a0€/,
      '$1auf Anfrage',
    );
    const result = await run(bad, ['com', 'de']).result;
    expect(result.failed).toEqual([{ tld: 'com', reason: 'unexpected price text "auf Anfrage"' }]);
    expect(result.offers.map((o) => o.tld)).toEqual(['de']);
  });

  it('fails the whole run when the page layout changes', async () => {
    await expect(run('<p>nothing</p>').result).rejects.toThrow(/expected one price table/);
  });
});
