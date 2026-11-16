// Plausibility check: an offer whose regular yearly price is far away from the other providers'
// prices for the same TLD is listed for a human check (it never blocks anything). Typical cause: a
// monthly price recorded as a yearly one, or the other way round (factor 12).
import { fxRateFor } from './fx.js';
import { normalizePrice } from './normalize.js';
import type { Cents, FxRates, Offer, Provider } from './types.js';

/** A value below this share of the TLD median is listed (1/3). */
export const DEFAULT_PLAUSIBILITY_LOW = 1 / 3;
/** A value above this multiple of the TLD median is listed (3x). */
export const DEFAULT_PLAUSIBILITY_HIGH = 3;
/**
 * An offer is checked only against at least this many OTHER providers with a comparable value for
 * the TLD (3, so at least 4 providers in all). With only 2 others their median is their mean, and one
 * outlier would also flag the two normal offers.
 */
export const DEFAULT_PLAUSIBILITY_MIN_OTHERS = 3;

export interface PlausibilityOptions {
  /** Lower bound as a share of the median, 0 < low < 1. Default 1/3. */
  low?: number;
  /** Upper bound as a multiple of the median, > 1. Default 3. */
  high?: number;
  /** Minimum number of OTHER providers with a comparable value for the TLD. Default 3. */
  minOthers?: number;
}

/** The value one offer is compared with: gross EUR cents per year of its regular price. */
export interface YearlyValue {
  /** Source field: the renewal price, else the regular year-1 price. */
  field: 'price.renewal' | 'price.year1_regular';
  /** Gross EUR cents per year (monthly x 12, multi-year terms divided by their years). */
  value: Cents;
}

export interface PlausibilityHit {
  provider: string;
  tld: string;
  field: YearlyValue['field'];
  /** Gross EUR cents per year of this offer. */
  value: Cents;
  /** Median of the other providers' values for the TLD (gross EUR cents per year). */
  median: Cents;
  /** value / median. */
  ratio: number;
  /** below: ratio < low; above: ratio > high. */
  direction: 'below' | 'above';
  /** Number of other providers in the median. */
  others: number;
}

/**
 * Why an offer drops out of the check: no renewal or regular year-1 price (`no-price`), a term the
 * TCO would reject (`term`: not an integer >= 1, or a monthly price with a term other than 1, as
 * termOf in tco.ts), a missing VAT or FX rate (`vat-or-fx`), or a value of 0 (`zero`).
 */
export type UncomparableReason = 'no-price' | 'term' | 'vat-or-fx' | 'zero';

export interface UncomparableOffer {
  provider: string;
  tld: string;
  reason: UncomparableReason;
}

export interface PlausibilityResult {
  hits: PlausibilityHit[];
  /** Offers left out of the check (not part of any median), sorted by TLD, then provider. */
  uncomparable: UncomparableOffer[];
}

const validTerm = (t: number | undefined, monthly: boolean): boolean => {
  const years = t ?? 1;
  return Number.isInteger(years) && years >= 1 && (!monthly || years === 1);
};

/** yearlyGross with the reason when the offer cannot be compared. */
function yearlyOrReason(
  offer: Offer,
  provider: Pick<Provider, 'vat_rate'> | undefined,
  fx: readonly FxRates[],
): YearlyValue | UncomparableReason {
  const p = offer.price;
  const fromRenewal = typeof p.renewal === 'number';
  const amount = fromRenewal ? p.renewal : p.year1_regular;
  if (typeof amount !== 'number') return 'no-price';
  const monthly = p.unit === 'month';
  if (!validTerm(p.term_years, monthly) || !validTerm(p.renewal_term_years, monthly)) return 'term';
  const years = (fromRenewal ? p.renewal_term_years : p.term_years) ?? 1;
  try {
    const value = normalizePrice(amount, {
      currency: offer.currency,
      vatIncluded: offer.vat_included,
      vatRate: offer.vat_rate ?? provider?.vat_rate ?? undefined,
      unit: p.unit,
      mode: 'gross',
      fx: fxRateFor(fx, offer.currency, offer.evidence.fetched_at),
    });
    return {
      field: fromRenewal ? 'price.renewal' : 'price.year1_regular',
      value: Math.round(value / years),
    };
  } catch {
    return 'vat-or-fx';
  }
}

