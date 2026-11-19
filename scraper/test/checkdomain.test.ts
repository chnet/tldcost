import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHECKDOMAIN_ENDPOINT,
  CHECKDOMAIN_PRICE_LIST,
  checkHint,
  checkdomain,
  decode,
  pageHints,
  parseEuro,
  parseHint,
  parsePriceList,
  parseTldList,
} from '../src/adapters/checkdomain.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, testHttp } from './helpers.js';

// both pages are served as ISO-8859-1: keep the fixtures' raw bytes
const latin1 = (p: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', p)).toString('latin1');
const LIST = latin1('checkdomain/preisliste.html');
const DOMAINS = latin1('checkdomain/domains.html');
const HTML = 'text/html; charset=ISO-8859-1';
// TLD pages (served as UTF-8), trimmed to their footnote list: read when the hint of the domain
// data does not match
const utf8 = (p: string) => readFileSync(join(import.meta.dirname, 'fixtures', p), 'utf8');
const COM_PAGE = utf8('checkdomain/com-domain.html');
const AT_PAGE = utf8('checkdomain/at-domain.html');
const COM_URL = 'https://www.checkdomain.de/com-domain/';
const AT_URL = 'https://www.checkdomain.de/at-domain/';

/** One exact snippet replaced (fails the test if it is not there). */
const edit = (page: string, from: string | RegExp, to: string) => {
  expect(page).toMatch(from);
  return page.replace(from, to);
};

const run = (
  tlds: readonly string[] = MVP_TLDS,
  list = LIST,
  domains = DOMAINS,
  tldPages: Record<string, string> = { [COM_URL]: COM_PAGE, [AT_URL]: AT_PAGE },
  requested: string[] = [],
) => {
  const body = (s: string, type = HTML) => ({
    bytes: new Uint8Array(Buffer.from(s, type === HTML ? 'latin1' : 'utf8')),
    type,
  });
  const pages: Record<string, { bytes: Uint8Array; type: string }> = {
    [CHECKDOMAIN_PRICE_LIST]: body(list),
    [CHECKDOMAIN_ENDPOINT]: body(domains),
    ...Object.fromEntries(
      Object.entries(tldPages).map(([u, p]) => [u, body(p, 'text/html; charset=UTF-8')]),
    ),
  };
  const fetch = (async (input: URL | string) => {
    const url = String(input);
    requested.push(url);
    if (url === 'https://www.checkdomain.de/robots.txt') {
      return new Response(new TextEncoder().encode('User-agent: *\n'), { status: 200 });
    }
    const page = pages[url];
    return page
      ? new Response(page.bytes, { status: 200, headers: { 'content-type': page.type } })
      : new Response(new TextEncoder().encode('not found'), { status: 404 });
  }) as typeof globalThis.fetch;
  const { http } = testHttp({}, { fetch });
  return checkdomain.fetch(ctxFor(http, tlds, '2026-11-15T05:30:00Z'));
};

const PROMO = ['de', 'net', 'org', 'eu', 'info', 'ch', 'io', 'app', 'shop', 'me', 'online'];

describe('checkdomain text', () => {
  it('decodes ISO-8859-1 when the response says so, else uses the UTF-8 text', () => {
    const bytes = new Uint8Array([0x4b, 0xfc, 0x6e]);
    expect(decode({ contentType: HTML, bytes, text: 'unused' })).toBe('Kün');
    expect(decode({ contentType: 'text/html; charset=UTF-8', bytes, text: 'utf' })).toBe('utf');
  });

  it('reads gross euro amounts with the footnote star', () => {
    expect(parseEuro('1,49 €*')).toBe(149);
    expect(parseEuro('14,99 €*')).toBe(1499);
    for (const bad of ['1,49 €', '1.49 €*', 'auf Anfrage']) {
      expect(() => parseEuro(bad), bad).toThrow(/unexpected price text/);
    }
  });
});

describe('checkdomain price list', () => {
  it('parses the domain table', () => {
    const rows = parsePriceList(LIST);
    expect(rows.size).toBe(21);
    expect(rows.get('de')).toEqual({
      tld: 'de',
      url: 'https://www.checkdomain.de/de-domain/',
      minTerm: '12 Monate',
      setup: '0,00 €*',
      monthly: '1,49 €*',
    });
    expect(rows.get('ai')?.minTerm).toBe('24 Monate');
    // second-level TLDs link as /<tld>-domain/<label>/, e.g. .com.de
    const second = edit(
      LIST,
      /<tr data-href="https:\/\/www\.checkdomain\.de\/de-domain\/">(\s*<td[^>]*><a href="[^"]*">)DE</,
      '<tr data-href="https://www.checkdomain.de/de-domain/com/">$1COM.DE<',
    );
    expect(parsePriceList(second).get('com.de')?.url).toBe(
      'https://www.checkdomain.de/de-domain/com/',
    );
  });

  it('fails closed when the page layout changes', () => {
    expect(() => parsePriceList(LIST.replace('inkl. 19% MwSt.', 'zzgl. 19% MwSt.'))).toThrow(
      /VAT note \(gross prices\) not found/,
    );
    expect(() => parsePriceList(edit(LIST, /Domain\u00adendung/, 'TLD'))).toThrow(
      /expected one domain table, found 0/,
    );
    expect(() => parsePriceList(edit(LIST, '>Einrichtung</th>', '>Setup</th>'))).toThrow(
      /unexpected table header/,
    );
    const href = edit(LIST, '<tr data-href="https://www.checkdomain.de/de-domain/">', '<tr>');
    expect(() => parsePriceList(href)).toThrow(/unexpected row "DE/);
    const label = edit(LIST, '/de-domain/">DE</a>', '/de-domain/">DE-Paket</a>');
    expect(() => parsePriceList(label)).toThrow(/unexpected row "DE-Paket/);
    const cells = edit(LIST, /<td[^>]*data-title="Einrichtung">[^<]*<\/td>/, '');
    expect(() => parsePriceList(cells)).toThrow(/unexpected row/);
    const empty = edit(LIST, '<tbody class="table--light">', '<tbody><tr></tr>');
    expect(() => parsePriceList(empty)).toThrow(/unexpected row ""/);
    const deRow = /<tr data-href="https:\/\/www\.checkdomain\.de\/de-domain\/">[\s\S]*?<\/tr>/;
    const twice = edit(LIST, deRow, `${LIST.match(deRow)?.[0]}${LIST.match(deRow)?.[0]}`);
    expect(() => parsePriceList(twice)).toThrow(/duplicate TLD \.de in the price list/);
  });
});

describe('checkdomain domain data', () => {
  it('parses window.tldList', () => {
    const map = parseTldList(DOMAINS);
    expect(map.size).toBe(21);
    expect(map.get('de')).toMatchObject({ price: 1.49, discount: { price: 0.07 } });
    expect(map.get('ai')?.contractPeriod).toBe(24);
  });

  it('fails closed without the list or with another default contract period', () => {
    expect(() => parseTldList('<p></p>')).toThrow(/expected one tldList, found 0/);
    const noDefaults = edit(DOMAINS, /window\.articleDefaults = .*\n/, '');
    expect(() => parseTldList(noDefaults)).toThrow(/unexpected default contract period undefined/);
    const longer = edit(DOMAINS, '{"contractPeriod":12,', '{"contractPeriod":24,');
    expect(() => parseTldList(longer)).toThrow(/unexpected default contract period 24/);
    const twice = edit(
      DOMAINS,
      'window.tldList = [',
      'window.tldList = [{"id":1,"tld":"de","price":1.49},',
    );
    expect(() => parseTldList(twice)).toThrow(/duplicate TLD \.de in the domain data/);
  });

  it('accepts a promo hint only for this TLD with both amounts', () => {
    const hint =
      'Die .org-Domain kostet im ersten Jahr nur 0,49EUR/Monat, danach 2,29EUR/Monat.\r\nDas Angebot ist limitiert auf 1 Domain pro Kunde.';
    expect(checkHint('org', 49, 229, hint)).toBe(hint.replace('\r\n', ' '));
    expect(() => checkHint('at', 49, 229, hint)).toThrow(/promo hint does not match/);
    expect(() => checkHint('org', 7, 229, hint)).toThrow(/promo hint does not match/);
    expect(() => checkHint('org', 49, 239, hint)).toThrow(/promo hint does not match/);
    expect(() => checkHint('org', 49, 229, undefined)).toThrow(/promo without a hint text/);
    expect(() => checkHint('org', 229, 229, hint)).toThrow(
      /promo price 229 not below the regular 229/,
    );
    expect(() => checkHint('org', 49, 229, 'Limited to 1 domain per customer.')).toThrow(
      /promo hint does not match/,
    );
  });

  it('parses a hint: the TLD it names and both amounts', () => {
    expect(
      parseHint(
        'Die .de-Domain kostet im ersten Jahr nur 0,49EUR/Monat, danach 2,99EUR/Monat.\r\nDas Angebot ist limitiert auf 1 Domain pro Kunde.',
      ),
    ).toEqual({
      text: 'Die .de-Domain kostet im ersten Jahr nur 0,49EUR/Monat, danach 2,99EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde.',
      tld: 'de',
      promo: 49,
      regular: 299,
    });
    expect(parseHint('The .art-domain costs in the first year only 0,07EUR/month.')).toBeNull();
  });
});

describe('checkdomain TLD page', () => {
  it('reads the promo hints of the footnote list, without the footnote label', () => {
    expect(pageHints(COM_PAGE)).toEqual([
      'Die .com-Domain kostet im ersten Jahr nur 0,07EUR/Monat, danach 2,39EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde.',
    ]);
    // the provider's own page names .de in the .at footnote
    expect(pageHints(AT_PAGE)).toEqual([
      'Die .de-Domain kostet im ersten Jahr nur 0,49EUR/Monat, danach 2,99EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde.',
    ]);
    // only the footnote list counts
    expect(pageHints(COM_PAGE.replace('data-app-main-footnotes-list', 'class="x"'))).toEqual([]);
  });
});

describe('checkdomain adapter', () => {
  it('writes the 12-month TLDs, skips .ai, checks mismatching promo hints on the TLD page', async () => {
    const requested: string[] = [];
    const result = await run(MVP_TLDS, LIST, DOMAINS, undefined, requested);
    expect(result.notOffered).toEqual([]);
    expect(result.skipped).toEqual([
      { tld: 'ai', reason: 'minimum term 24 months: payment per term not stated' },
    ]);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([
      '.com: promo hint taken from https://www.checkdomain.de/com-domain/; the domain data states "Die .com-Domain kostet im ersten Jahr nur 0,07EUR/Monat, danach 2,19EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde."',
      '.at: promo hint names another TLD, regular price without the promo: "Die .de-Domain kostet im ersten Jahr nur 0,49EUR/Monat, danach 2,99EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde."',
    ]);
    // the TLD pages only for the two mismatching hints
    expect(requested.filter((u) => u.endsWith('-domain/'))).toEqual([COM_URL, AT_URL]);
    expect(result.offers.map((o) => o.tld)).toEqual(MVP_TLDS.filter((t) => t !== 'ai'));
    // .com: the page footnote matches the price list (2,39), the domain data hint (2,19) does not
    expect(result.offers.find((o) => o.tld === 'com')).toMatchObject({
      price: { unit: 'month', setup: 0, year1: 7, year1_regular: 239, renewal: 239 },
      promo: {
        conditions:
          'Die .com-Domain kostet im ersten Jahr nur 0,07EUR/Monat, danach 2,39EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde.',
        valid_until: null,
      },
      evidence: { source_url: COM_URL, confidence: 'high' },
    });
    // .at: the hint names .de in both sources, so no promo is stated for .at
    expect(result.offers.find((o) => o.tld === 'at')).toMatchObject({
      price: { unit: 'month', setup: 0, year1: 299, year1_regular: 299, renewal: 299 },
      promo: null,
      evidence: { source_url: AT_URL, confidence: 'medium' },
    });
    expect(result.offers.find((o) => o.tld === 'de')).toEqual({
      tld: 'de',
      currency: 'EUR',
      vat_included: true,
      price: { unit: 'month', setup: 0, year1: 7, year1_regular: 149, renewal: 149 },
      promo: {
        conditions:
          'Die .de-Domain kostet im ersten Jahr nur 0,07EUR/Monat, danach 1,49EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde.',
        valid_until: null,
      },
      evidence: {
        source_url: 'https://www.checkdomain.de/de-domain/',
        source_endpoint: CHECKDOMAIN_ENDPOINT,
        fetched_at: '2026-11-15T05:30:00Z',
        method: 'scrape',
        evidence_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        confidence: 'high',
      },
    });
    const dev = result.offers.find((o) => o.tld === 'dev');
    expect(dev?.promo).toBeNull();
    expect(dev?.evidence.confidence).toBe('medium');
    expect(
      result.offers.filter((o) => o.promo).map((o) => o.tld),
      'TLDs with a promo',
    ).toEqual(MVP_TLDS.filter((t) => [...PROMO, 'com', 'xyz', 'cloud'].includes(t)));
    expect(
      Object.fromEntries(
        result.offers.map((o) => [o.tld, `${o.price.year1}/${o.price.renewal}/${o.price.setup}`]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "app": "49/349/0",
        "at": "299/299/0",
        "berlin": "639/639/0",
        "biz": "349/349/0",
        "ch": "49/299/0",
        "cloud": "49/399/0",
        "co": "449/449/0",
        "com": "7/239/0",
        "de": "7/149/0",
        "dev": "349/349/0",
        "eu": "49/249/0",
        "info": "49/349/0",
        "io": "299/899/0",
        "me": "7/299/0",
        "net": "7/249/0",
        "online": "7/699/0",
        "org": "49/229/0",
        "shop": "7/499/0",
        "xyz": "7/249/0",
      }
    `);
  });

  it('cross-checks every TLD against the price list', async () => {
    let page = DOMAINS;
    for (const [from, to] of [
      ['"tld":"de","price":1.49,', '"tld":"de","price":1.49,"contractPeriod":24,'],
      ['"tld":"dev","price":3.49,', '"tld":"dev","price":3.59,'],
      ['"tld":"co","price":4.49,', '"tld":"co","price":4.49,"setup":0,'],
      ['"tld":"biz","price":3.49,', '"tld":"biz","price":3.49,"setup":"0",'],
      // a "discount" at the regular price is no promo; a discount without a hint fails
      ['"tld":"co","price":4.49,', '"tld":"co","price":4.49,"discount":{"price":4.49},'],
      ['"tld":"berlin","price":6.39,', '"tld":"berlin","price":6.39,"discount":{"price":1.0},'],
    ] as const) {
      page = edit(page, from, to);
    }
    const list = edit(
      LIST,
      /(net-domain\/">NET<\/a><\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>)12 Monate/,
      '$11 Jahr',
    );
    const result = await run(['de', 'dev', 'co', 'biz', 'net', 'berlin'], list, page);
    expect(result.failed).toEqual([
      { tld: 'de', reason: 'minimum term "12 Monate" vs 24 months' },
      { tld: 'dev', reason: 'price data 359/0 vs price list "3,49 €*"/"0,00 €*"' },
      { tld: 'biz', reason: 'setup is not a number' },
      { tld: 'net', reason: 'minimum term "1 Jahr" vs 12 months' },
      { tld: 'berlin', reason: 'promo without a hint text' },
    ]);
    expect(result.offers.map((o) => [o.tld, o.price.year1, o.promo])).toEqual([['co', 449, null]]);
  });

  it('reports TLDs missing from one or both sources', async () => {
    const noListRow = edit(
      LIST,
      /\s*<tr data-href="https:\/\/www\.checkdomain\.de\/art-domain\/">[\s\S]*?<\/tr>/,
      '',
    );
    const noEntry = edit(DOMAINS, /,?\{"id":\d+,"tld":"art",[^\n]*?\}\}(?=,|\])/, '');
    expect((await run(['art', 'zz'], noListRow)).failed).toEqual([
      { tld: 'art', reason: 'only in the domain data, not in both' },
    ]);
    const onlyList = await run(['art', 'zz'], LIST, noEntry);
    expect(onlyList.failed).toEqual([
      { tld: 'art', reason: 'only in the price list, not in both' },
    ]);
    expect(onlyList.notOffered).toEqual(['zz']);
    // the English hint of .art is not the known German wording
    expect((await run(['art'])).failed[0]?.reason).toMatch(/^promo hint does not match/);
  });
  it('fails a mismatching promo hint when the TLD page does not resolve it', async () => {
    const hint219 =
      '"Die .com-Domain kostet im ersten Jahr nur 0,07EUR/Monat, danach 2,19EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde."';
    // no TLD page: the domain data mismatch plus the page error
    const missing = await run(['com'], LIST, DOMAINS, {});
    expect(missing.failed).toHaveLength(1);
    expect(missing.failed[0]?.reason).toMatch(/^promo hint does not match the price data: /);
    expect(missing.failed[0]?.reason).toContain(`${hint219}; TLD page: `);
    // the page footnote with other amounts, or without any hint: the reason names what it said
    for (const [page, said] of [
      [
        COM_PAGE.replace('2,39EUR', '2,49EUR'),
        '"Die .com-Domain kostet im ersten Jahr nur 0,07EUR/Monat, danach 2,49EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde."',
      ],
      ['<p></p>', 'no promo hint'],
    ]) {
      const result = await run(['com'], LIST, DOMAINS, { [COM_URL]: page as string });
      expect(result.failed).toEqual([
        {
          tld: 'com',
          reason: `promo hint does not match the price data: ${hint219}; TLD page: ${said}`,
        },
      ]);
      expect(result.warnings).toEqual([]);
    }
    // two different hints on the page: none is taken
    const two = COM_PAGE.replace('</ol>', `<li>${pageHints(AT_PAGE)[0]}</li></ol>`);
    expect((await run(['com'], LIST, DOMAINS, { [COM_URL]: two })).failed).toHaveLength(1);
    // another TLD named, but with other amounts than this TLD's: fails
    const atOther = AT_PAGE.replace('0,49EUR', '0,07EUR');
    const domainsOther = edit(
      DOMAINS,
      '"Die .de-Domain kostet im ersten Jahr nur 0,49EUR',
      '"Die .de-Domain kostet im ersten Jahr nur 0,07EUR',
    );
    const at = await run(['at'], LIST, domainsOther, { [AT_URL]: atOther });
    expect(at.failed[0]?.reason).toMatch(/^promo hint does not match the price data/);
    expect(at.offers).toEqual([]);
    // another TLD named with this TLD's amounts, but the TLD page has no hint (layout changed?):
    // no regular-price fallback on the domain data alone
    const noFootnotes = await run(['at'], LIST, DOMAINS, { [AT_URL]: '<p></p>' });
    expect(noFootnotes.failed).toEqual([
      {
        tld: 'at',
        reason:
          'promo hint does not match the price data: "Die .de-Domain kostet im ersten Jahr nur 0,49EUR/Monat, danach 2,99EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde."; TLD page: no promo hint',
      },
    ]);
    expect(noFootnotes.offers).toEqual([]);
  });
});
