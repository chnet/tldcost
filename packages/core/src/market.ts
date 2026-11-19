// Foreign market displays (owner decision 2026-11-19, docs/decisions.md): a provider's page that
// detects the visitor's country may show the data run another market's prices. Those are recorded
// as quoted (offer.foreign_market, that market's currency, net) and converted by the site. The
// switch between the German display and such a market is the one change of currency and VAT mode
// that the scraper gate and the price history accept, and only in this narrow form.
import type { Offer, PriceUnit } from './types.js';

/** Currencies of foreign market displays the data may record (owner decision: USD only). */
export const FOREIGN_MARKET_CURRENCIES: readonly string[] = ['USD'];

/** What a market switch is judged on: currency, VAT mode, price unit and market (country). */
export interface MarketBasis {
  currency: string;
  vat_included: boolean | null;
  unit: PriceUnit;
  /** Country of the foreign market display; undefined = the German display. */
  market?: string | undefined;
}

/** The market an offer records: foreign_market.country, if its currency is the offer's. */
export function offerMarket(offer: Offer): string | undefined {
  const m = offer.foreign_market;
  return m && m.currency === offer.currency ? m.country : undefined;
}

export function marketBasis(offer: Offer): MarketBasis {
  return {
    currency: offer.currency,
    vat_included: offer.vat_included,
    unit: offer.price.unit,
    market: offerMarket(offer),
  };
}

const german = (x: MarketBasis) =>
  x.market === undefined && x.currency === 'EUR' && x.vat_included === true;
const foreign = (x: MarketBasis) =>
  x.market !== undefined &&
  x.market !== 'DE' &&
  FOREIGN_MARKET_CURRENCIES.includes(x.currency) &&
  x.vat_included === false;

/**
 * true only for the switch between the German display (EUR, gross, no foreign_market) and a
 * foreign market display (foreign_market with a currency of FOREIGN_MARKET_CURRENCIES, net), in
 * either direction and with the same price unit. Every other change of currency or VAT mode is
 * not a market switch.
 */
export function isMarketSwitch(a: MarketBasis, b: MarketBasis): boolean {
  if (a.unit !== b.unit) return false;
  return (german(a) && foreign(b)) || (foreign(a) && german(b));
}

/** "DE -> US" for the reports; the German display is "DE". */
export function marketSwitchLabel(a: MarketBasis, b: MarketBasis): string {
  return `${a.market ?? 'DE'} -> ${b.market ?? 'DE'}`;
}
