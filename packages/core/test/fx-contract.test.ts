import { describe, expect, it } from 'vitest';
import { computeTco, effectiveContract, fxRateFor } from '../src/index.js';
import type { FxRates } from '../src/index.js';
import { offer } from './fixtures.js';

const table = (date: string, rates: Record<string, number>): FxRates => ({
  schema_version: 1,
  source: 'ECB',
  date,
  base: 'EUR',
  rates,
  source_url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  fetched_at: `${date}T16:05:00Z`,
});

describe('fxRateFor', () => {
  const tables = [
    table('2026-11-10', { USD: 1.08, GBP: 0.84 }),
    table('2026-11-12', { GBP: 0.85 }),
    table('2026-11-11', { USD: 1.0834 }),
    table('2026-11-09', { USD: 1.07 }), // older table after a newer one: ignored
  ];

  it('newest table that has the currency, with its date', () => {
    expect(fxRateFor(tables, 'USD')).toEqual({
      currency: 'USD',
      perEur: 1.0834,
      date: '2026-11-11',
    });
    expect(fxRateFor(tables, 'GBP')).toEqual({ currency: 'GBP', perEur: 0.85, date: '2026-11-12' });
  });

  it('only tables on or before a date', () => {
    expect(fxRateFor(tables, 'USD', '2026-11-10')?.date).toBe('2026-11-10');
    expect(fxRateFor(tables, 'USD', '2026-11-08')).toBeUndefined();
    // offer.evidence.fetched_at: the date part counts
    expect(fxRateFor(tables, 'USD', '2026-11-10T23:59:00Z')?.date).toBe('2026-11-10');
  });

  it('unknown currency or no tables: undefined', () => {
    expect(fxRateFor(tables, 'JPY')).toBeUndefined();
    expect(fxRateFor([], 'USD')).toBeUndefined();
  });

  it('feeds computeTco; no matching rate gives null + reason fx.<CUR>', () => {
    const usd = offer({ year1: 1000, renewal: 1000 }, { currency: 'USD' });
    expect(computeTco(usd, 1, { fx: fxRateFor(tables, 'USD')! }).sum).toBe(923);
    const jpy = offer({}, { currency: 'JPY' });
    const fx = fxRateFor(tables, 'JPY');
    const r = computeTco(jpy, 2, fx ? { fx } : {});
    expect(r).toMatchObject({ sum: null, avg: null, missing: ['fx.JPY'] });
  });
});

describe('effectiveContract: offer.contract ?? provider.terms ?? null', () => {
  const provider = {
    terms: { min_term_months: 12, notice_period_days: 30, billing_cycle: 'yearly' as const },
  };

  it('offer value wins, null/missing falls back to the provider, else null', () => {
    const o = { contract: { min_term_months: 24, notice_period_days: null } };
    expect(effectiveContract(o, provider)).toEqual({
      min_term_months: 24,
      notice_period_days: 30,
      billing_cycle: 'yearly',
      auto_renew_default: null,
    });
  });

  it('false and 0 are values, not gaps', () => {
    const o = { contract: { notice_period_days: 0, auto_renew_default: false } };
    const p = { terms: { notice_period_days: 30, auto_renew_default: true } };
    expect(effectiveContract(o, p)).toMatchObject({
      notice_period_days: 0,
      auto_renew_default: false,
    });
  });

  it('no contract, no provider: all null', () => {
    expect(effectiveContract({})).toEqual({
      min_term_months: null,
      notice_period_days: null,
      billing_cycle: null,
      auto_renew_default: null,
    });
    expect(effectiveContract({}, {})).toMatchObject({ min_term_months: null });
  });
});
