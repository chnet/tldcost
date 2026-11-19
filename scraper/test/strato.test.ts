import { describe, expect, it } from 'vitest';
import {
  euroCents,
  parseCard,
  PROMO_NOTE,
  strato,
  STRATO_DOMAIN_LIST,
  STRATO_OVERVIEW,
  stratoPage,
  listEntry,
  tableSetup,
} from '../src/adapters/strato.js';
import { ctxFor, fixture, testHttp, type Routes } from './helpers.js';

const ROBOTS = {
  'https://www.strato.de/robots.txt': {
    body: 'User-agent: *\nDisallow: /apps/\nDisallow: /error/\nAllow: /apps/CustomerService\n',
  },
};
const OVERVIEW = fixture('strato/domain-kosten.html');
// the domain list of 2026-11-19, trimmed to the entries of .de, .net, .io and .biz (all terms and
// sections, among them the 1-month entries and the "Zusatz-Domains" entries)
const LIST = fixture('strato/domains.html');
const pages = (...tlds: string[]) =>
  Object.fromEntries(tlds.map((t) => [stratoPage(t), { body: fixture(`strato/${t}.html`) }]));
const run = (routes: Routes, tlds: readonly string[], overview = OVERVIEW) =>
  strato.fetch(
    ctxFor(
      testHttp({
        ...ROBOTS,
        [STRATO_OVERVIEW]: { body: overview },
        // no list entries: the tests of the domain list pass the list fixture themselves
        [STRATO_DOMAIN_LIST]: { body: '<p></p>' },
        ...routes,
      }).http,
      tlds,
    ),
  );

/** A product page with one price card (parts as given) and the VAT note. */
const card = (
  o: {
    tld?: string;
    buy?: string;
    price?: string;
    /** Unit span after the price; null leaves it out. */
    unit?: string | null;
    term?: string;
    disclaimer?: string | null;
    vat?: boolean;
  } = {},
) => {
  const tld = o.tld ?? 'de';
  const unit =
    o.unit === null
      ? ''
      : `<span class="pricecard__planprice__additionalinfo" aria-hidden="true">${o.unit ?? '/Mon.'}</span>`;
  const price = (o.price ?? '<data value="0.05"><strong>0,05&nbsp;€</strong></data>') + unit;
  const term =
    o.term === undefined ? '' : `<div class="pricecard__plantermcontract">${o.term}</div>`;
  const disclaimer =
    o.disclaimer === null
      ? ''
      : `<div class="pricecard__plandisclaimer">${o.disclaimer ?? 'danach 1 € /Mon.<br> Einrichtung:     0 €'}</div>`;
  const buy = o.buy ?? `STRATO_DOMAIN_${tld.toUpperCase()}_AKTION_VLZ12`;
  const termDefault = o.term === undefined && o.disclaimer === undefined;
  return (
    `<div class="pricecard__header"><div class="pricecard__plan">.${tld}</div></div>` +
    `<p>${price}</p>` +
    (termDefault ? '<div class="pricecard__plantermcontract">für 12 Monate</div>' : term) +
    disclaimer +
    `<button class="btn" data-buy="${buy}">In den Warenkorb</button>` +
    (o.vat === false ? '' : '<div class="text-end">Preise inkl. MwSt.</div>')
  );
};

