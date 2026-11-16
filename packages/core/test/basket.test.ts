import { describe, expect, it } from 'vitest';
import { computeBasket, MAX_BASKET_COUNT, type FxRates, type Offer } from '../src/index.js';
import { offer } from './fixtures.js';

const o = (provider: string, tld: string, price: Partial<Offer['price']> = {}, rest = {}) =>
  offer(price, { provider, tld, ...rest });

const ECB: FxRates = {
  schema_version: 1,
  source: 'ECB',
  date: '2026-10-30',
  base: 'EUR',
  rates: { USD: 1.25 },
  source_url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  fetched_at: '2026-10-30T16:00:00Z',
};

describe('computeBasket: new registration', () => {
  it('totals per provider = sum of (TCO of one domain × count), cheapest first', () => {
    const offers = [
      o('alpha', 'de', { year1: 500, renewal: 500 }),
      o('alpha', 'com', { year1: 1000, renewal: 1200 }),
      o('bravo', 'de', { setup: 100, year1: 400, renewal: 400 }),
      o('bravo', 'com', { year1: 900, renewal: 900 }),
      o('bravo', 'net', { year1: 1, renewal: 1 }), // not in the basket: ignored
    ];
    const r = computeBasket(
      offers,
      [
        { tld: 'de', count: 10 },
        { tld: 'com', count: 3 },
      ],
      3,
      'new',
    );
    expect(r).toMatchObject({ years: 3, mode: 'new', price: 'gross', currency: 'EUR' });
    // bravo: de (100 + 3 × 400) × 10 = 13000, com 2700 × 3 = 8100
    // alpha: de 1500 × 10 = 15000, com (1000 + 2 × 1200) × 3 = 10200
    expect(r.providers.map((p) => [p.provider, p.total])).toEqual([
      ['bravo', 21100],
      ['alpha', 25200],
    ]);
    expect(r.providers[0]?.lines).toEqual([
      {
        tld: 'de',
        count: 10,
        status: 'ok',
        each: 1300,
        eachRegular: null,
        regularFromRenewal: false,
        promoDomains: null,
        promoScope: null,
        subtotal: 13000,
        missing: [],
        vatNotStated: false,
        fx: null,
        transferIncludesTerm: null,
      },
      {
        tld: 'com',
        count: 3,
        status: 'ok',
        each: 2700,
        eachRegular: null,
        regularFromRenewal: false,
        promoDomains: null,
        promoScope: null,
        subtotal: 8100,
        missing: [],
        vatNotStated: false,
        fx: null,
        transferIncludesTerm: null,
      },
    ]);
  });

  it('missing TLD: the line says "not offered", no total, the provider sorts last', () => {
    const offers = [
      o('alpha', 'de', { year1: 100, renewal: 100 }),
      o('bravo', 'de', { year1: 9000, renewal: 9000 }),
      o('bravo', 'eu', { year1: 9000, renewal: 9000 }),
    ];
    const r = computeBasket(
      offers,
      [
        { tld: 'de', count: 1 },
        { tld: 'eu', count: 1 },
      ],
      1,
      'new',
    );
    expect(r.providers.map((p) => [p.provider, p.total])).toEqual([
      ['bravo', 18000],
      ['alpha', null],
    ]);
    expect(r.providers[1]?.lines[1]).toMatchObject({
      tld: 'eu',
      status: 'not_offered',
      each: null,
      subtotal: null,
    });
    // the complete line still shows its subtotal
    expect(r.providers[1]?.lines[0]).toMatchObject({ status: 'ok', subtotal: 100 });
  });

  it('a provider without any basket TLD is not listed', () => {
    const r = computeBasket([o('alpha', 'net')], [{ tld: 'de', count: 1 }], 1, 'new');
    expect(r.providers).toEqual([]);
    expect(r.mix).toEqual({
      total: null,
      lines: [
        {
          tld: 'de',
          count: 1,
          providers: [],
          subtotal: null,
          vatNotStated: false,
          regularFromRenewal: false,
        },
      ],
      vatNotStated: false,
    });
  });

  it('monthly prices are annualised (× 12), setup stays one-off', () => {
    const offers = [o('alpha', 'de', { unit: 'month', setup: 200, year1: 8, renewal: 99 })];
    const r = computeBasket(offers, [{ tld: 'de', count: 2 }], 3, 'new');
    // 200 + 8 × 12 + 2 × 99 × 12 = 2672 per domain
    expect(r.providers[0]?.lines[0]).toMatchObject({ each: 2672, subtotal: 5344 });
  });

  it('VAT not stated: amount as stated in gross and net mode, flagged on line, provider and mix', () => {
    const offers = [
      o('porky', 'com', { year1: 1000, renewal: 1000 }, { vat_included: null }),
      o('alpha', 'com', { year1: 1190, renewal: 1190 }),
    ];
    const basket = [{ tld: 'com', count: 2 }];
    for (const price of ['gross', 'net'] as const) {
      const r = computeBasket(offers, basket, 1, 'new', {
        price,
        providers: { alpha: { vat_rate: 1900 } },
      });
      const porky = r.providers.find((p) => p.provider === 'porky');
      expect(porky).toMatchObject({ total: 2000, vatNotStated: true });
      expect(porky?.lines[0]?.vatNotStated).toBe(true);
      expect(r.providers.find((p) => p.provider === 'alpha')).toMatchObject({
        total: price === 'gross' ? 2380 : 2000,
        vatNotStated: false,
      });
    }
    const gross = computeBasket(offers, basket, 1, 'new');
    expect(gross.mix).toMatchObject({ total: 2000, vatNotStated: true });
    expect(gross.mix.lines[0]?.providers).toEqual(['porky']);
  });

  it('net offers need the provider VAT rate; without it the line is missing', () => {
    const offers = [o('alpha', 'de', { year1: 1000, renewal: 1000 }, { vat_included: false })];
    const with19 = computeBasket(offers, [{ tld: 'de', count: 1 }], 1, 'new', {
      providers: { alpha: { vat_rate: 1900 } },
    });
    expect(with19.providers[0]?.total).toBe(1190);
    const without = computeBasket(offers, [{ tld: 'de', count: 1 }], 1, 'new');
    expect(without.providers[0]?.lines[0]).toMatchObject({
      status: 'missing',
      missing: ['vat_rate'],
    });
    expect(without.providers[0]?.total).toBeNull();
  });

  it('foreign currency: the newest ECB rate up to fetched_at; none means missing', () => {
    const offers = [
      o('porky', 'com', { year1: 1250, renewal: 1250 }, { currency: 'USD', vat_included: null }),
    ];
    const r = computeBasket(offers, [{ tld: 'com', count: 1 }], 1, 'new', { fx: [ECB] });
    expect(r.providers[0]?.lines[0]).toMatchObject({
      each: 1000,
      fx: { currency: 'USD', perEur: 1.25, date: '2026-10-30' },
    });
    const none = computeBasket(offers, [{ tld: 'com', count: 1 }], 1, 'new');
    expect(none.providers[0]?.lines[0]).toMatchObject({ status: 'missing', missing: ['fx.USD'] });
  });
});

