// Build time only: data/ -> the data the portfolio calculator embeds. The calculator computes in
// the browser with computeBasket from @tldcost/core (no API, no request), so the payload holds the
// price-relevant part of every offer, the providers' VAT rates and the ECB tables of the
// currencies in use. All price maths stays in core.
import type { FxRates, Offer } from '@tldcost/core';
import type { TldcostData } from '@tldcost/core/load';
import { countryName, orderTlds } from './rows';

export interface BasketProviderMeta {
  name: string;
  /** VAT rate of net offers (basis points); null: no VAT statement. */
  vat_rate: number | null;
  /** Portal operator's own offer: badge only. Never passed to computeBasket. */
  operator: boolean;
  /** Contracting entity's country (ISO 3166-1 alpha-2) and its name in the page language. */
  country: string;
  countryName: string;
}

export interface BasketPayload {
  /** TLDs with at least one offer, in the table's TLD order. */
  tlds: string[];
  /** Offers without contract and features (not used by the totals); promo stays (limit, notes). */
  offers: Offer[];
  providers: Record<string, BasketProviderMeta>;
  /** ECB tables, reduced to the currencies of the offers. */
  fx: FxRates[];
}

export function buildBasketPayload(data: TldcostData, lang: 'de' | 'en' = 'de'): BasketPayload {
  const known = new Set(data.providers.map((p) => p.id));
  const offers: Offer[] = data.offers
    .filter((o) => known.has(o.provider))
    .map((o) => ({
      schema_version: o.schema_version,
      provider: o.provider,
      tld: o.tld,
      currency: o.currency,
      vat_included: o.vat_included,
      ...(o.vat_rate !== undefined ? { vat_rate: o.vat_rate } : {}),
      price: o.price,
      ...(o.promo ? { promo: o.promo } : {}),
      evidence: {
        source_url: o.evidence.source_url,
        fetched_at: o.evidence.fetched_at,
        method: o.evidence.method,
        confidence: o.evidence.confidence,
      },
      provider_verified: o.provider_verified,
    }));
  const currencies = new Set(offers.map((o) => o.currency).filter((c) => c !== 'EUR'));
  const fx = data.fx
    .map((t) => ({
      ...t,
      rates: Object.fromEntries(Object.entries(t.rates).filter(([c]) => currencies.has(c))),
    }))
    .filter((t) => Object.keys(t.rates).length > 0);
  return {
    tlds: orderTlds(offers.map((o) => o.tld)),
    offers,
    providers: Object.fromEntries(
      data.providers.map((p) => [
        p.id,
        {
          name: p.name,
          vat_rate: p.vat_rate,
          operator: p.operator === true,
          country: p.country,
          countryName: countryName(p.country, lang),
        },
      ]),
    ),
    fx,
  };
}