describe('STRATO adapter', () => {
  it('maps the price card of each product page (gross, per month, first year as promo)', async () => {
    const result = await run(pages('io', 'ch', 'xyz', 'ai'), ['io', 'ch', 'xyz', 'ai', 'de']);
    expect(result.notOffered).toEqual(['de']);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.offers.map((o) => o.tld)).toEqual(['io', 'ch', 'xyz', 'ai']);
    const io = result.offers[0];
    expect(io).toMatchObject({
      tld: 'io',
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'month',
        setup: 0,
        year1: 333,
        year1_regular: null,
        renewal: 625,
        transfer_in: null,
      },
      promo: {
        conditions: `Aktionspreis „12 Monate nur“ laut Preiskarte. ${PROMO_NOTE}`,
        valid_until: null,
      },
      evidence: {
        source_url: 'https://www.strato.de/domains/io-domain/',
        fetched_at: '2026-11-13T06:00:00Z',
        method: 'scrape',
        confidence: 'high',
      },
    });
    expect(io?.evidence.evidence_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // one price only: no promo
    expect(result.offers[1]).toMatchObject({
      price: { setup: 0, year1: 390, year1_regular: 390, renewal: 390 },
      promo: null,
    });
    // first-year price without _AKTION in the order code, with a setup fee
    expect(result.offers[2]).toMatchObject({
      price: { setup: 250, year1: 70, year1_regular: null, renewal: 140 },
      promo: { conditions: `Aktionspreis „für 12 Monate“ laut Preiskarte. ${PROMO_NOTE}` },
    });
    expect(result.offers[3]?.price).toMatchObject({ year1: 780, renewal: 1200 });
  });

  it('fails first-year prices closed without the FAQ note on the overview', async () => {
    const result = await run(pages('io', 'ch'), ['io', 'ch'], '<p>Wartung</p>');
    expect(result.failed).toEqual([
      { tld: 'io', reason: expect.stringMatching(/without the note/) },
    ]);
    expect(result.offers.map((o) => o.tld)).toEqual(['ch']);
  });

  it('writes no promo when the later price equals the current one; whole-euro prices', async () => {
    const page = card({
      price: '<data value="1"><strong>1&nbsp;€</strong></data>',
      term: '12 Monate nur',
      disclaimer: 'danach 1 € /Mon.<br> Einrichtung: 2,50 €',
    });
    const result = await run({ [stratoPage('de')]: { body: page } }, ['de'], '<p>-</p>');
    expect(result.failed).toEqual([]);
    expect(result.offers[0]).toMatchObject({
      price: { setup: 250, year1: 100, year1_regular: 100, renewal: 100 },
      promo: null,
    });
  });

  it('reports cards it cannot trust per TLD', async () => {
    const cases: [string, string][] = [
      [card({ vat: false }), 'without "Preise inkl. MwSt."'],
      [card({ tld: 'com' }), 'expected 1 price card for .de, found 0'],
      [card() + card(), 'found 2'],
      [card({ buy: 'STRATO_DOMAIN_DEV_VLZ12' }), 'is not a STRATO_DOMAIN_DE product'],
      [card({ buy: 'STRATO_DOMAIN_DE_VLZ24' }), 'contract term 24 months'],
      [card({ price: '1,00 €' }), 'expected 1 price in the card, found 0'],
      [
        card({ price: '<data value="0.05"><strong>0,50&nbsp;€</strong></data>' }),
        'shown price "0,50 €" differs from value 0.05',
      ],
      [card({ unit: '/Jahr' }), 'card price unit "/Jahr", expected "/Mon."'],
      [card({ unit: null }), 'card price unit "", expected "/Mon."'],
      [card({ disclaimer: null }), 'setup fee missing'],
      // an "Einrichtung" line in another form is not skipped in favour of the table or the list
      [
        card({
          term: 'für 12 Monate',
          disclaimer: 'danach 1 € /Mon.<br> Einrichtung: einmalig 2,50 €',
        }),
        'card line "danach 1 € /Mon. Einrichtung: einmalig 2,50 €" is not "Einrichtung: X €"',
      ],
      [card({ term: 'für 12 Monate', disclaimer: 'Einrichtung: 0 €' }), 'without a "danach" price'],
      [card({ disclaimer: 'danach 1 € /Mon.<br> Einrichtung: 0 €' }), 'without a "danach" price'],
      [card({ term: 'für 24 Monate' }), 'unknown term "für 24 Monate"'],
      [
        card({
          price: '<data value="2"><strong>2&nbsp;€</strong></data>',
          term: 'für 12 Monate',
          disclaimer: 'danach 1 € /Mon.<br> Einrichtung: 0 €',
        }),
        'first-year price above',
      ],
      [
        card({ term: 'für 12 Monate', disclaimer: 'danach 1.00 € /Mon.<br> Einrichtung: 0 €' }),
        'not a German euro price',
      ],
    ];
    for (const [page, reason] of cases) {
      const result = await run({ [stratoPage('de')]: { body: page } }, ['de']);
      expect(result.offers, reason).toEqual([]);
      expect(result.failed[0]?.reason, reason).toContain(reason);
    }
  });

  it('ignores bundle cards and other TLDs next to the target card', async () => {
    const bundle = (plan: string, buy: string) =>
      `<div class="pricecard__header"><div class="pricecard__plan">${plan}</div></div>` +
      '<p><data value="0.10"><strong>0,10&nbsp;€</strong></data>' +
      '<span class="pricecard__planprice__additionalinfo">/Mon.</span></p>' +
      `<button data-buy="${buy}">In den Warenkorb</button>`;
    const page =
      bundle('.de &amp; .eu', 'STRATO_DOMAIN_DE_EU_BUNDLE_VLZ12') +
      bundle('.de & .com', 'STRATO_DOMAIN_DE_COM_BUNDLE_VLZ12') +
      bundle('.com.de', 'STRATO_DOMAIN_COMDE_VLZ12') +
      bundle('.köln', 'STRATO_DOMAIN_KOELN_VLZ12') +
      card();
    const result = await run({ [stratoPage('de')]: { body: page } }, ['de']);
    expect(result.failed).toEqual([]);
    expect(result.offers[0]?.price).toMatchObject({ year1: 5, renewal: 100 });
  });

  it('throws on errors other than a missing page', async () => {
    await expect(
      run({ [stratoPage('de')]: { status: 500, body: 'error' } }, ['de']),
    ).rejects.toThrow(/HTTP 500/);
    await expect(
      run({ [stratoPage('de')]: new TypeError('network down') }, ['de']),
    ).rejects.toThrow(/network down/);
  });

  it('parses German prices', () => {
    expect(euroCents('3,33')).toBe(333);
    expect(euroCents(' 2 ')).toBe(200);
    expect(euroCents('12,00')).toBe(1200);
    expect(() => euroCents('1.000')).toThrow(/not a German euro price/);
    expect(parseCard(fixture('strato/ch.html'), 'ch')).toEqual({
      current: 390,
      after: null,
      term: null,
      setup: 0,
      setupSource: { from: 'card', text: 'Einrichtung: 0 €' },
      listCheck: 'not fetched',
    });
  });
});

