import { createHash } from 'node:crypto';
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
  const ALL = [
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
  ];
  const parse = (html: string) => parseTable(html, MVP_TLDS);
  const cells = (first: string) =>
    `<td>${first}</td><td>-</td><td>-</td><td>-</td><td>2 €</td><td>2 €</td><td>90 €</td><td>enthalten</td>`;
  /** The fixture with extra rows at the top of the table body. */
  const withRows = (...rows: string[]) => edit('<tbody>', `<tbody>${rows.join('')}`);

  it('parses the rows of the requested TLDs in page order', () => {
    const rows = parse(PAGE);
    expect(rows.map((r) => r.tld)).toEqual(ALL);
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
    expect(parseTable(PAGE, ['de', 'tk']).map((r) => r.tld)).toEqual(['de']);
    expect(parseTable(PAGE, ['tk'])).toEqual([]);
  });

  it('reads &nbsp;, U+00A0 and &euro; in a cell', () => {
    let page = PAGE;
    for (const [tld, from, to] of [
      ['de', '1.30 €', '1.30&nbsp;€'],
      ['com', '2 €', '2\u00a0€'],
      ['net', '2 €', '2 &euro;'],
    ] as const) {
      const row = new RegExp(`<tr data-dpt-row="${tld}" class="[^"]*">[\\s\\S]*?</tr>`);
      expect(page.match(row)?.[0]).toContain(from);
      page = page.replace(row, (r) => r.replace(from, to));
    }
    const rows = parse(page);
    expect(rows.find((r) => r.tld === 'de')?.renewal).toBe('1.30 €');
    expect(rows.find((r) => r.tld === 'com')?.renewal).toBe('2 €');
    expect(rows.find((r) => r.tld === 'net')?.renewal).toBe('2 €');
  });

  it('does not read unusual rows of TLDs the run does not request', () => {
    const odd = withRows(
      `<tr data-dpt-row="co.uk" class="tw-border-t-1">${cells('.co.uk')}</tr>`,
      `<tr data-dpt-row="com.de" class="tw-border-t-1">${cells('.com.de')}</tr>`,
      `<tr data-dpt-row="xn--p1ai" class="tw-border-t-1">${cells('.рф')}</tr>`,
      `<tr data-dpt-row="gmbh" class="tw-border-t-1">${cells('.gmbh <sup>1</sup>')}</tr>`,
      `<tr data-dpt-row="tk" class="tw-border-t-1"><td>.tk</td><td>2 €</td></tr>`,
      `<tr data-dpt-row="tk" class="tw-border-t-1">${cells('.tk')}</tr>`,
      `<tr data-dpt-row="" class="x"></tr>`,
      '<tr></tr>',
      '<tr><td>Hinweis</td></tr>',
    );
    expect(parse(odd)).toEqual(parse(PAGE));
    // the adapter reads plain TLDs only: a requested second-level label fails closed
    expect(() => parseTable(odd, ['co.uk'])).toThrow(/unexpected row "\.co\.uk - - - 2 €/);
    expect(() => parseTable(odd, ['tk'])).toThrow(/unexpected row "\.tk 2 €"/);
    expect(() => parseTable(odd, ['gmbh'])).toThrow(/unexpected row "\.gmbh 1 -/);
  });

  it('fails closed when the page is not the price table (challenge, bot sensor, login)', () => {
    expect(() => parse('<p>nothing</p>')).toThrow(/expected one IONOS price table/);
    const two = edit('</body>', '<ionos-domain-price-table></ionos-domain-price-table></body>');
    expect(() => parse(two)).toThrow(/expected one IONOS price table/);
    expect(() => parse(edit(FIRST_YEAR_NOTE, 'Angebot.'))).toThrow(
      /first-year condition not found/,
    );
    expect(() => parse(edit(VAT_FOOTER, 'Preise inkl. MwSt.'))).toThrow(/VAT footer not found/);
  });

  it('fails closed when the table layout changes', () => {
    const noTable = edit(/<table\b[\s\S]*<\/table>/, '');
    expect(() => parse(noTable)).toThrow(/unexpected table header undefined/);
    const noHeader = edit(/<thead>[\s\S]*?<\/thead>/, '');
    expect(() => parse(noHeader)).toThrow(/unexpected table header undefined/);
    const otherHeader = edit(' TLDs </th>', ' Domains </th>');
    expect(() => parse(otherHeader)).toThrow(/unexpected table header "Domains\|/);
    // a new attribute in the opening tag of one row (the .de row): ROW no longer matches that <tr>,
    // and the <tr> count check must catch it instead of dropping the row silently
    const extraAttr = edit(DE_OPEN, DE_OPEN.replace(/^(<tr\b[^>]*)>/, '$1 data-x="1">'));
    expect(() => parse(extraAttr)).toThrow(/found 21 <tr> but parsed 20 rows/);
    const noRows = edit(/(<tbody>)[\s\S]*?(<\/tbody>)/, '$1$2');
    expect(() => parseTable(noRows, ['tk'])).toThrow(/no TLD rows found/);
    const onlyOdd = edit(
      /(<tbody>)[\s\S]*?(<\/tbody>)/,
      `$1<tr data-dpt-row="co.uk" class="tw-border-t-1">${cells('.co.uk')}</tr>$2`,
    );
    expect(() => parseTable(onlyOdd, ['tk'])).toThrow(/no TLD rows found/);
  });

  it('fails closed on an unusual row of a requested TLD', () => {
    const upper = edit(DE_OPEN, DE_OPEN.replace('"de"', '"DE"'));
    expect(() => parse(upper)).toThrow(/unexpected row "\.de 0\.50 €/);
    const otherTld = edit(DE_OPEN, DE_OPEN.replace('"de"', '"com"'));
    expect(() => parse(otherTld)).toThrow(/unexpected row "\.de 0\.50 €/);
    const note = editRow('de', '>.de</td>', '>.de <sup>*</sup></td>');
    expect(() => parse(note)).toThrow(/unexpected row "\.de \* 0\.50 €/);
    const sevenCells = editRow(
      'de',
      '<td class="tw-px-5 tw-py-16 tw-align-top md:tw-p-16">90 €</td>',
      '',
    );
    expect(() => parse(sevenCells)).toThrow(/unexpected row "\.de/);
    const noCells = withRows('<tr data-dpt-row="de" class="x"></tr>');
    expect(() => parse(noCells)).toThrow(/unexpected row ""/);
    const duplicate = PAGE.replace(DE_ROW, (row) => row + row);
    expect(() => parse(duplicate)).toThrow(/duplicate row \.de/);
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
        // sha256 of the fixture bytes
        evidence_hash: 'sha256:87a7285ff598846502a9450c473a5d9128ce0bc8d3d60882fec918972e812cc3',
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

  it('hashes the fetched bytes, not the decoded text', async () => {
    // TextDecoder drops a leading byte order mark: the text loses it, the bytes keep it
    const page = '\uFEFF' + PAGE;
    const result = await run(page, ['de']).result;
    const bytes = new TextEncoder().encode(page);
    expect(result.offers[0]?.evidence.evidence_hash).toBe(
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    );
    expect(result.offers[0]?.evidence.evidence_hash).not.toBe(
      `sha256:${createHash('sha256').update(PAGE).digest('hex')}`,
    );
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