describe('computeBasket: promo limit (new mode, owner decision 2026-11-15)', () => {
  // promo 1,00 € in year 1, list price 10,00 €, renewal 10,00 €: 3 years 21,00 € with promo,
  // 30,00 € without (saving 9,00 € per domain)
  const promo = (tld: string, extra: Partial<Offer['promo']> = {}, price = {}) =>
    o(
      'alpha',
      tld,
      { year1: 100, year1_regular: 1000, renewal: 1000, ...price },
      {
        promo: { conditions: 'Das Angebot gilt nur einmal pro Kunde.', ...extra },
      },
    );

  it('limit not stated: ONE promo domain in total per provider, the rest at year1_regular', () => {
    const r = computeBasket([promo('de')], [{ tld: 'de', count: 10 }], 3, 'new');
    expect(r.providers[0]?.lines[0]).toMatchObject({
      status: 'ok',
      each: 2100,
      eachRegular: 3000,
      promoDomains: 1,
      promoScope: 'per_customer',
      subtotal: 2100 + 9 * 3000,
    });
    expect(r.providers[0]?.promoPool).toEqual({
      budget: 1,
      credited: [{ tld: 'de', domains: 1 }],
      limited: true,
    });
    // across TLDs, not one per TLD: com gets no promo domain
    const two = computeBasket(
      [promo('de'), promo('com')],
      [
        { tld: 'de', count: 1 },
        { tld: 'com', count: 1 },
      ],
      3,
      'new',
    );
    expect(two.providers[0]?.lines.map((l) => [l.tld, l.promoDomains, l.subtotal])).toEqual([
      ['de', 0, 3000],
      ['com', 1, 2100],
    ]);
    // one domain: nothing is limited
    const one = computeBasket([promo('de')], [{ tld: 'de', count: 1 }], 3, 'new');
    expect(one.providers[0]?.lines[0]).toMatchObject({ promoDomains: 1, subtotal: 2100 });
    expect(one.providers[0]?.promoPool?.limited).toBe(false);
  });

  it('a limit without scope, or a scope without limit, is also ONE in total', () => {
    for (const extra of [
      { max_per_customer: 3 },
      { limit_scope: 'per_tld' as const },
      { limit_scope: 'per_customer' as const },
    ]) {
      const r = computeBasket([promo('de', extra)], [{ tld: 'de', count: 5 }], 3, 'new');
      expect(r.providers[0]?.lines[0]?.promoDomains, JSON.stringify(extra)).toBe(1);
    }
  });

  it('per_tld N: N promo domains for each such TLD on its own; capped at the count', () => {
    const perTld = { max_per_customer: 3, limit_scope: 'per_tld' as const };
    const r = computeBasket(
      [promo('de', perTld), promo('com', perTld)],
      [
        { tld: 'de', count: 10 },
        { tld: 'com', count: 2 },
      ],
      3,
      'new',
    );
    expect(r.providers[0]?.lines.map((l) => [l.promoDomains, l.promoScope, l.subtotal])).toEqual([
      [3, 'per_tld', 3 * 2100 + 7 * 3000],
      [2, 'per_tld', 2 * 2100],
    ]);
    expect(r.providers[0]?.promoPool).toBeNull();
  });

  it('per_customer N: N promo domains across all TLDs, smallest saving first', () => {
    const perCustomer = { max_per_customer: 3, limit_scope: 'per_customer' as const };
    // com saves 1,00 € per domain over 3 years (9,00 vs 10,00 in year 1), de 9,00 €
    const r = computeBasket(
      [promo('de', perCustomer), promo('com', perCustomer, { year1: 900 })],
      [
        { tld: 'de', count: 5 },
        { tld: 'com', count: 2 },
      ],
      3,
      'new',
    );
    expect(r.providers[0]?.promoPool).toEqual({
      budget: 3,
      credited: [
        { tld: 'com', domains: 2 },
        { tld: 'de', domains: 1 },
      ],
      limited: true,
    });
    expect(r.providers[0]?.lines.map((l) => [l.tld, l.promoDomains, l.subtotal])).toEqual([
      ['de', 1, 2100 + 4 * 3000],
      ['com', 2, 2 * 2900],
    ]);
    // within the budget every pooled domain gets the promo (credited in TLD id order)
    const within = computeBasket(
      [promo('de', perCustomer), promo('com', perCustomer)],
      [
        { tld: 'de', count: 1 },
        { tld: 'com', count: 2 },
      ],
      3,
      'new',
    );
    expect(within.providers[0]?.promoPool).toEqual({
      budget: 3,
      credited: [
        { tld: 'com', domains: 2 },
        { tld: 'de', domains: 1 },
      ],
      limited: false,
    });
    // the smallest stated limit wins; any pooled promo without a number makes it ONE
    const mixed = computeBasket(
      [
        promo('de', perCustomer),
        promo('com', { max_per_customer: 2, limit_scope: 'per_customer' }),
      ],
      [
        { tld: 'de', count: 5 },
        { tld: 'com', count: 5 },
      ],
      3,
      'new',
    );
    expect(mixed.providers[0]?.promoPool?.budget).toBe(2);
    const withNull = computeBasket(
      [promo('de', perCustomer), promo('com')],
      [
        { tld: 'de', count: 5 },
        { tld: 'com', count: 5 },
      ],
      3,
      'new',
    );
    expect(withNull.providers[0]?.promoPool?.budget).toBe(1);
  });

  it('limit_scope unlimited: every domain of that TLD, outside the per-customer pool', () => {
    // Host-Europe-like: .de/.com one per customer, all other promo TLDs unlimited
    const source = (quote: string) => ({ url: 'https://registrar.example/preise', quote });
    const once = {
      max_per_customer: 1,
      limit_scope: 'per_customer' as const,
      max_per_customer_source: source('.de & .com nur ... eine pro Kunde.'),
    };
    const free = {
      max_per_customer: null,
      limit_scope: 'unlimited' as const,
      max_per_customer_source: source('Alle anderen TLDs unbegrenzt.'),
    };
    const r = computeBasket(
      [promo('de', once), promo('com', once), promo('eu', free), promo('io', free)],
      [
        { tld: 'de', count: 2 },
        { tld: 'com', count: 1 },
        { tld: 'eu', count: 2 },
        { tld: 'io', count: 1 },
      ],
      3,
      'new',
    );
    const p = r.providers[0];
    // the pool holds only .de/.com: budget 1, equal saving, tie by id → .com
    expect(p?.promoPool).toEqual({
      budget: 1,
      credited: [{ tld: 'com', domains: 1 }],
      limited: true,
    });
    expect(p?.lines.map((l) => [l.tld, l.promoScope, l.promoDomains, l.subtotal])).toEqual([
      ['de', 'per_customer', 0, 2 * 3000],
      ['com', 'per_customer', 1, 2100],
      ['eu', 'unlimited', 2, 2 * 2100],
      ['io', 'unlimited', 1, 2100],
    ]);
    expect(p?.total).toBe(6000 + 2100 + 4200 + 2100);
    // unlimited TLDs alone: no pool at all
    const alone = computeBasket([promo('eu', free)], [{ tld: 'eu', count: 50 }], 3, 'new');
    expect(alone.providers[0]?.promoPool).toBeNull();
    expect(alone.providers[0]?.lines[0]).toMatchObject({ promoDomains: 50, subtotal: 50 * 2100 });
  });

  it('unlimited without a verbatim quote, or with a number, fails closed into the pool', () => {
    for (const extra of [
      { limit_scope: 'unlimited' as const },
      {
        limit_scope: 'unlimited' as const,
        max_per_customer_source: { url: 'https://registrar.example/preise' },
      },
      { limit_scope: 'unlimited' as const, max_per_customer_source: { quote: '  ' } },
      {
        limit_scope: 'unlimited' as const,
        max_per_customer: 3,
        max_per_customer_source: { quote: 'unbegrenzt' },
      },
    ]) {
      const r = computeBasket([promo('eu', extra)], [{ tld: 'eu', count: 4 }], 3, 'new');
      expect(r.providers[0]?.lines[0], JSON.stringify(extra)).toMatchObject({
        promoScope: 'per_customer',
        promoDomains: 1,
      });
    }
  });

  it('tie on the saving: the TLD with the lower id gets the promo', () => {
    const r = computeBasket(
      [promo('net'), promo('com'), promo('de')],
      [
        { tld: 'net', count: 1 },
        { tld: 'de', count: 1 },
        { tld: 'com', count: 1 },
      ],
      3,
      'new',
    );
    expect(r.providers[0]?.promoPool?.credited).toEqual([{ tld: 'com', domains: 1 }]);
    expect(r.providers[0]?.lines.map((l) => [l.tld, l.promoDomains])).toEqual([
      ['net', 0],
      ['de', 0],
      ['com', 1],
    ]);
  });

  it('a promo by below-list price alone counts too; a stated list price is no assumption', () => {
    const belowList = o('alpha', 'de', { year1: 100, year1_regular: 1000, renewal: 1000 });
    expect(
      computeBasket([belowList], [{ tld: 'de', count: 2 }], 1, 'new').providers[0]?.lines[0],
    ).toMatchObject({ promoDomains: 1, subtotal: 100 + 1000, regularFromRenewal: false });
    // a pooled line that is missing anyway (no renewal) takes no part in the allocation
    const broken = promo('com', {}, { renewal: null });
    const withBroken = computeBasket(
      [promo('de'), broken],
      [
        { tld: 'de', count: 1 },
        { tld: 'com', count: 1 },
      ],
      3,
      'new',
    );
    expect(withBroken.providers[0]?.promoPool).toEqual({
      budget: 1,
      credited: [{ tld: 'de', domains: 1 }],
      limited: false,
    });
  });

  it('list price not stated: further domains pay the renewal price in year 1 (assumption)', () => {
    const noList = o(
      'alpha',
      'de',
      { year1: 100, renewal: 1000 },
      {
        promo: { valid_until: '2026-12-31' },
      },
    );
    const r = computeBasket([noList], [{ tld: 'de', count: 2 }], 3, 'new');
    expect(r.providers[0]?.lines[0]).toMatchObject({
      status: 'ok',
      eachRegular: 3000,
      regularFromRenewal: true,
      subtotal: 2100 + 3000,
    });
    // with one domain nothing is assumed
    const one = computeBasket([noList], [{ tld: 'de', count: 1 }], 3, 'new');
    expect(one.providers[0]?.lines[0]).toMatchObject({ subtotal: 2100, regularFromRenewal: false });
    // per_tld above its limit: the same assumption
    const perTld = o(
      'alpha',
      'de',
      { year1: 100, renewal: 1000 },
      {
        promo: { conditions: 'x', max_per_customer: 1, limit_scope: 'per_tld' },
      },
    );
    expect(
      computeBasket([perTld], [{ tld: 'de', count: 3 }], 3, 'new').providers[0]?.lines[0],
    ).toMatchObject({ status: 'ok', regularFromRenewal: true, subtotal: 2100 + 2 * 3000 });
  });

  it('first term longer than the renewal term: no assumption, k. A. where the limit bites', () => {
    // registration only for 2 years, renewals yearly: the renewal price would pay for 1 year only
    const twoYearFirst = o(
      'alpha',
      'ai',
      { year1: 5000, renewal: 4000, term_years: 2 },
      {
        promo: { conditions: 'Aktion' },
      },
    );
    const r = computeBasket([twoYearFirst], [{ tld: 'ai', count: 2 }], 3, 'new');
    expect(r.providers[0]?.lines[0]).toMatchObject({
      status: 'missing',
      missing: ['price.year1_regular'],
      eachRegular: null,
      regularFromRenewal: false,
    });
    // equal multi-year terms (2/2): the renewal price covers the same term, so it is used
    const twoTwo = o(
      'alpha',
      'ai',
      { year1: 5000, renewal: 8000, term_years: 2, renewal_term_years: 2 },
      { promo: { conditions: 'Aktion' } },
    );
    expect(
      computeBasket([twoTwo], [{ tld: 'ai', count: 2 }], 3, 'new').providers[0]?.lines[0],
    ).toMatchObject({ status: 'ok', regularFromRenewal: true, eachRegular: 16000 });
  });

  it('neither list price nor renewal stated: k. A. where the limit bites, as before', () => {
    // 1 year: computeTco needs no renewal, so only the further domain lacks a price
    const bare = o(
      'alpha',
      'de',
      { year1: 100, renewal: null },
      {
        promo: { conditions: 'nur einmal pro Kunde' },
      },
    );
    const r = computeBasket([bare], [{ tld: 'de', count: 2 }], 1, 'new');
    expect(r.providers[0]?.lines[0]).toMatchObject({
      status: 'missing',
      missing: ['price.year1_regular'],
      subtotal: null,
      regularFromRenewal: false,
    });
    expect(r.providers[0]?.total).toBeNull();
    // the per_tld path ends the same way
    const perTld = {
      ...bare,
      promo: { conditions: 'x', max_per_customer: 1, limit_scope: 'per_tld' as const },
    };
    expect(
      computeBasket([perTld], [{ tld: 'de', count: 2 }], 1, 'new').providers[0]?.lines[0],
    ).toMatchObject({ status: 'missing', missing: ['price.year1_regular'] });
  });

  it('IONOS-like: monthly promo, no list price: 1 promo domain, 9 at the renewal price', () => {
    const ionos = o(
      'ionos',
      'de',
      { unit: 'month', setup: 0, year1: 8, year1_regular: null, renewal: 130 },
      { promo: { conditions: 'Willkommensangebot, gilt im ersten Jahr (12 Monate)' } },
    );
    const r = computeBasket([ionos], [{ tld: 'de', count: 10 }], 3, 'new');
    // promo domain: 8 × 12 + 2 × 130 × 12 = 3216; further: 3 × 130 × 12 = 4680
    expect(r.providers[0]?.lines[0]).toMatchObject({
      each: 3216,
      eachRegular: 4680,
      promoDomains: 1,
      regularFromRenewal: true,
      subtotal: 3216 + 9 * 4680,
    });
  });

  it('STRATO-like: three monthly promos, no list prices: the smallest saving gets the promo', () => {
    const strato = (tld: string, year1: number, renewal: number) =>
      o(
        'strato',
        tld,
        { unit: 'month', setup: 0, year1, year1_regular: null, renewal },
        { promo: { conditions: 'Aktionspreis für 12 Monate' } },
      );
    const r = computeBasket(
      [strato('de', 5, 100), strato('com', 60, 180), strato('eu', 20, 100)],
      [
        { tld: 'de', count: 1 },
        { tld: 'com', count: 1 },
        { tld: 'eu', count: 1 },
      ],
      3,
      'new',
    );
    // savings over the assumed renewal year 1: de 1140, com 1440, eu 960 → eu
    expect(r.providers[0]?.promoPool?.credited).toEqual([{ tld: 'eu', domains: 1 }]);
    expect(
      r.providers[0]?.lines.map((l) => [l.tld, l.promoDomains, l.regularFromRenewal, l.subtotal]),
    ).toEqual([
      ['de', 0, true, 3600],
      ['com', 0, true, 6480],
      ['eu', 1, false, 240 + 2400],
    ]);
    expect(r.providers[0]?.total).toBe(3600 + 6480 + 2640);
  });

  it('Porkbun-like: USD, no VAT statement, list price stated: no assumption', () => {
    const porkbun = o(
      'porkbun',
      'de',
      { year1: 290, year1_regular: 549, renewal: 407 },
      { currency: 'USD', vat_included: null, promo: { conditions: 'Sale!' } },
    );
    const fx = [
      {
        schema_version: 1 as const,
        source: 'ECB' as const,
        date: '2026-10-30',
        base: 'EUR' as const,
        rates: { USD: 1 },
        source_url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
        fetched_at: '2026-10-30T16:00:00Z',
      },
    ];
    const r = computeBasket([porkbun], [{ tld: 'de', count: 2 }], 3, 'new', { fx });
    expect(r.providers[0]?.lines[0]).toMatchObject({
      each: 290 + 2 * 407,
      eachRegular: 549 + 2 * 407,
      regularFromRenewal: false,
      vatNotStated: true,
      subtotal: 290 + 549 + 4 * 407,
    });
  });

  it('transfer mode ignores promos; the ranking and the mix use the limited subtotal', () => {
    const t = promo('de');
    const withTransfer = { ...t, price: { ...t.price, transfer_in: 0 } };
    const tr = computeBasket([withTransfer], [{ tld: 'de', count: 5 }], 1, 'transfer');
    expect(tr.providers[0]?.lines[0]).toMatchObject({
      promoDomains: null,
      promoScope: null,
      eachRegular: null,
      subtotal: 5 * 1000,
    });
    expect(tr.providers[0]?.promoPool).toBeNull();
    // bravo without promo at 2,50 €/year beats alpha's single promo domain for 10 domains
    const bravo = o('bravo', 'de', { year1: 250, renewal: 250 });
    const r = computeBasket([promo('de'), bravo], [{ tld: 'de', count: 10 }], 3, 'new');
    expect(r.providers.map((p) => [p.provider, p.total])).toEqual([
      ['bravo', 7500],
      ['alpha', 29100],
    ]);
    expect(r.mix.lines[0]).toMatchObject({ providers: ['bravo'], subtotal: 7500 });
  });
});