describe('STRATO setup fee: price card line or product table', () => {
  // .de as served on 2026-11-19: the card has no "Einrichtung" line, the product table has
  // "Einrichtungsgebühr | 0 €".
  const DE = fixture('strato/de.html');
  const TABLE = /<table\b[\s\S]*?<\/table>/.exec(DE)?.[0] ?? '';
  const one = (body: string) => run({ [stratoPage('de')]: { body } }, ['de']);

  it('takes the setup fee from the product table when the card has no line, with a warning', async () => {
    expect(DE).not.toMatch(/Einrichtung:/);
    expect(TABLE).toContain('Einrichtungsgebühr');
    const result = await one(DE);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([
      '.de: setup fee from the product table, the price card has no "Einrichtung" line: "Einrichtungsgebühr | 0 €"',
    ]);
    expect(result.offers[0]).toMatchObject({
      tld: 'de',
      price: { unit: 'month', setup: 0, year1: 5, year1_regular: null, renewal: 100 },
      promo: { conditions: `Aktionspreis „für 12 Monate“ laut Preiskarte. ${PROMO_NOTE}` },
    });
    expect(parseCard(DE, 'de').setupSource).toEqual({
      from: 'table',
      text: 'Einrichtungsgebühr | 0 €',
    });
  });

  it('reads the table under the header "Domainendung" too (.com, 2026-11-19)', async () => {
    const com = fixture('strato/com.html');
    expect(com).not.toMatch(/Einrichtung:/);
    expect(com).toContain('>Domainendung</th>');
    const result = await run({ [stratoPage('com')]: { body: com } }, ['com']);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([
      '.com: setup fee from the product table, the price card has no "Einrichtung" line: "Einrichtungsgebühr | 0 €"',
    ]);
    expect(result.offers[0]).toMatchObject({
      tld: 'com',
      price: { unit: 'month', setup: 0, year1: 60, year1_regular: null, renewal: 180 },
    });
  });

  it('takes any amount from the table row', () => {
    const page =
      card({ term: 'für 12 Monate', disclaimer: 'danach 1 € /Mon.<br>' }) +
      TABLE.replace('0 €', '2,50 €');
    expect(parseCard(page, 'de')).toMatchObject({
      setup: 250,
      setupSource: { from: 'table', text: 'Einrichtungsgebühr | 2,50 €' },
    });
  });

  it('prefers the card line when the table agrees, without a warning', async () => {
    const result = await one(card() + TABLE);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.offers[0]?.price.setup).toBe(0);
    expect(parseCard(card() + TABLE, 'de').setupSource).toEqual({
      from: 'card',
      text: 'Einrichtung: 0 €',
    });
  });

  it('fails when the card line and the table differ, or neither is there', async () => {
    const noLine = card({ term: 'für 12 Monate', disclaimer: 'danach 1 € /Mon.<br>' });
    const cases: [string, string][] = [
      [
        card({ term: 'für 12 Monate', disclaimer: 'danach 1 € /Mon.<br> Einrichtung: 2,50 €' }) +
          TABLE,
        'setup fees differ: card "Einrichtung: 2,50 €", table "Einrichtungsgebühr | 0 €"',
      ],
      [DE.replace(TABLE, ''), 'setup fee missing'],
      [noLine, 'setup fee missing'],
      // only the header labels "TLD" and "Domainendung" mark a product table
      [noLine + TABLE.replace('>TLD<', '>Endung<'), 'setup fee missing'],
      // a table of another TLD is not the product table of .de
      [noLine + TABLE.replace('>.de<', '>.com<'), 'setup fee missing'],
      [
        noLine + TABLE.replace('Einrichtungsgebühr', 'Einrichtung'),
        'expected 1 "Einrichtungsgebühr" row in the .de product table, found 0',
      ],
      [noLine + TABLE.replace('0 €', 'kostenlos'), 'is not "<amount> €"'],
      [
        noLine + TABLE.replace('0 €', '0 €</td><td>einmalig'),
        'row "Einrichtungsgebühr | 0 € | einmalig" is not',
      ],
      [noLine + TABLE + TABLE, 'expected 1 product table for .de, found 2'],
      // a broken table fails the TLD even with a card line
      [card() + TABLE.replace('Einrichtungsgebühr', 'Gebühr'), 'found 0'],
    ];
    for (const [page, reason] of cases) {
      const result = await one(page);
      expect(result.offers, reason).toEqual([]);
      expect(result.warnings, reason).toEqual([]);
      expect(result.failed[0]?.reason, reason).toContain(reason);
    }
  });

  it('reads no product table on pages without one', () => {
    expect(tableSetup(fixture('strato/ch.html'), 'ch')).toBeNull();
    expect(tableSetup(DE, 'de')).toEqual({ cents: 0, text: 'Einrichtungsgebühr | 0 €' });
  });
});

