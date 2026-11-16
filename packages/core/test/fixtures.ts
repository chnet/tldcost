import type { Offer, OfferPrice } from '../src/index.js';

/** Minimal valid EUR gross offer; override what a test is about. */
export function offer(price: Partial<OfferPrice> = {}, rest: Partial<Offer> = {}): Offer {
  return {
    schema_version: 2,
    provider: 'example-registrar',
    tld: 'de',
    currency: 'EUR',
    vat_included: true,
    price: { unit: 'year', setup: 0, year1: 504, renewal: 504, ...price },
    evidence: {
      source_url: 'https://registrar.example/prices',
      fetched_at: '2026-11-01T10:00:00Z',
      method: 'manual',
      confidence: 'low',
    },
    provider_verified: false,
    ...rest,
  };
}

export const USD_20261111 = { currency: 'USD', perEur: 1.0834, date: '2026-11-11' };
