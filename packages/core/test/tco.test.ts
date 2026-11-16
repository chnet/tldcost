import { describe, expect, it } from 'vitest';
import { computeTco, isPaymentDue, MAX_TCO_YEARS } from '../src/index.js';
import { offer, USD_20261111 } from './fixtures.js';

describe('computeTco', () => {
  it('flat price: sum and avg over 2/3/5 years (gross default)', () => {
    const o = offer();
    expect(computeTco(o, 2)).toMatchObject({ sum: 1008, avg: 504, mode: 'gross', missing: [] });
    expect(computeTco(o, 3)).toMatchObject({ sum: 1512, avg: 504 });
    const r5 = computeTco(o, 5);
    expect(r5).toMatchObject({ sum: 2520, avg: 504, currency: 'EUR', fx: null, setup: 0 });
    expect(r5.perYear).toEqual([504, 504, 504, 504, 504]);
  });

  it('promo: year1 is the actual price, year1_regular is ignored', () => {
    const o = offer({ setup: 0, year1: 99, year1_regular: 1190, renewal: 1190 });
    expect(computeTco(o, 3)).toMatchObject({ sum: 2479, avg: 826, perYear: [99, 1190, 1190] });
  });

  it('setup fee counts once', () => {
    expect(computeTco(offer({ setup: 500 }), 3).sum).toBe(500 + 3 * 504);
  });

  it('monthly price x 12 (recurring only, setup stays one-off)', () => {
    const o = offer({ unit: 'month', setup: 300, year1: 50, renewal: 100 });
    expect(computeTco(o, 2)).toMatchObject({ setup: 300, perYear: [600, 1200], sum: 2100 });
  });

  it('net -> gross 19 % from the offer vat_rate', () => {
    const o = offer({ year1: 1000, renewal: 1000 }, { vat_included: false, vat_rate: 1900 });
    expect(computeTco(o, 2)).toMatchObject({ perYear: [1190, 1190], sum: 2380, avg: 1190 });
  });

  it('net -> gross with the provider vat_rate when the offer has none', () => {
    const o = offer({ year1: 1000, renewal: 1000 }, { vat_included: false });
    expect(computeTco(o, 1, { provider: { vat_rate: 2000 } }).sum).toBe(1200);
  });

  it('provider vat_rate null: gross prices pass, net prices report vat_rate as missing', () => {
    const provider = { vat_rate: null };
    const gross = offer({ year1: 1190, renewal: 1190 });
    expect(computeTco(gross, 1, { provider })).toMatchObject({ sum: 1190, missing: [] });
    expect(computeTco(gross, 1, { provider, mode: 'net' })).toMatchObject({
      sum: null,
      missing: ['vat_rate'],
    });
    const net = offer({ year1: 1000, renewal: 1000 }, { vat_included: false });
    expect(computeTco(net, 1, { provider })).toMatchObject({ sum: null, missing: ['vat_rate'] });
    expect(computeTco(net, 1, { provider, mode: 'net' }).sum).toBe(1000);
  });

  it('gross -> net mode', () => {
    const o = offer({ year1: 1190, renewal: 1190 }, { vat_rate: 1900 });
    expect(computeTco(o, 2, { mode: 'net' })).toMatchObject({ mode: 'net', sum: 2000 });
  });

  it('different year 2 / year 3 prices; year 4+ falls back to renewal', () => {
    const o = offer({ year1: 100, year2: 200, year3: 300, renewal: 1000 });
    expect(computeTco(o, 5)).toMatchObject({ perYear: [100, 200, 300, 1000, 1000], sum: 2600 });
    expect(computeTco(o, 5).avg).toBe(520);
  });

  it('year2/year3 null means "same as renewal"', () => {
    const o = offer({ year1: 100, year2: null, year3: null, renewal: 1000 });
    expect(computeTco(o, 3).perYear).toEqual([100, 1000, 1000]);
  });

  it('avg rounds half up to whole cents', () => {
    const o = offer({ year1: 100, renewal: 101 });
    expect(computeTco(o, 2).avg).toBe(101); // 100.5
    expect(computeTco(offer({ year1: 100, renewal: 100, setup: 1 }), 3).avg).toBe(100); // 100.33
  });

  it('missing values: listed once, sum/avg null, known years still shown', () => {
    const r = computeTco(offer({ setup: null, renewal: null }), 5);
    expect(r).toMatchObject({ sum: null, avg: null, setup: null });
    expect(r.missing).toEqual(['price.setup', 'price.renewal']);
    expect(r.perYear).toEqual([504, null, null, null, null]);
    // a specific year2 bridges a missing renewal for 2 years
    const r2 = computeTco(offer({ year1: null, year2: 600, renewal: null }), 2);
    expect(r2).toMatchObject({ missing: ['price.year1'], perYear: [null, 600], sum: null });
  });

  it('missing VAT rate for net prices: everything null', () => {
    const r = computeTco(offer({}, { vat_included: false }), 3);
    expect(r).toMatchObject({ missing: ['vat_rate'], sum: null, setup: null });
    expect(r.perYear).toEqual([null, null, null]);
  });

  it('USD -> EUR with the ECB rate and its date; the rate is returned', () => {
    const o = offer({ setup: 0, year1: 1000, renewal: 1500 }, { currency: 'USD' });
    const r = computeTco(o, 2, { fx: USD_20261111 });
    expect(r).toMatchObject({ perYear: [923, 1385], sum: 2308, fx: USD_20261111 });
  });

  it('USD without (or with the wrong) FX rate: missing fx', () => {
    const o = offer({}, { currency: 'USD' });
    expect(computeTco(o, 2)).toMatchObject({ missing: ['fx.USD'], sum: null, fx: null });
    const gbp = { ...USD_20261111, currency: 'GBP' };
    expect(computeTco(o, 2, { fx: gbp }).missing).toEqual(['fx.USD']);
  });

  it(`years must be an integer 1..${MAX_TCO_YEARS}`, () => {
    for (const bad of [0, -1, 2.5, MAX_TCO_YEARS + 1, Number.NaN]) {
      expect(() => computeTco(offer(), bad)).toThrow(RangeError);
    }
    expect(computeTco(offer(), 1).sum).toBe(504);
  });

  // (a) methodik section "Mindestlaufzeit länger als ein Jahr" (minimum term longer than a year):
  // every payment due within N years counts in full, no pro-rating; avg = sum / N. Rows of the
  // methodik example table (registration 2 years).
  describe('minimum term longer than one year (methodik table)', () => {
    const twoYearReg = (renewal_term_years: number) =>
      offer({
        year1: 2000,
        renewal: renewal_term_years === 1 ? 1000 : 2000,
        term_years: 2,
        renewal_term_years,
      });

    it('2-year registration, yearly renewal: 1 / 1+1 / 1+3 payments', () => {
      const o = twoYearReg(1);
      expect(computeTco(o, 2)).toMatchObject({
        payments: 1,
        perYear: [2000, 0],
        sum: 2000,
        avg: 1000,
      });
      expect(computeTco(o, 3)).toMatchObject({ payments: 2, perYear: [2000, 0, 1000], sum: 3000 });
      expect(computeTco(o, 5)).toMatchObject({ payments: 4, sum: 5000, avg: 1000 });
    });

    it('2-year registration, 2-year renewal: 1 / 2 / 3 payments, each in full', () => {
      const o = twoYearReg(2);
      expect(computeTco(o, 2)).toMatchObject({ payments: 1, sum: 2000, avg: 1000 });
      // 3 years: 2 payments covering 4 years, counted in full (no pro-rating)
      expect(computeTco(o, 3)).toMatchObject({
        payments: 2,
        perYear: [2000, 0, 2000],
        sum: 4000,
        avg: 1333,
      });
      expect(computeTco(o, 5)).toMatchObject({
        payments: 3,
        perYear: [2000, 0, 2000, 0, 2000],
        sum: 6000,
        avg: 1200,
      });
    });

    it('a renewal not yet due is not missing', () => {
      const o = offer({ year1: 2000, renewal: null, term_years: 2 });
      expect(computeTco(o, 2)).toMatchObject({ missing: [], sum: 2000 });
      expect(computeTco(o, 3)).toMatchObject({ missing: ['price.renewal'], sum: null });
    });

    it('a specific year3 price applies to the payment due in year 3', () => {
      const o = offer({
        year1: 2000,
        year3: 1500,
        renewal: 1800,
        term_years: 2,
        renewal_term_years: 2,
      });
      expect(computeTco(o, 5).perYear).toEqual([2000, 0, 1500, 0, 1800]);
    });

    it('isPaymentDue', () => {
      expect([1, 2, 3, 4, 5].map((i) => isPaymentDue(i))).toEqual([true, true, true, true, true]);
      expect([1, 2, 3, 4, 5].map((i) => isPaymentDue(i, 2, 1))).toEqual([
        true,
        false,
        true,
        true,
        true,
      ]);
      expect([1, 2, 3, 4, 5].map((i) => isPaymentDue(i, 2, 2))).toEqual([
        true,
        false,
        true,
        false,
        true,
      ]);
      expect([1, 2, 3, 4, 5].map((i) => isPaymentDue(i, 3, 2))).toEqual([
        true,
        false,
        false,
        true,
        false,
      ]);
    });

    it('invalid terms throw; monthly prices need 1-year terms', () => {
      for (const term_years of [0, 1.5, MAX_TCO_YEARS + 1]) {
        expect(() => computeTco(offer({ term_years }), 3)).toThrow(
          /price.term_years must be an integer/,
        );
      }
      expect(() => computeTco(offer({ renewal_term_years: 0 }), 3)).toThrow(
        /price.renewal_term_years/,
      );
      expect(() => computeTco(offer({ unit: 'month', term_years: 2 }), 3)).toThrow(
        /must be 1 for monthly/,
      );
    });
  });

  // (b) methodik: non-EU provider without VAT statement: price as stated, no surcharge, flagged;
  // the gross/net toggle does not change it.
  describe('no VAT statement (vat_included null)', () => {
    const o = offer({ year1: 1000, renewal: 1200 }, { vat_included: null, currency: 'USD' });

    it('gross and net give the same amount, no VAT rate needed, flag set', () => {
      const gross = computeTco(o, 2, { fx: USD_20261111 });
      const net = computeTco(o, 2, { fx: USD_20261111, mode: 'net' });
      expect(gross).toMatchObject({
        perYear: [923, 1108],
        sum: 2031,
        vatNotStated: true,
        missing: [],
      });
      expect(net).toMatchObject({
        mode: 'net',
        perYear: gross.perYear,
        sum: gross.sum,
        vatNotStated: true,
      });
    });

    it('a provider VAT rate is ignored (no surcharge)', () => {
      const eur = offer({ year1: 1000, renewal: 1000 }, { vat_included: null });
      expect(computeTco(eur, 1, { provider: { vat_rate: 1900 } }).sum).toBe(1000);
      expect(computeTco(eur, 1, { provider: { vat_rate: 1900 }, mode: 'net' }).sum).toBe(1000);
    });

    it('a provider vat_rate of null (non-EU) needs no rate here', () => {
      const eur = offer({ year1: 1000, renewal: 1000 }, { vat_included: null });
      expect(computeTco(eur, 1, { provider: { vat_rate: null } })).toMatchObject({
        sum: 1000,
        vatNotStated: true,
        missing: [],
      });
    });

    it('stated VAT is not flagged', () => {
      expect(computeTco(offer(), 1).vatNotStated).toBe(false);
    });
  });
});