describe('computeBasket: existing domains (transfer)', () => {
  it('default (owner rule): transfer_in once plus the renewal price from year 1', () => {
    const offers = [
      o('alpha', 'de', { year1: 8, year1_regular: 99, renewal: 990, transfer_in: 0 }),
      o('bravo', 'de', { unit: 'month', setup: 0, year1: 8, renewal: 99, transfer_in: 500 }),
      o('charlie', 'de', { renewal: 990, transfer_in: 100, transfer_includes_term: false }),
    ];
    const r = computeBasket(offers, [{ tld: 'de', count: 4 }], 3, 'transfer');
    expect(r.mode).toBe('transfer');
    // alpha: 0 + 3 × 990 = 2970; charlie: 100 + 3 × 990 = 3070;
    // bravo: 500 (one-off, not × 12) + 3 × 99 × 12 = 4064; year1 and promos never apply
    expect(r.providers.map((p) => [p.provider, p.lines[0]?.each, p.total])).toEqual([
      ['alpha', 2970, 11880],
      ['charlie', 3070, 12280],
      ['bravo', 4064, 16256],
    ]);
    expect(r.providers.map((p) => p.lines[0]?.transferIncludesTerm)).toEqual([null, false, null]);
  });

  it('transfer_includes_term true: the transfer covers 1 year, the first renewal is due in year 2', () => {
    const offers = [
      o('alpha', 'de', {
        renewal: 990,
        transfer_in: 100,
        transfer_includes_term: true,
        transfer_includes_term_source: { url: 'https://registrar.example/transfer' },
      }),
    ];
    const r = computeBasket(offers, [{ tld: 'de', count: 2 }], 3, 'transfer');
    expect(r.providers[0]?.lines[0]).toMatchObject({
      each: 100 + 2 * 990,
      transferIncludesTerm: true,
    });
    expect(r.providers[0]?.total).toBe(2 * (100 + 2 * 990));
    // new mode: the field plays no part
    const fresh = computeBasket(offers, [{ tld: 'de', count: 1 }], 3, 'new');
    expect(fresh.providers[0]?.lines[0]).toMatchObject({
      each: 504 + 2 * 990,
      transferIncludesTerm: null,
    });
  });

  it('transfer_includes_term true with a 2-year renewal term: "Transferlaufzeit unklar", no total', () => {
    const offers = [
      o('alpha', 'ai', {
        renewal: 8000,
        renewal_term_years: 2,
        transfer_in: 8000,
        transfer_includes_term: true,
        transfer_includes_term_source: { quote: 'Der Transfer verlängert die Domain.' },
      }),
      o('bravo', 'ai', { renewal: 9000, renewal_term_years: 2, transfer_in: 100 }),
    ];
    const r = computeBasket(offers, [{ tld: 'ai', count: 1 }], 3, 'transfer');
    expect(r.providers.map((p) => [p.provider, p.total])).toEqual([
      ['bravo', 100 + 2 * 9000],
      ['alpha', null],
    ]);
    expect(r.providers[1]?.lines[0]).toMatchObject({
      status: 'missing',
      missing: ['transfer_term_unclear'],
      transferIncludesTerm: true,
      subtotal: null,
    });
  });

  it('missing transfer price: status missing with price.transfer_in, no total ("Transfer-Preis fehlt")', () => {
    const offers = [
      o('alpha', 'de', { transfer_in: null }),
      o('bravo', 'de', {}), // field absent counts as missing too
      o('charlie', 'de', { transfer_in: 300 }),
    ];
    const r = computeBasket(offers, [{ tld: 'de', count: 1 }], 2, 'transfer');
    expect(r.providers.map((p) => [p.provider, p.total])).toEqual([
      ['charlie', 300 + 2 * 504],
      ['alpha', null],
      ['bravo', null],
    ]);
    for (const p of r.providers.slice(1)) {
      expect(p.lines[0]).toMatchObject({ status: 'missing', missing: ['price.transfer_in'] });
    }
    // the same offers in new mode are complete
    const fresh = computeBasket(offers, [{ tld: 'de', count: 1 }], 2, 'new');
    expect(fresh.providers.every((p) => p.total === 1008)).toBe(true);
  });
});