/**
 * Regular yearly gross price of an offer in EUR cents, or undefined when it cannot be compared
 * (no renewal/regular price, an invalid term, VAT rate or FX rate missing). Promotional year-1
 * prices are never used: they are far below the median on purpose.
 */
export function yearlyGross(
  offer: Offer,
  provider: Pick<Provider, 'vat_rate'> | undefined,
  fx: readonly FxRates[],
): YearlyValue | undefined {
  const v = yearlyOrReason(offer, provider, fx);
  return typeof v === 'string' ? undefined : v;
}

/** Median of a non-empty list (mean of the two middle values for an even count, rounded). */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2
    ? (s[mid] as number)
    : Math.round(((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/**
 * Offers whose regular yearly gross price is below `low` x or above `high` x the median of the
 * other providers for the same TLD. A TLD is checked only when at least `minOthers` other providers
 * have a comparable value (the median of the others then stays robust against a single outlier). The
 * offer itself is never part of its median, so an outlier cannot dampen its own detection. Sorted by TLD, then provider.
 */
export function plausibilityHits(
  offers: readonly Offer[],
  providers: readonly Pick<Provider, 'id' | 'vat_rate'>[],
  fx: readonly FxRates[],
  options: PlausibilityOptions = {},
): PlausibilityHit[] {
  return plausibilityCheck(offers, providers, fx, options).hits;
}

/** plausibilityHits plus the offers that could not be compared (they never drop out silently). */
export function plausibilityCheck(
  offers: readonly Offer[],
  providers: readonly Pick<Provider, 'id' | 'vat_rate'>[],
  fx: readonly FxRates[],
  options: PlausibilityOptions = {},
): PlausibilityResult {
  const low = options.low ?? DEFAULT_PLAUSIBILITY_LOW;
  const high = options.high ?? DEFAULT_PLAUSIBILITY_HIGH;
  const minOthers = options.minOthers ?? DEFAULT_PLAUSIBILITY_MIN_OTHERS;
  if (!(low > 0 && low < 1)) throw new RangeError(`low must be between 0 and 1, got ${low}`);
  if (!(high > 1)) throw new RangeError(`high must be greater than 1, got ${high}`);
  if (!(Number.isInteger(minOthers) && minOthers >= 1)) {
    throw new RangeError(`minOthers must be an integer >= 1, got ${minOthers}`);
  }
  const vat = new Map(providers.map((p) => [p.id, p]));
  const byTld = new Map<string, { provider: string; v: YearlyValue }[]>();
  const uncomparable: UncomparableOffer[] = [];
  for (const o of offers) {
    const v = yearlyOrReason(o, vat.get(o.provider), fx);
    if (typeof v === 'string' || v.value <= 0) {
      uncomparable.push({
        provider: o.provider,
        tld: o.tld,
        reason: typeof v === 'string' ? v : 'zero',
      });
      continue;
    }
    const list = byTld.get(o.tld) ?? [];
    list.push({ provider: o.provider, v });
    byTld.set(o.tld, list);
  }
  const hits: PlausibilityHit[] = [];
  for (const [tld, list] of byTld) {
    if (list.length - 1 < minOthers) continue;
    for (const { provider, v } of list) {
      const others = list.filter((x) => x.provider !== provider).map((x) => x.v.value);
      const m = median(others);
      const ratio = v.value / m;
      if (ratio >= low && ratio <= high) continue;
      hits.push({
        provider,
        tld,
        field: v.field,
        value: v.value,
        median: m,
        ratio,
        direction: ratio < low ? 'below' : 'above',
        others: others.length,
      });
    }
  }
  // provider + TLD is unique per offer, so two keys are never equal
  const key = (h: { provider: string; tld: string }) => `${h.tld}\u0000${h.provider}`;
  const byKey = (a: { provider: string; tld: string }, b: { provider: string; tld: string }) =>
    key(a) < key(b) ? -1 : 1;
  return { hits: hits.sort(byKey), uncomparable: uncomparable.sort(byKey) };
}
