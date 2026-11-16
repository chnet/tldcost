// Price history of one offer (schema/history.schema.json, data/history/<provider>/<tld>.json).
// Append-only and small: a new entry only when the price state changes, dated with the day the new
// state was first seen (evidence.fetched_at). No new fetches: everything comes from the offer.
import type { Cents, Offer, PriceUnit } from './types.js';

/** Fields of an entry that make up the price state (schema $defs/entry, besides date and source). */
export const HISTORY_STATE_FIELDS = [
  'currency',
  'vat_included',
  'unit',
  'setup',
  'year1',
  'renewal',
  'transfer_in',
] as const;

/** Price state of an offer as the history records it (amounts as stated by the provider). */
export interface PriceState {
  currency: string;
  vat_included: boolean | null;
  unit: PriceUnit;
  setup: Cents | null;
  year1: Cents | null;
  renewal: Cents | null;
  transfer_in: Cents | null;
}

export interface HistoryEntry extends PriceState {
  /** Day the state was first seen (YYYY-MM-DD, from evidence.fetched_at). */
  date: string;
  /** The offer's evidence when the entry was written. */
  source: { url: string; fetched_at: string };
}

export interface PriceHistory {
  schema_version: 1;
  provider: string;
  tld: string;
  /** Oldest first; dates strictly ascending. */
  entries: HistoryEntry[];
}

export function priceState(offer: Offer): PriceState {
  const p = offer.price;
  return {
    currency: offer.currency,
    vat_included: offer.vat_included,
    unit: p.unit,
    setup: p.setup,
    year1: p.year1,
    renewal: p.renewal,
    transfer_in: p.transfer_in ?? null,
  };
}

export function samePriceState(a: PriceState, b: PriceState): boolean {
  return HISTORY_STATE_FIELDS.every((f) => a[f] === b[f]);
}

/** The amounts of two states are comparable: same currency, price unit and VAT mode. */
function comparable(a: PriceState, b: PriceState): boolean {
  return a.currency === b.currency && a.unit === b.unit && a.vat_included === b.vat_included;
}

/**
 * The history after this offer state. Unchanged price state: the same object, `changed` false (no
 * entry per run). A change: a new entry dated with evidence.fetched_at; a second change on the
 * same day replaces that day's entry (dates only: the day counts, not the time). Throws, and never
 * drops entries, when the currency, price unit or VAT mode changes (the old amounts would not be
 * comparable; a person decides, e.g. by deleting the file in a visible commit) or when fetched_at
 * is older than the last entry (the offer's evidence must move forward with its price).
 */
export function appendHistory(
  history: PriceHistory | undefined,
  offer: Offer,
): { history: PriceHistory; changed: boolean } {
  const state = priceState(offer);
  const entry: HistoryEntry = {
    date: offer.evidence.fetched_at.slice(0, 10),
    ...state,
    source: { url: offer.evidence.source_url, fetched_at: offer.evidence.fetched_at },
  };
  const fresh = (): PriceHistory => ({
    schema_version: 1,
    provider: offer.provider,
    tld: offer.tld,
    entries: [entry],
  });
  const last = history?.entries.at(-1);
  if (!history || !last) return { history: fresh(), changed: true };
  if (samePriceState(last, state)) return { history, changed: false };
  if (!comparable(last, state)) {
    const basis = (x: PriceState) => `${x.currency}/${x.unit}/vat_included ${x.vat_included}`;
    throw new Error(
      `${offer.provider}/${offer.tld}: currency, price unit or VAT mode changed (${basis(last)} -> ${basis(state)}); ` +
        `the history is kept and not continued, its amounts would not be comparable. Check the offer; ` +
        `to start the history anew, delete data/history/${offer.provider}/${offer.tld}.json in a visible commit and run npm run history:sync`,
    );
  }
  if (entry.date < last.date) {
    throw new Error(
      `${offer.provider}/${offer.tld}: evidence.fetched_at ${entry.date} is older than the last history entry ${last.date}`,
    );
  }
  const kept = entry.date === last.date ? history.entries.slice(0, -1) : history.entries;
  // same day, back to the state before that day: drop the day's entry instead of repeating a state
  const before = kept.at(-1);
  const entries = before && samePriceState(before, state) ? kept : [...kept, entry];
  return { history: { ...history, entries }, changed: true };
}
