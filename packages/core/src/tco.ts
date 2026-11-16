import { assertFx, isVatRate, normalizePrice } from './normalize.js';
import type { BasisPoints, Cents, FxRate, Offer, PriceMode, Provider } from './types.js';

export const MAX_TCO_YEARS = 10;

export interface TcoOptions {
  /** Default `gross`. */
  mode?: PriceMode;
  /** Source of the VAT rate when the offer has none. */
  provider?: Pick<Provider, 'vat_rate'>;
  /** ECB rate for the offer currency (see fxRateFor), required when the offer is not in EUR. */
  fx?: FxRate;
  /**
   * `registration` (default): a new domain, year1 then year2/year3/renewal. `transfer`: an existing
   * domain moved in: the one-off price.transfer_in plus the renewal price from year 1, unless the
   * provider states that the transfer includes a term (price.transfer_includes_term true): then it
   * covers exactly 1 year (methodik: "ein Jahr Laufzeit") and the first renewal is due in year 2.
   * With a renewal term other than 1 year that is not decidable: `transfer_term_unclear` is listed
   * as missing (no sum). year1, year2/year3 and term_years do not apply.
   */
  start?: TcoStart;
}

export type TcoStart = 'registration' | 'transfer';

export interface TcoResult {
  years: number;
  mode: PriceMode;
  currency: 'EUR';
  /** One-off setup fee (EUR cents), null if unknown. */
  setup: Cents | null;
  /**
   * Amount falling due in year 1..N (EUR cents, setup excluded): a payment in full in the year it
   * is due, 0 in years already covered by a multi-year term, null where unknown.
   */
  perYear: (Cents | null)[];
  /** Number of payments (excl. setup) falling due within the N years. */
  payments: number;
  /** setup + all payments due within N years, each in full; null if any part is missing. */
  sum: Cents | null;
  /** round(sum / N); null if sum is null. */
  avg: Cents | null;
  /** Missing inputs, e.g. ['price.renewal', 'vat_rate', 'fx.USD']; empty when complete. */
  missing: string[];
  /** The FX rate used (non-EUR offers only). */
  fx: FxRate | null;
  /** Provider makes no VAT statement (vat_included null): price as stated in both modes, footnote. */
  vatNotStated: boolean;
}

/** True if a payment falls due at the start of year `i` (1-based) for the given terms. */
export function isPaymentDue(i: number, termYears = 1, renewalTermYears = 1): boolean {
  return i === 1 || (i > termYears && (i - 1 - termYears) % renewalTermYears === 0);
}

function termOf(value: number | undefined, field: string, monthly: boolean): number {
  const t = value ?? 1;
  if (!Number.isInteger(t) || t < 1 || t > MAX_TCO_YEARS) {
    throw new RangeError(`${field} must be an integer 1..${MAX_TCO_YEARS}, got ${t}`);
  }
  if (monthly && t !== 1) throw new RangeError(`${field} must be 1 for monthly prices`);
  return t;
}

/** Raw (offer currency, offer unit) payment due in year `i` (1-based) and its source field. */
function rawYear(offer: Offer, i: number): [Cents | null, string] {
  const p = offer.price;
  if (i === 1) return [p.year1, 'price.year1'];
  const specific = i === 2 ? p.year2 : i === 3 ? p.year3 : undefined;
  if (specific !== undefined && specific !== null) return [specific, `price.year${i}`];
  return [p.renewal, 'price.renewal'];
}

/**
 * Total cost of ownership over `years` (1..10) in EUR cents, gross by default (methodik):
 * sum_N = setup + every payment falling due within N years, each in full (year1 at the start, then
 * one renewal per renewal term after the first term; year_i ?? renewal, no pro-rating),
 * avg_N = round(sum_N / N). Monthly prices are annualised, net prices get VAT (offer.vat_rate, else
 * provider.vat_rate), prices without VAT statement (vat_included null) stay as stated, foreign
 * currencies use the ECB rate in `options.fx`. year1 never contains a coupon code.
 * Missing inputs never throw: they are listed in `missing` and make sum/avg null.
 * With `start: 'transfer'`: the one-off transfer_in (never annualised) plus the renewal price from
 * year 1, unless price.transfer_includes_term is true (see TcoOptions.start).
 */
