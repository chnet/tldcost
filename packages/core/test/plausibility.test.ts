import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAUSIBILITY_HIGH,
  DEFAULT_PLAUSIBILITY_LOW,
  median,
  plausibilityCheck,
  plausibilityHits,
  yearlyGross,
  type FxRates,
  type Offer,
  type OfferPrice,
} from '../src/index.js';
import { offer } from './fixtures.js';

const FX: FxRates[] = [
  { schema_version: 1, source: 'ECB', date: '2026-10-30', base: 'EUR', rates: { USD: 1.1 } },
];
const PROVIDERS = ['a', 'b', 'c', 'd', 'm', 'u'].map((id) => ({ id, vat_rate: 1900 }));

/** Gross EUR offer of provider `id` for `tld` with a yearly renewal price (cents). */
const at = (id: string, renewal: number, price: Partial<OfferPrice> = {}, tld = 'de'): Offer =>
  offer({ year1: renewal, renewal, ...price }, { provider: id, tld });

describe('yearlyGross', () => {
  it('annualises monthly prices and adds VAT to net prices', () => {
    expect(yearlyGross(at('a', 42, { unit: 'month' }), undefined, FX)).toEqual({
      field: 'price.renewal',
      value: 504,
    });
    const net = offer({ renewal: 1000 }, { vat_included: false });
    expect(yearlyGross(net, { vat_rate: 1900 }, FX)?.value).toBe(1190);
    expect(yearlyGross({ ...net, vat_rate: 700 }, { vat_rate: 1900 }, FX)?.value).toBe(1070);
  });

  it('converts foreign currencies with the ECB rate of the fetch date', () => {
    const usd = offer({ renewal: 1100 }, { currency: 'USD', vat_included: null });
    expect(yearlyGross(usd, undefined, FX)?.value).toBe(1000);
  });

  it('divides multi-year terms by their years', () => {
    const twoYears = { renewal: 22992, renewal_term_years: 2 };
    expect(yearlyGross(offer(twoYears), undefined, FX)?.value).toBe(11496);
  });

  it('uses the regular year-1 price only when there is no renewal price, never the promo', () => {
    const o = offer({ year1: 100, year1_regular: 2000, renewal: null, term_years: 2 });
    expect(yearlyGross(o, undefined, FX)).toEqual({ field: 'price.year1_regular', value: 1000 });
    const promoOnly = offer({ year1: 100, year1_regular: null, renewal: null });
    expect(yearlyGross(promoOnly, undefined, FX)).toBeUndefined();
  });

  it('is undefined when the VAT or FX rate is missing', () => {
    expect(yearlyGross(offer({}, { vat_included: false }), undefined, FX)).toBeUndefined();
    expect(yearlyGross(offer({}, { currency: 'CHF' }), undefined, FX)).toBeUndefined();
  });

  it('is undefined for a term the TCO rejects: monthly with a term other than 1, not an integer >= 1', () => {
    expect(
      yearlyGross(at('a', 42, { unit: 'month', term_years: 12 }), undefined, FX),
    ).toBeUndefined();
    expect(
      yearlyGross(at('a', 42, { unit: 'month', renewal_term_years: 2 }), undefined, FX),
    ).toBeUndefined();
    expect(yearlyGross(at('a', 500, { renewal_term_years: 0 }), undefined, FX)).toBeUndefined();
    expect(yearlyGross(at('a', 500, { term_years: 1.5 }), undefined, FX)).toBeUndefined();
    // a monthly price with the default term (1) stays comparable
    expect(yearlyGross(at('a', 42, { unit: 'month', term_years: 1 }), undefined, FX)?.value).toBe(
      504,
    );
  });
});

describe('median', () => {
  it('odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3); // (2 + 3) / 2 = 2.5, rounded
    expect(median([7])).toBe(7);
  });
});

