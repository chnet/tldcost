import { describe, expect, it } from 'vitest';
import {
  FIRST_YEAR_NOTE,
  IONOS_SOURCE_URL,
  VAT_FOOTER,
  ionos,
  parsePrice,
  parseTable,
} from '../src/adapters/ionos.js';
import { MVP_TLDS } from '../src/tlds.js';
import { UA, ctxFor, fixture, testHttp, type Route } from './helpers.js';

const PAGE = fixture('ionos/domain-preistabelle.html');
const ROBOTS = 'https://www.ionos.de/robots.txt';
const run = (page: string | Route, tlds: readonly string[] = MVP_TLDS) => {
  const route = typeof page === 'string' ? { body: page } : page;
  const { http, calls } = testHttp({
    [ROBOTS]: { body: 'User-agent: *\nDisallow: /terms-\n' },
    [IONOS_SOURCE_URL]: { headers: { 'content-type': 'text/html' }, ...route },
    'https://www.ionos.de/login': { body: '<form>Login</form>' },
  });
  return { calls, result: ionos.fetch(ctxFor(http, tlds, '2026-11-27T06:00:00Z')) };
};
/** The fixture with one exact snippet replaced (fails the test if it is not there). */
const edit = (from: string | RegExp, to: string) => {
  expect(PAGE).toMatch(from);
  return PAGE.replace(from, to);
};
const DE_OPEN = '<tr data-dpt-row="de" class="tw-border-t-1">';
const DE_ROW = /<tr data-dpt-row="de" class="tw-border-t-1">[\s\S]*?<\/tr>/;
/** The fixture with one snippet replaced inside the row of one TLD. */
const editRow = (tld: string, from: string, to: string) => {
  const row = new RegExp(`<tr data-dpt-row="${tld}" class="[^"]*">[\\s\\S]*?</tr>`);
  expect(PAGE.match(row)?.[0]).toContain(from);
  return PAGE.replace(row, (r) => r.replace(from, to));
};

describe('IONOS price text', () => {
  it('reads gross euro amounts with a decimal point', () => {
    expect(parsePrice('0.08 €')).toBe(8);
    expect(parsePrice('1.30 €')).toBe(130);
    expect(parsePrice('2 €')).toBe(200);
    expect(parsePrice('90 €')).toBe(9000);
  });

  it('reads "-" as no price', () => {
    expect(parsePrice('-')).toBeNull();
  });

  it('rejects other formats', () => {
    for (const bad of ['0,08 €', '1.3 €', 'ab 1 €', '1.234 €', '2€', '2', '€', '']) {
      expect(() => parsePrice(bad), bad).toThrow(/unexpected price text/);
    }
  });
});