export function computeTco(offer: Offer, years: number, options: TcoOptions = {}): TcoResult {
  if (!Number.isInteger(years) || years < 1 || years > MAX_TCO_YEARS) {
    throw new RangeError(`years must be an integer 1..${MAX_TCO_YEARS}, got ${years}`);
  }
  const mode = options.mode ?? 'gross';
  const start = options.start ?? 'registration';
  const missing: string[] = [];
  const monthly = offer.price.unit === 'month';
  const registrationTermYears = termOf(offer.price.term_years, 'price.term_years', monthly);
  const renewalTermYears = termOf(
    offer.price.renewal_term_years,
    'price.renewal_term_years',
    monthly,
  );
  // methodik: a transfer includes a term only if the provider says so (true); null counts as false.
  // That term is exactly 1 year; with renewals of another length it is unclear, never guessed.
  const transferIncludesTerm = start === 'transfer' && offer.price.transfer_includes_term === true;
  if (transferIncludesTerm && renewalTermYears !== 1) missing.push('transfer_term_unclear');
  // a transfer is followed by renewals (the registration term applies to new domains only)
  const termYears =
    start === 'transfer' ? (transferIncludesTerm ? 1 : renewalTermYears) : registrationTermYears;

  const vatNotStated = offer.vat_included === null;
  // a provider vat_rate of null (non-EU, no VAT statement) counts as missing when VAT is needed
  const vatRate: BasisPoints | undefined =
    offer.vat_rate ?? options.provider?.vat_rate ?? undefined;
  const needsVat = !vatNotStated && offer.vat_included !== (mode === 'gross');
  if (needsVat && !isVatRate(vatRate)) missing.push('vat_rate');

  let fx: FxRate | null = null;
  if (offer.currency !== 'EUR') {
    try {
      assertFx(options.fx, offer.currency);
      fx = options.fx;
    } catch {
      missing.push(`fx.${offer.currency}`);
    }
  }

  const canConvert = missing.length === 0;
  const convert = (amount: Cents | null, recurring: boolean): Cents | null =>
    amount === null || !canConvert
      ? null
      : normalizePrice(amount, {
          currency: offer.currency,
          vatIncluded: offer.vat_included,
          vatRate,
          unit: recurring ? offer.price.unit : 'year',
          mode,
          fx: fx ?? undefined,
        });

  if (offer.price.setup === null) missing.push('price.setup');
  const setup = convert(offer.price.setup, false);

  const perYear: (Cents | null)[] = [];
  let payments = 0;
  const renewal: [Cents | null, string, boolean] = [offer.price.renewal, 'price.renewal', true];
  for (let i = 1; i <= years; i++) {
    // [raw amount, source field, recurring]: transfer_in is one-off (schema: never annualised)
    const due: [Cents | null, string, boolean][] = [];
    if (start === 'transfer' && i === 1) {
      due.push([offer.price.transfer_in ?? null, 'price.transfer_in', false]);
      if (!transferIncludesTerm) due.push(renewal);
    } else if (isPaymentDue(i, termYears, renewalTermYears)) {
      due.push(start === 'transfer' ? renewal : [...rawYear(offer, i), true]);
    }
    let amount: Cents | null = 0;
    for (const [raw, field, recurring] of due) {
      payments++;
      if (raw === null && !missing.includes(field)) missing.push(field);
      const v = convert(raw, recurring);
      amount = amount === null || v === null ? null : amount + v;
    }
    perYear.push(amount);
  }

  const complete = missing.length === 0;
  const sum = complete
    ? perYear.reduce<number>((acc, v) => acc + (v as Cents), setup as Cents)
    : null;
  return {
    years,
    mode,
    currency: 'EUR',
    setup,
    perYear,
    payments,
    sum,
    avg: sum === null ? null : Math.round(sum / years),
    missing,
    fx,
    vatNotStated,
  };
}
