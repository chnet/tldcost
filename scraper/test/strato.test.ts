import { describe, expect, it } from 'vitest';
import {
  euroCents,
  parseCard,
  PROMO_NOTE,
  strato,
  STRATO_OVERVIEW,
  stratoPage,
  tableSetup,
} from '../src/adapters/strato.js';
import { ctxFor, fixture, testHttp, type Routes } from './helpers.js';

const ROBOTS = {
  'https://www.strato.de/robots.txt': {
    body: 'User-agent: *\nDisallow: /apps/\nDisallow: /error/\nAllow: /apps/CustomerService\n',
  },
};
const OVERVIEW = fixture('strato/domain-kosten.html');
const pages = (...tlds: string[]) =>
  Object.fromEntries(tlds.map((t) => [stratoPage(t), { body: fixture(`strato/${t}.html`) }]));
const run = (routes: Routes, tlds: readonly string[], overview = OVERVIEW) =>
  strato.fetch(
    ctxFor(testHttp({ ...ROBOTS, [STRATO_OVERVIEW]: { body: overview }, ...routes }).http, tlds),
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
        'setup fee on the card ("Einrichtung: 2,50 €") differs from the product table ("Einrichtungsgebühr | 0 €")',
      ],
      [DE.replace(TABLE, ''), 'setup fee missing'],
      [noLine, 'setup fee missing'],
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
