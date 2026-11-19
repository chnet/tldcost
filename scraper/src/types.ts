// Shared scraper types. An adapter turns one provider's public price source into ScrapedOffers;
// run.ts merges them into data/offers/<provider>/<tld>.json (manual fields such as contract and
// features stay untouched) and applies the plausibility gate.
import type { Evidence, ForeignMarket, Offer, OfferPrice, OfferPromo } from '@tldcost/core';
import type { HttpClient } from './http.js';

/**
 * The scraped part of an offer: everything else in the offer file is maintained by hand. Price
 * fields left out (and `promo` left undefined) are not known to the source and keep their stored
 * value; null means the source says "none/unknown" and overwrites.
 */
export interface ScrapedOffer {
  tld: string;
  currency: Offer['currency'];
  vat_included: Offer['vat_included'];
  price: OfferPrice;
  promo?: OfferPromo | null;
  /**
   * Set when the page showed another market's prices (owner decision 2026-11-19). Scraped like the
   * prices: an offer without it is the German display, and a stored foreign_market is dropped.
   */
  foreign_market?: ForeignMarket;
  /** Set when the price cannot be trusted as is: the offer is not written (gate, fail closed). */
  blocked?: string;
  /**
   * Set when year1 is a sale price the source cannot describe: the offer is only written if the
   * stored offer already has a promo for it (hand-maintained), else it is blocked like `blocked`.
   */
  promoRequired?: string;
  /**
   * Set when year1_regular is not stated by the source but taken from the current price (Porkbun:
   * the API has no list price). A value below the stored list price may be a sale at or above the
   * renewal price: run.ts keeps the stored list price and promo when a promo is stored, and otherwise
   * does not write the offer (like `promoRequired`).
   */
  derivedListPrice?: true;
  evidence: Evidence;
}

export interface AdapterContext {
  http: HttpClient;
  /** TLDs to collect (lower case, no dot). TLDs the provider does not offer are reported, not errors. */
  tlds: readonly string[];
  /** Clock, injectable for tests. */
  now: () => Date;
  log: (message: string) => void;
}

export interface AdapterResult {
  offers: ScrapedOffer[];
  /** Requested TLDs the provider does not sell (no file is written for them). */
  notOffered: string[];
  /** Requested TLDs left out on purpose, with the reason (e.g. an unverified multi-year term). */
  skipped: { tld: string; reason: string }[];
  /** Requested TLDs whose data could not be read or did not pass the adapter's own checks. */
  failed: { tld: string; reason: string }[];
  /**
   * Non-fatal notes for the run report (e.g. a fallback source was used). Without the provider id
   * (the report and the summary already group by provider); per-TLD notes start with ".<tld>: ".
   * The same holds for `failed[].reason` and thrown errors.
   */
  warnings: string[];
}

export const newResult = (): AdapterResult => ({
  offers: [],
  notOffered: [],
  skipped: [],
  failed: [],
  warnings: [],
});

export interface Adapter {
  /** Provider id: data/providers/<id>.json must exist, otherwise the adapter is not run. */
  id: string;
  fetch(ctx: AdapterContext): Promise<AdapterResult>;
}