describe('computeBasket: cheapest mix and order', () => {
  const offers = [
    o('alpha', 'de', { year1: 100, renewal: 100 }),
    o('alpha', 'com', { year1: 900, renewal: 900 }),
    o('bravo', 'de', { year1: 300, renewal: 300 }),
    o('bravo', 'com', { year1: 500, renewal: 500 }),
    o('charlie', 'com', { year1: 500, renewal: 500 }),
  ];
  const basket = [
    { tld: 'de', count: 2 },
    { tld: 'com', count: 1 },
  ];

  it('per TLD the cheapest complete price; a tie keeps every tied provider', () => {
    const r = computeBasket(offers, basket, 1, 'new');
    expect(r.mix).toEqual({
      total: 2 * 100 + 500,
      lines: [
        {
          tld: 'de',
          count: 2,
          providers: ['alpha'],
          subtotal: 200,
          vatNotStated: false,
          regularFromRenewal: false,
        },
        {
          tld: 'com',
          count: 1,
          providers: ['bravo', 'charlie'],
          subtotal: 500,
          vatNotStated: false,
          regularFromRenewal: false,
        },
      ],
      vatNotStated: false,
    });
  });

  it('equal totals: more complete lines first, then provider id', () => {
    const r = computeBasket(
      [
        o('zulu', 'de', { year1: 100, renewal: 100 }),
        o('alpha', 'de', { year1: 100, renewal: 100 }),
        o('mike', 'com', { year1: 1, renewal: 1 }),
        o('kilo', 'de', { year1: 1, renewal: 1 }),
        o('kilo', 'com', { year1: 1, renewal: 1 }, { vat_included: false }),
      ],
      [{ tld: 'de', count: 1 }],
      1,
      'new',
    );
    expect(r.providers.map((p) => p.provider)).toEqual(['kilo', 'alpha', 'zulu']);
    // no total anywhere: more complete lines first, against the id order
    const partial = computeBasket(
      [o('zulu', 'de'), o('bravo', 'de', { renewal: null }), o('bravo', 'com', { renewal: null })],
      [
        { tld: 'de', count: 1 },
        { tld: 'com', count: 1 },
      ],
      2,
      'new',
    );
    expect(partial.providers.map((p) => [p.provider, p.total])).toEqual([
      ['zulu', null],
      ['bravo', null],
    ]);
  });

  it('is independent of the input order of offers', () => {
    const a = computeBasket(offers, basket, 3, 'new');
    const b = computeBasket([...offers].reverse(), basket, 3, 'new');
    expect(b).toEqual(a);
  });
});

