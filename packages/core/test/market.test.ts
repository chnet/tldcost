import { describe, expect, it } from 'vitest';
import {
  appendHistory,
  FOREIGN_MARKET_CURRENCIES,
  isMarketSwitch,
  marketBasis,
  marketSwitchLabel,
  offerMarket,
  priceState,
  type MarketBasis,
  type Offer,
} from '../src/index.js';
import { offer } from './fixtures.js';

const US = { country: 'US', currency: 'USD', quote: 'Domainpreise in USD: .de 9,99 9,99' };
const de: MarketBasis = { currency: 'EUR', vat_included: true, unit: 'year' };
const us: MarketBasis = { currency: 'USD', vat_included: false, unit: 'year', market: 'US' };
/** The offer as seen on `day`, on the German display or the US one. */
const seen = (day: string, market: 'DE' | 'US', rest: Partial<Offer> = {}): Offer => {
  const o = offer(
    {},
    market === 'US'
      ? { currency: 'USD', vat_included: false, foreign_market: US, ...rest }
      : { ...rest },
  );
  return { ...o, evidence: { ...o.evidence, fetched_at: `${day}T10:00:00Z` } };
};

describe('foreign market display (owner decision 2026-11-19)', () => {
  it('reads the market of an offer only when foreign_market has the offer currency', () => {
    expect(FOREIGN_MARKET_CURRENCIES).toEqual(['USD']);
    expect(offerMarket(seen('2026-11-20', 'DE'))).toBeUndefined();
    expect(offerMarket(seen('2026-11-20', 'US'))).toBe('US');
    expect(offerMarket(seen('2026-11-20', 'US', { currency: 'GBP' }))).toBeUndefined();
    expect(marketBasis(seen('2026-11-20', 'US'))).toEqual(us);
    expect(marketBasis(seen('2026-11-20', 'DE'))).toEqual({ ...de, market: undefined });
  });

  it('is a switch only between EUR gross (German) and USD net with a market, either way', () => {
    expect(isMarketSwitch(de, us)).toBe(true);
    expect(isMarketSwitch(us, de)).toBe(true);
    expect(isMarketSwitch(de, de)).toBe(false);
    expect(isMarketSwitch(us, us)).toBe(false);
    // other unit, currency, VAT mode or a "DE" market: no switch
    expect(isMarketSwitch(de, { ...us, unit: 'month' })).toBe(false);
    expect(isMarketSwitch(de, { ...us, currency: 'GBP' })).toBe(false);
    expect(isMarketSwitch(de, { ...us, vat_included: true })).toBe(false);
    expect(isMarketSwitch(de, { ...us, market: 'DE' })).toBe(false);
    expect(isMarketSwitch(de, { ...us, market: undefined })).toBe(false);
    expect(isMarketSwitch({ ...de, vat_included: false }, us)).toBe(false);
    expect(isMarketSwitch({ ...de, market: 'AT' }, us)).toBe(false);
    expect(marketSwitchLabel(de, us)).toBe('DE -> US');
    expect(marketSwitchLabel(us, de)).toBe('US -> DE');
  });

  it('a switch starts a new history segment, and so does the way back; nothing is dropped', () => {
    const first = appendHistory(undefined, seen('2026-11-16', 'DE')).history;
    const toUs = appendHistory(first, seen('2026-11-20', 'US'));
    expect(toUs.changed).toBe(true);
    expect(toUs.history.entries.map((e) => [e.date, e.currency, e.vat_included, e.market])).toEqual(
      [
        ['2026-11-16', 'EUR', true, undefined],
        ['2026-11-20', 'USD', false, 'US'],
      ],
    );
    expect(priceState(seen('2026-11-20', 'US')).market).toBe('US');
    // unchanged US state: no new entry
    expect(appendHistory(toUs.history, seen('2026-11-27', 'US')).changed).toBe(false);
    const back = appendHistory(toUs.history, seen('2026-12-04', 'DE')).history;
    expect(back.entries.map((e) => e.market ?? 'DE')).toEqual(['DE', 'US', 'DE']);
    expect('market' in (back.entries[2] as object)).toBe(false);
  });

  it('a currency or VAT change within the same market still throws', () => {
    const usHistory = appendHistory(undefined, seen('2026-11-20', 'US')).history;
    expect(() =>
      appendHistory(usHistory, seen('2026-11-27', 'US', { vat_included: true })),
    ).toThrow(
      /USD\/year\/vat_included false\/market US -> USD\/year\/vat_included true\/market US/,
    );
    const deHistory = appendHistory(undefined, seen('2026-11-20', 'DE')).history;
    expect(() =>
      appendHistory(deHistory, seen('2026-11-27', 'DE', { currency: 'USD', vat_included: false })),
    ).toThrow(/EUR\/year\/vat_included true -> USD\/year\/vat_included false\)/);
  });
});
