import { describe, expect, it } from 'vitest';
import { assertFx, isCents, isVatRate, normalizePrice } from '../src/index.js';
import { USD_20261111 } from './fixtures.js';

describe('normalizePrice', () => {
  it('EUR gross, yearly: unchanged', () => {
    expect(normalizePrice(504, { currency: 'EUR', vatIncluded: true })).toBe(504);
  });

  it('monthly price x 12', () => {
    expect(normalizePrice(99, { currency: 'EUR', vatIncluded: true, unit: 'month' })).toBe(1188);
  });

  it('net -> gross 19 %, exact on integer cents (no float drift)', () => {
    const net = { currency: 'EUR', vatIncluded: false, vatRate: 1900 };
    expect(normalizePrice(1000, net)).toBe(1190);
    expect(normalizePrice(250, net)).toBe(298); // 297.5 rounds half up
    expect(normalizePrice(423, net)).toBe(503); // 503.37
  });

  it('gross -> net 19 %', () => {
    const gross = { currency: 'EUR', vatIncluded: true, vatRate: 1900, mode: 'net' as const };
    expect(normalizePrice(1190, gross)).toBe(1000);
    expect(normalizePrice(504, gross)).toBe(424); // 423.53
  });

  it('no VAT statement (null): amount as stated in both modes, VAT rate ignored', () => {
    for (const mode of ['gross', 'net'] as const) {
      expect(
        normalizePrice(1000, { currency: 'EUR', vatIncluded: null, vatRate: 1900, mode }),
      ).toBe(1000);
    }
  });

  it('net stays net, gross stays gross: no VAT rate needed', () => {
    expect(normalizePrice(1000, { currency: 'EUR', vatIncluded: false, mode: 'net' })).toBe(1000);
  });

  it('USD -> EUR with the ECB rate of the given date', () => {
    // 10.00 USD / 1.0834 = 9.2302 EUR (net, US provider without VAT)
    const ctx = { currency: 'USD', vatIncluded: false, mode: 'net' as const, fx: USD_20261111 };
    expect(normalizePrice(1000, ctx)).toBe(923);
    // monthly USD net -> yearly EUR gross 19 %: 1.00 x 12 / 1.0834 x 1.19 = 13.18
    expect(normalizePrice(100, { ...ctx, unit: 'month', mode: 'gross', vatRate: 1900 })).toBe(1318);
  });

  it('rejects non-cent amounts', () => {
    for (const bad of [5.04, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => normalizePrice(bad, { currency: 'EUR', vatIncluded: true })).toThrow(RangeError);
    }
  });

  it('needs a VAT rate when the VAT state changes', () => {
    expect(() => normalizePrice(1000, { currency: 'EUR', vatIncluded: false })).toThrow(
      /convert net/,
    );
    expect(() =>
      normalizePrice(1000, { currency: 'EUR', vatIncluded: true, mode: 'net', vatRate: 19.5 }),
    ).toThrow(/convert gross/);
  });

  it('needs a matching, valid FX rate for non-EUR amounts', () => {
    const usd = { currency: 'USD', vatIncluded: true };
    expect(() => normalizePrice(1000, usd)).toThrow(/no FX rate for USD/);
    expect(() =>
      normalizePrice(1000, { ...usd, fx: { ...USD_20261111, currency: 'GBP' } }),
    ).toThrow(/FX rate is for GBP/);
    expect(() => normalizePrice(1000, { ...usd, fx: { ...USD_20261111, perEur: 0 } })).toThrow(
      RangeError,
    );
    expect(() =>
      normalizePrice(1000, { ...usd, fx: { ...USD_20261111, date: '11.11.2026' } }),
    ).toThrow(/YYYY-MM-DD/);
  });
});

describe('guards', () => {
  it('isCents / isVatRate', () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(1.5)).toBe(false);
    expect(isCents('1')).toBe(false);
    expect(isVatRate(1900)).toBe(true);
    expect(isVatRate(10001)).toBe(false);
    expect(isVatRate(-1)).toBe(false);
    expect(isVatRate(undefined)).toBe(false);
  });

  it('assertFx accepts a valid rate', () => {
    expect(() => assertFx(USD_20261111, 'USD')).not.toThrow();
  });
});
