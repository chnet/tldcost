// Porkbun: public JSON API, no authentication ("Retrieve domain pricing (public)", OpenAPI v3).
// api.porkbun.com/robots.txt is 404 (no restrictions). Never porkbun.com/api/*: disallowed there.
// Prices are USD strings. Porkbun makes no VAT statement (US provider): vat_included null.
// Coupon codes (`coupons`, e.g. one per account) are never applied to year1 (concept 2.1).
import { evidenceHash } from '../evidence.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const PORKBUN_ENDPOINT = 'https://api.porkbun.com/api/json/v3/pricing/get';
export const PORKBUN_SOURCE_URL = 'https://porkbun.com/products/domains';

/**
 * TLDs with a multi-year minimum registration where it is not verified whether the API price is
 * per year or per term. Left out until checked by hand (.ai: 2-year minimum at the registry).
 */
// TODO (open issue): verify in the browser whether Porkbun's .ai registration (82.70) is per year or per
// 2-year term (transfer 165.09), then map it with term_years and drop it from this set.
const UNVERIFIED_TERM = new Set(['ai']);

interface PorkbunPrice {
  registration: string;
  renewal: string;
  transfer: string;
  specialType?: string;
}

function parse(text: string): Record<string, PorkbunPrice> {
  const json = JSON.parse(text) as { status?: unknown; pricing?: unknown };
  if (json.status !== 'SUCCESS' || json.pricing === null || typeof json.pricing !== 'object') {
    throw new Error(`unexpected response (status ${JSON.stringify(json.status)})`);
  }
  return json.pricing as Record<string, PorkbunPrice>;
}

export const porkbun: Adapter = {
  id: 'porkbun',
  async fetch(ctx) {
    const res = await ctx.http.get(PORKBUN_ENDPOINT, 'application/json');
    const fetchedAt = isoSeconds(ctx.now());
    const pricing = parse(res.text);
    const hash = evidenceHash(res.bytes);
    const result = newResult();
    for (const tld of ctx.tlds) {
      const p = pricing[tld];
      if (!p) {
        result.notOffered.push(tld);
        continue;
      }
      if (p.specialType) {
        result.skipped.push({ tld, reason: `special TLD type '${p.specialType}'` });
        continue;
      }
      if (UNVERIFIED_TERM.has(tld)) {
        result.skipped.push({
          tld,
          reason: 'multi-year minimum term, per-year vs per-term price not verified',
        });
        continue;
      }
      let price;
      try {
        price = {
          year1: toCents(p.registration),
          renewal: toCents(p.renewal),
          transfer_in: toCents(p.transfer),
        };
      } catch (err) {
        result.failed.push({ tld, reason: (err as Error).message });
        continue;
      }
      // The API has no list price and no promo period. registration < renewal looks like a
      // first-year sale: list price and promo stay as maintained by hand, and without a stored promo
      // the offer is not written (run.ts). Otherwise the registration price is taken as the list
      // price and there is no promo. A sale at or above renewal looks the same: run.ts stops a
      // derived list price below the stored one (checkDerivedListPrice).
      const sale = price.year1 < price.renewal;
      result.offers.push({
        tld,
        currency: 'USD',
        vat_included: null,
        price: {
          unit: 'year',
          setup: 0,
          year1: price.year1,
          ...(sale ? {} : { year1_regular: price.year1 }),
          renewal: price.renewal,
          term_years: 1,
          renewal_term_years: 1,
          transfer_in: price.transfer_in,
        },
        ...(sale
          ? { promoRequired: 'first-year sale (registration < renewal) without a stored promo' }
          : { promo: null, derivedListPrice: true as const }),
        evidence: {
          source_url: PORKBUN_SOURCE_URL,
          source_endpoint: PORKBUN_ENDPOINT,
          fetched_at: fetchedAt,
          method: 'api',
          evidence_hash: hash,
          // VAT treatment for EU consumers is unknown (provider research)
          confidence: 'medium',
        },
      });
    }
    return result;
  },
};