describe('STRATO setup fee from the domain list', () => {
  /** The entries of the list fixture, in page order. */
  const BOXES = LIST.split(/(?=<div\b[^>]*\bdata-domain-infoBox\b)/);
  const NET_CODE = 'data-buy="STRATO_DOMAIN_NET_AKTION_VLZ12"';
  // the entries break the line inside "Einrichtung: 0 €"
  const SETUP_0 = /Einrichtung:\s+0\s+€/;
  const BIZ_CODE = 'data-buy="STRATO_DOMAIN_BIZ_AKTION_VLZ12"';
  const list = (edit: (box: string) => string | null) =>
    BOXES.map(edit)
      .filter((b) => b !== null)
      .join('');
  /** A product page as on 2026-11-19 for .net/.biz: card without "Einrichtung" line, no table. */
  const page = (tld: string, price: string, after: string, setupLine = '') =>
    card({
      tld,
      price: `<data value="${price.replace(',', '.')}"><strong>${price}&nbsp;€</strong></data>`,
      term: 'für 12 Monate',
      disclaimer: `danach ${after} € /Mon.<br>${setupLine}`,
    });
  const NET = page('net', '0,90', '1,50');
  const BIZ = page('biz', '1,40', '2,50');
  const one = (tld: string, body: string, listBody: string | null = LIST) =>
    run(
      {
        [stratoPage(tld)]: { body },
        [STRATO_DOMAIN_LIST]: listBody === null ? { status: 503, body: '' } : { body: listBody },
      },
      [tld],
    );

  it('takes the setup fee from the one 12-month entry with the order code (listed twice)', async () => {
    expect(BOXES.filter((b) => b.includes(NET_CODE) && b.includes('"12"'))).toHaveLength(2);
    const result = await one('net', NET);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([
      `.net: setup fee from ${STRATO_DOMAIN_LIST}, the price card has no "Einrichtung" line and the page no product table: ".net für 12 Monate 0,90 €/Mon., danach 1,50 €/Mon., Einrichtung: 0 €"`,
    ]);
    expect(result.offers[0]).toMatchObject({
      tld: 'net',
      price: { setup: 0, year1: 90, year1_regular: null, renewal: 150 },
    });
    expect(parseCard(NET, 'net', { html: LIST })).toMatchObject({
      setupSource: { from: 'list' },
      listCheck: 'source',
    });
  });

  it('fails without the entry, on different duplicates and on price differences', async () => {
    const cases: [string, string, string][] = [
      // no hit
      ['net', list((b) => (b.includes(NET_CODE) ? null : b)), 'setup fee missing'],
      // two 12-month entries with the same code but different text
      [
        'net',
        list((b) =>
          b === BOXES.find((x) => x.includes(NET_CODE))
            ? b.replace(SETUP_0, 'Einrichtung: 5 €')
            : b,
        ),
        '2 different 12-month entries for STRATO_DOMAIN_NET_AKTION_VLZ12',
      ],
      // the entry's prices differ from the card
      [
        'net',
        LIST.replace(/(danach[\s\S]*?<strong>\s*)1,50(\s)/g, '$11,60$2'),
        'differ from the price card',
      ],
      // Zusatz-Domains trap: 12 months, "Einrichtung: 2,50 €", but no order code
      ['biz', list((b) => (b.includes(BIZ_CODE) ? null : b)), 'setup fee missing'],
      // 1-month trap: the order code alone is not enough, the term must be 12 months
      [
        'biz',
        list((b) =>
          b.includes(BIZ_CODE) ? null : b.replace('data-buy="STRATO_DOMAIN_BIZ_VLZ1"', BIZ_CODE),
        ),
        'setup fee missing',
      ],
      // text not in the expected form
      ['net', LIST.replace(new RegExp(SETUP_0, 'g'), 'Einrichtung: gratis'), 'unexpected entry'],
    ];
    for (const [tld, listBody, reason] of cases) {
      const result = await one(tld, tld === 'net' ? NET : BIZ, listBody);
      expect(result.offers, reason).toEqual([]);
      expect(result.failed[0]?.reason, reason).toContain(reason);
    }
  });

  it('fails when the card line or the table states another setup fee than the list', async () => {
    const result = await one('net', page('net', '0,90', '1,50', ' Einrichtung: 2,50 €'));
    expect(result.failed[0]?.reason).toBe(
      'setup fees differ: card "Einrichtung: 2,50 €", list ".net für 12 Monate 0,90 €/Mon., danach 1,50 €/Mon., Einrichtung: 0 €"',
    );
    const conflict = await one(
      'de',
      fixture('strato/de.html'),
      list((b) =>
        b.includes('data-buy="STRATO_DOMAIN_DE_AKTION_VLZ12"')
          ? b.replace(SETUP_0, 'Einrichtung: 2,50 €')
          : b,
      ),
    );
    expect(conflict.failed[0]?.reason).toContain(
      'setup fees differ: table "Einrichtungsgebühr | 0 €", list',
    );
  });

  it('cross-checks card and table TLDs: ok, or no entry', () => {
    expect(parseCard(fixture('strato/de.html'), 'de', { html: LIST })).toMatchObject({
      setup: 0,
      setupSource: { from: 'table' },
      listCheck: 'ok',
    });
    expect(parseCard(fixture('strato/io.html'), 'io', { html: LIST }).listCheck).toBe('ok');
    expect(parseCard(fixture('strato/com.html'), 'com', { html: LIST }).listCheck).toBe('no entry');
    // an entry with one price (no "danach"): here the 1-month .biz entry, relabelled as 12 months
    const vlz1 = BOXES.find((x) => x.includes('data-buy="STRATO_DOMAIN_BIZ_VLZ1"')) ?? '';
    expect(
      listEntry(
        vlz1.replace('data-contract-duration="1"', 'data-contract-duration="12"'),
        'biz',
        'STRATO_DOMAIN_BIZ_VLZ1',
      ),
    ).toEqual({
      current: 270,
      after: null,
      setup: 1000,
      text: '.biz 2,70 €/Mon., Einrichtung: 10 €',
    });
    expect(listEntry(LIST, 'biz', 'STRATO_DOMAIN_BIZ_AKTION_VLZ12')).toEqual({
      current: 140,
      after: 250,
      setup: 0,
      text: '.biz für 12 Monate 1,40 €/Mon., danach 2,50 €/Mon., Einrichtung: 0 €',
    });
  });

  it('without the list only the TLDs that need it fail, with a warning', async () => {
    const result = await run(
      {
        [stratoPage('net')]: { body: NET },
        [stratoPage('de')]: { body: fixture('strato/de.html') },
        [STRATO_DOMAIN_LIST]: { status: 503, body: '' },
      },
      ['net', 'de'],
    );
    expect(result.offers.map((o) => o.tld)).toEqual(['de']);
    expect(result.failed[0]?.reason).toMatch(/^setup fee missing: .*not fetched: .*503/);
    expect(result.warnings[0]).toMatch(
      /^domain list not fetched: .*503.*\(https:\/\/www\.strato\.de\/domains\/\)$/,
    );
    expect(parseCard(fixture('strato/de.html'), 'de', { error: 'HTTP 503' }).listCheck).toBe(
      'not fetched',
    );
  });
});