describe('IONOS price table', () => {
  it('parses one row per TLD in page order', () => {
    const rows = parseTable(PAGE);
    expect(rows.map((r) => r.tld)).toEqual([
      'co',
      'de',
      'online',
      'org',
      'shop',
      'ai',
      'app',
      'at',
      'berlin',
      'biz',
      'ch',
      'cloud',
      'com',
      'dev',
      'eu',
      'info',
      'io',
      'me',
      'net',
      'xyz',
    ]);
    expect(rows.find((r) => r.tld === 'de')).toEqual({
      tld: 'de',
      limited: '0.50 €',
      welcome: '0.08 €',
      renewal: '1.30 €',
    });
    expect(rows.find((r) => r.tld === 'co')).toEqual({
      tld: 'co',
      limited: '-',
      welcome: '-',
      renewal: '4.50 €',
    });
  });

  it('fails closed when the page is not the price table (challenge, bot sensor, login)', () => {
    expect(() => parseTable('<p>nothing</p>')).toThrow(/expected one IONOS price table/);
    const two = edit('</body>', '<ionos-domain-price-table></ionos-domain-price-table></body>');
    expect(() => parseTable(two)).toThrow(/expected one IONOS price table/);
    expect(() => parseTable(edit(FIRST_YEAR_NOTE, 'Angebot.'))).toThrow(
      /first-year condition not found/,
    );
    expect(() => parseTable(edit(VAT_FOOTER, 'Preise inkl. MwSt.'))).toThrow(
      /VAT footer not found/,
    );
  });

  it('fails closed when the table layout changes', () => {
    const noTable = edit(/<table\b[\s\S]*<\/table>/, '');
    expect(() => parseTable(noTable)).toThrow(/unexpected table header undefined/);
    const noHeader = edit(/<thead>[\s\S]*?<\/thead>/, '');
    expect(() => parseTable(noHeader)).toThrow(/unexpected table header undefined/);
    const otherHeader = edit(' TLDs </th>', ' Domains </th>');
    expect(() => parseTable(otherHeader)).toThrow(/unexpected table header "Domains\|/);
    const extraAttr = edit(DE_OPEN, DE_OPEN.replace('>', ' data-x="1">'));
    expect(() => parseTable(extraAttr)).toThrow(/found 21 <tr> but parsed 20 rows/);
    const badTld = edit(DE_OPEN, DE_OPEN.replace('"de"', '"DE"'));
    expect(() => parseTable(badTld)).toThrow(/unexpected row "\.de 0\.50 €/);
    const otherTld = edit(DE_OPEN, DE_OPEN.replace('"de"', '"com"'));
    expect(() => parseTable(otherTld)).toThrow(/unexpected row "\.de/);
    const sevenCells = editRow(
      'de',
      '<td class="tw-px-5 tw-py-16 tw-align-top md:tw-p-16">90 €</td>',
      '',
    );
    expect(() => parseTable(sevenCells)).toThrow(/unexpected row "\.de/);
    const emptyRow = edit('<tbody>', '<tbody><tr></tr>');
    expect(() => parseTable(emptyRow)).toThrow(/unexpected row ""/);
    const plainRow = edit('<tbody>', '<tbody><tr><td>.de</td></tr>');
    expect(() => parseTable(plainRow)).toThrow(/unexpected row "\.de"/);
    const noCells = edit('<tbody>', '<tbody><tr data-dpt-row="de" class="x"></tr>');
    expect(() => parseTable(noCells)).toThrow(/unexpected row ""/);
    const duplicate = PAGE.replace(DE_ROW, (row) => row + row);
    expect(() => parseTable(duplicate)).toThrow(/duplicate row \.de/);
  });
});

describe('IONOS adapter', () => {
  it('writes every MVP TLD and fetches only robots.txt and the price table', async () => {
    const { calls, result: pending } = run(PAGE);
    const result = await pending;
    expect(result.offers.map((o) => o.tld)).toEqual([...MVP_TLDS]);
    expect(result.notOffered).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual([ROBOTS, IONOS_SOURCE_URL]);
    expect(calls[1]?.headers['user-agent']).toBe(UA);
    expect(result.offers.find((o) => o.tld === 'de')).toEqual({
      tld: 'de',
      currency: 'EUR',
      vat_included: true,
      price: { unit: 'month', setup: 0, year1: 8, year1_regular: null, renewal: 130 },
      promo: {
        conditions:
          'Willkommensangebot laut Preistabelle, gilt im ersten Jahr (12 Monate), im Voraus zahlbar. ' +
          'Fußzeile der Preistabelle: „Preise inkl. MwSt., Angebote sind nur für begrenzte Zeit ' +
          'gültig und sind teils abhängig von Mindestvertragslaufzeiten.“',
        valid_until: null,
      },
      evidence: {
        source_url: IONOS_SOURCE_URL,
        fetched_at: '2026-11-27T06:00:00Z',
        method: 'scrape',
        evidence_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        confidence: 'medium',
      },
    });
    const by = (f: (o: (typeof result.offers)[number]) => unknown) =>
      Object.fromEntries(result.offers.map((o) => [o.tld, f(o)]));
    expect(by((o) => o.price.year1)).toEqual({
      de: 8,
      com: 8,
      net: 70,
      org: 8,
      eu: 30,
      io: 500,
      dev: 100,
      app: 100,
      shop: 8,
      info: 400,
      at: 100,
      ch: 50,
      me: 12,
      co: 450,
      online: 9,
      berlin: 100,
      xyz: 8,
      ai: 800,
      biz: 300,
      cloud: 8,
    });
    expect(by((o) => o.price.renewal)).toEqual({
      de: 130,
      com: 200,
      net: 200,
      org: 200,
      eu: 200,
      io: 925,
      dev: 200,
      app: 275,
      shop: 550,
      info: 400,
      at: 200,
      ch: 100,
      me: 300,
      co: 450,
      online: 450,
      berlin: 725,
      xyz: 200,
      ai: 1400,
      biz: 300,
      cloud: 400,
    });
    // first year: „Willkommensangebot“, else „Limitiertes Angebot“, else the renewal price
    expect(by((o) => o.promo?.conditions.split(' laut ')[0] ?? null)).toEqual({
      de: 'Willkommensangebot',
      com: 'Willkommensangebot',
      net: 'Willkommensangebot',
      org: 'Willkommensangebot',
      eu: 'Willkommensangebot',
      io: 'Willkommensangebot',
      dev: 'Limitiertes Angebot',
      app: 'Limitiertes Angebot',
      shop: 'Limitiertes Angebot',
      info: null,
      at: 'Limitiertes Angebot',
      ch: 'Limitiertes Angebot',
      me: 'Willkommensangebot',
      co: null,
      online: 'Willkommensangebot',
      berlin: 'Limitiertes Angebot',
      xyz: 'Limitiertes Angebot',
      ai: 'Limitiertes Angebot',
      biz: null,
      cloud: 'Limitiertes Angebot',
    });
    for (const o of result.offers) {
      expect(o.price.year1_regular, o.tld).toBe(o.promo ? null : o.price.year1);
      expect(o.promo?.valid_until ?? null, o.tld).toBeNull();
      expect(o.evidence.evidence_hash, o.tld).toBe(result.offers[0]?.evidence.evidence_hash);
    }
  });

  it('reports TLDs without a row as not offered', async () => {
    const result = await run(PAGE, ['de', 'tk']).result;
    expect(result.offers.map((o) => o.tld)).toEqual(['de']);
    expect(result.notOffered).toEqual(['tk']);
  });

  it('reports unreadable prices per TLD and writes the others', async () => {
    const comma = editRow('de', '1.30 €', '1,30 €');
    const result = await run(comma, ['com', 'de']).result;
    expect(result.failed).toEqual([{ tld: 'de', reason: 'unexpected price text "1,30 €"' }]);
    expect(result.offers.map((o) => o.tld)).toEqual(['com']);
    const noRenewal = editRow('io', '9.25 €', '-');
    const io = await run(noRenewal, ['io']).result;
    expect(io.failed).toEqual([{ tld: 'io', reason: 'no regular renewal price' }]);
    expect(io.offers).toEqual([]);
  });

  it('fails the whole run on a redirect, an HTTP error or another page', async () => {
    const redirect = { status: 302, headers: { location: 'https://www.ionos.de/login' } };
    await expect(run(redirect).result).rejects.toThrow(
      'redirected to https://www.ionos.de/login (challenge, bot sensor or login page?)',
    );
    await expect(run({ status: 403, body: 'denied' }).result).rejects.toThrow('HTTP 403');
    await expect(run('<p>nothing</p>').result).rejects.toThrow(/expected one IONOS price table/);
  });
});