describe('plausibilityHits', () => {
  it('flags a monthly price recorded as a yearly price (fixture), not the correct monthly one', () => {
    const others = [at('a', 500), at('b', 550), at('c', 600)];
    // 0.42 €/month stored as 0.42 €/year: 42 against a median of 550
    const wrong = at('m', 42);
    const hits = plausibilityHits([...others, wrong], PROVIDERS, FX);
    expect(hits).toEqual([
      {
        provider: 'm',
        tld: 'de',
        field: 'price.renewal',
        value: 42,
        median: 550,
        ratio: 42 / 550,
        direction: 'below',
        others: 3,
      },
    ]);
    const right = at('m', 42, { unit: 'month' }); // 5.04 €/year
    expect(plausibilityHits([...others, right], PROVIDERS, FX)).toEqual([]);
  });

  it('flags a yearly price recorded as a monthly price (x 12, above)', () => {
    const hits = plausibilityHits(
      [at('a', 500), at('b', 550), at('c', 600), at('m', 504, { unit: 'month' })],
      PROVIDERS,
      FX,
    );
    expect(hits.map((h) => [h.provider, h.direction, h.median])).toEqual([['m', 'above', 550]]);
  });

  it('compares with the median of the OTHER providers only, never with its own value', () => {
    // d = 1600 against the others 100, 110, 120 (median 110): 14.5x above. Were d part of its own
    // median (100, 110, 120, 1600 -> 115) it would dampen its own detection; here it does not count.
    const hits = plausibilityHits(
      [at('a', 100), at('b', 110), at('c', 120), at('d', 1600)],
      PROVIDERS,
      FX,
    );
    expect(hits.map((h) => [h.provider, h.median, h.others, h.direction])).toEqual([
      ['d', 110, 3, 'above'],
    ]);
  });

  it('3 providers: no check, so one outlier never flags the two normal offers', () => {
    // with only 2 others their median is their mean: a and b would get (500 + 42) / 2 = 271 and
    // (550 + 42) / 2 = 296 and look normal, but with a dear outlier the two normal ones would be hits
    const dear = [at('a', 500), at('b', 550), at('m', 6000)];
    expect(plausibilityHits(dear, PROVIDERS, FX)).toEqual([]);
    const cheap = [at('a', 500), at('b', 550), at('m', 42)];
    expect(plausibilityHits(cheap, PROVIDERS, FX)).toEqual([]);
    // what the rule avoids: with minOthers 2 both normal offers would be flagged next to the outlier
    expect(plausibilityHits(dear, PROVIDERS, FX, { minOthers: 2 }).map((h) => h.provider)).toEqual([
      'a',
      'b',
      'm',
    ]);
    // a 4th provider makes the median of the others robust: only the outlier is left
    const four = [...dear, at('c', 600)];
    expect(plausibilityHits(four, PROVIDERS, FX).map((h) => h.provider)).toEqual(['m']);
  });

  it('an offer that cannot be compared does not count as a provider', () => {
    const three = [at('a', 500), at('b', 550), at('m', 42)];
    const noVat = offer({ renewal: 500 }, { provider: 'x', vat_included: false });
    expect(plausibilityHits([...three, noVat], PROVIDERS, FX)).toEqual([]);
    expect(plausibilityHits([...three, at('c', 600)], PROVIDERS, FX)).toHaveLength(1);
  });

  it('checks every TLD on its own and sorts by TLD, then provider', () => {
    const offers = [
      at('a', 3000, {}, 'io'),
      at('b', 3100, {}, 'io'),
      at('d', 3200, {}, 'io'),
      at('c', 100, {}, 'io'),
      at('a', 500),
      at('b', 550),
      at('d', 600),
      at('m', 42),
    ];
    expect(plausibilityHits(offers, PROVIDERS, FX).map((h) => `${h.tld}/${h.provider}`)).toEqual([
      'de/m',
      'io/c',
    ]);
  });

  it('thresholds are configurable and inclusive', () => {
    const offers = [at('a', 300), at('b', 300), at('d', 300), at('c', 100)]; // c: exactly 1/3
    expect(plausibilityHits(offers, PROVIDERS, FX)).toEqual([]);
    expect(plausibilityHits(offers, PROVIDERS, FX, { low: 0.5 })).toHaveLength(1);
    const dear = [at('a', 100), at('b', 100), at('d', 100), at('c', 250)];
    expect(plausibilityHits(dear, PROVIDERS, FX, { high: 2 })).toHaveLength(1);
    expect(DEFAULT_PLAUSIBILITY_LOW).toBeCloseTo(1 / 3);
    expect(DEFAULT_PLAUSIBILITY_HIGH).toBe(3);
  });

  it('ignores zero values and rejects bad options', () => {
    // a 0 value is not compared (no division by a 0 median) and does not count as a provider:
    // m has exactly the 3 others b, c, d, not 4
    const offers = [at('a', 0), at('b', 500), at('c', 500), at('d', 500), at('m', 42)];
    expect(plausibilityHits(offers, PROVIDERS, FX).map((h) => [h.provider, h.others])).toEqual([
      ['m', 3],
    ]);
    expect(() => plausibilityHits([], PROVIDERS, FX, { low: 1 })).toThrow(/low/);
    expect(() => plausibilityHits([], PROVIDERS, FX, { low: 0 })).toThrow(/low/);
    expect(() => plausibilityHits([], PROVIDERS, FX, { high: 1 })).toThrow(/high/);
    expect(() => plausibilityHits([], PROVIDERS, FX, { minOthers: 0 })).toThrow(/minOthers/);
    expect(() => plausibilityHits([], PROVIDERS, FX, { minOthers: 2.5 })).toThrow(/minOthers/);
  });
});

describe('plausibilityCheck', () => {
  it('lists the offers left out of the check with their reason, sorted by TLD, then provider', () => {
    const offers = [
      at('a', 500),
      at('b', 550),
      at('c', 600),
      at('m', 42),
      at('d', 0),
      at('u', 500, { unit: 'month', term_years: 2 }),
      offer({ renewal: 500 }, { provider: 'x', vat_included: false }),
      offer({ year1: 100, year1_regular: null, renewal: null }, { provider: 'a', tld: 'ai' }),
    ];
    const r = plausibilityCheck(offers, PROVIDERS, FX);
    expect(r.hits.map((h) => h.provider)).toEqual(['m']);
    expect(r.hits).toEqual(plausibilityHits(offers, PROVIDERS, FX));
    expect(r.uncomparable).toEqual([
      { provider: 'a', tld: 'ai', reason: 'no-price' },
      { provider: 'd', tld: 'de', reason: 'zero' },
      { provider: 'u', tld: 'de', reason: 'term' },
      { provider: 'x', tld: 'de', reason: 'vat-or-fx' },
    ]);
    expect(plausibilityCheck([at('a', 500)], PROVIDERS, FX)).toEqual({
      hits: [],
      uncomparable: [],
    });
  });
});