describe('computeTco with start: transfer', () => {
  it('default: one-off transfer_in plus the renewal price from year 1 (null counts as false)', () => {
    for (const includes of [undefined, null, false]) {
      const o = offer({
        year1: 8,
        renewal: 1000,
        transfer_in: 300,
        transfer_includes_term: includes,
      });
      expect(computeTco(o, 3, { start: 'transfer' })).toMatchObject({
        perYear: [1300, 1000, 1000],
        payments: 4,
        sum: 3300,
        missing: [],
      });
    }
    const two = offer({ renewal: 4000, transfer_in: 100, renewal_term_years: 2 });
    expect(computeTco(two, 4, { start: 'transfer' }).perYear).toEqual([4100, 0, 4000, 0]);
  });

  it('transfer_includes_term true: transfer_in covers exactly 1 year', () => {
    const o = offer({
      renewal: 1000,
      transfer_in: 300,
      term_years: 2,
      transfer_includes_term: true,
    });
    expect(computeTco(o, 3, { start: 'transfer' })).toMatchObject({
      perYear: [300, 1000, 1000],
      payments: 3,
      sum: 2300,
    });
    // a renewal term other than 1 year: unclear, no sum (never guessed)
    const twoYear = offer({
      renewal: 4000,
      transfer_in: 4000,
      renewal_term_years: 2,
      transfer_includes_term: true,
    });
    expect(computeTco(twoYear, 5, { start: 'transfer' })).toMatchObject({
      sum: null,
      missing: ['transfer_term_unclear'],
    });
    // false with a 2-year renewal term is clear: transfer plus renewal in year 1
    const twoYearFalse = { ...twoYear, price: { ...twoYear.price, transfer_includes_term: false } };
    expect(computeTco(twoYearFalse, 3, { start: 'transfer' })).toMatchObject({
      perYear: [8000, 0, 4000],
      missing: [],
    });
    // ignored for new registrations, also with a multi-year renewal term
    expect(computeTco(o, 3).perYear).toEqual([504, 0, 1000]);
    expect(computeTco(twoYear, 3).missing).toEqual([]);
  });

  it('year2/year3 are registration prices and do not apply', () => {
    const o = offer({ year1: 100, year2: 200, year3: 300, renewal: 900, transfer_in: 0 });
    expect(computeTco(o, 3, { start: 'transfer' }).perYear).toEqual([900, 900, 900]);
  });

  it('monthly: renewals × 12, transfer_in never', () => {
    const o = offer({ unit: 'month', year1: 8, renewal: 99, transfer_in: 500 });
    expect(computeTco(o, 2, { start: 'transfer' }).perYear).toEqual([500 + 1188, 1188]);
  });

  it('missing transfer price is listed, sum null', () => {
    const o = offer({ transfer_in: null });
    expect(computeTco(o, 2, { start: 'transfer' })).toMatchObject({
      sum: null,
      missing: ['price.transfer_in'],
      perYear: [null, 504],
    });
    expect(computeTco(offer(), 1, { start: 'transfer' }).missing).toEqual(['price.transfer_in']);
  });
});