describe('computeBasket: input checks', () => {
  it('rejects bad years, modes, TLDs, counts, duplicates', () => {
    const one = [{ tld: 'de', count: 1 }];
    expect(() => computeBasket([], one, 0, 'new')).toThrow(/years/);
    expect(() => computeBasket([], one, 11, 'new')).toThrow(/years/);
    expect(() => computeBasket([], one, 1, 'swap' as 'new')).toThrow(/mode/);
    expect(() => computeBasket([], [{ tld: '.de', count: 1 }], 1, 'new')).toThrow(/invalid TLD/);
    expect(() => computeBasket([], [{ tld: 'de', count: 0 }], 1, 'new')).toThrow(/count/);
    expect(() => computeBasket([], [{ tld: 'de', count: 1.5 }], 1, 'new')).toThrow(/count/);
    expect(() => computeBasket([], [{ tld: 'de', count: MAX_BASKET_COUNT + 1 }], 1, 'new')).toThrow(
      /count/,
    );
    expect(() => computeBasket([], [...one, ...one], 1, 'new')).toThrow(/listed twice/);
    expect(() => computeBasket([o('a', 'de'), o('a', 'de')], one, 1, 'new')).toThrow(
      /a\/de listed twice/,
    );
    expect(
      computeBasket([], [{ tld: 'co.uk', count: MAX_BASKET_COUNT }], 1, 'new').providers,
    ).toEqual([]);
  });

  it('an empty basket has no providers and no mix total', () => {
    const r = computeBasket([o('a', 'de')], [], 3, 'new');
    expect(r.providers).toEqual([]);
    expect(r.mix).toEqual({ total: null, lines: [], vatNotStated: false });
  });
});
