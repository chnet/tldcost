// Column filters (Archiv-Issue 76, design system FilterRow). Pure: parse/serialize of the URL parameter `f`,
// matching rows, and the texts of chips and summaries. No DOM, no storage.
//
// URL: f=<col>:<spec>;<col>:<spec>  (money and sums in cents, like the data)
//   text   payment:sepa              case-insensitive substring
//   pick   ssl_free:ja,na            bool: ja | paid (kostenpflichtig) | nein | na (k. A.); enum and
//                                    country: the values; "-" = none
//   range  year1:100..600            inclusive, either side may be empty; ",-na" drops k. A. rows
//   age    fetched_at:7              Datenstand not older than 7 or 30 days
// The provider column's text filter is the search parameter `q` (not part of `f`).
import type { Locale } from '../i18n/de';
import { COLUMN_BY_ID, type ColumnDef } from './columns';
import type { SortKey } from './sort';

export type Filter =
  | { kind: 'text'; text: string }
  | { kind: 'pick'; values: string[] }
  | { kind: 'range'; min: number | null; max: number | null; na: boolean }
  | { kind: 'age'; days: AgeDays };

export type Filters = Readonly<Record<string, Filter>>;
export type FilterKind = Filter['kind'];
export const AGE_OPTIONS = [7, 30] as const;
export type AgeDays = (typeof AGE_OPTIONS)[number];

/** Token of a missing value (k. A.) in pick filters. */
export const NA = 'na';
/** Longest text filter kept. */
export const MAX_FILTER_TEXT = 40;

/** The filter control of a column kind (FilterRow README, "Controls by column kind"). */
export function filterKind(col: ColumnDef): FilterKind {
  switch (col.kind) {
    case 'text':
      return 'text';
    case 'bool':
    case 'enum':
      return 'pick';
    case 'date':
      return 'age';
    default:
      return 'range';
  }
}

/** Text filter as stored: single spaces, trimmed, without the URL separators ; : , */
export function normalizeText(raw: string): string {
  return raw.replace(/[;:,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_FILTER_TEXT);
}

const INT = /^\d{1,9}$/;

function parseSpec(col: ColumnDef, spec: string): Filter | null {
  switch (filterKind(col)) {
    case 'text': {
      const text = normalizeText(spec);
      return text ? { kind: 'text', text } : null;
    }
    case 'pick': {
      if (spec === '-') return { kind: 'pick', values: [] };
      const values = [...new Set(spec.split(',').filter((v) => /^[A-Za-z0-9/-]{1,20}$/.test(v)))];
      return values.length ? { kind: 'pick', values } : null;
    }
    case 'age': {
      const days = Number(spec);
      return (AGE_OPTIONS as readonly number[]).includes(days)
        ? { kind: 'age', days: days as AgeDays }
        : null;
    }
    case 'range': {
      const [range = '', ...flags] = spec.split(',');
      const m = /^(\d*)\.\.(\d*)$/.exec(range);
      if (!m) return null;
      const min = m[1] && INT.test(m[1]) ? Number(m[1]) : null;
      const max = m[2] && INT.test(m[2]) ? Number(m[2]) : null;
      const na = !flags.includes('-na');
      if (min === null && max === null && na) return null;
      if (min !== null && max !== null && min > max) return null;
      return { kind: 'range', min, max, na };
    }
  }
}

/**
 * `f` -> filters. Unknown columns, the provider column, bad specs and duplicates are dropped.
 * `byId`: the columns of the table (default: the price table; the portfolio passes its own).
 */
export function parseFilters(
  raw: string | null,
  byId: ReadonlyMap<string, ColumnDef> = COLUMN_BY_ID,
): Filters {
  const out: Record<string, Filter> = {};
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    const id = part.slice(0, i);
    const col = byId.get(id);
    if (!col || id === 'provider' || id in out) continue;
    const f = parseSpec(col, part.slice(i + 1));
    if (f) out[id] = f;
  }
  return out;
}

function specOf(f: Filter): string {
  switch (f.kind) {
    case 'text':
      return f.text;
    case 'pick':
      return f.values.length ? f.values.join(',') : '-';
    case 'age':
      return String(f.days);
    case 'range':
      return `${f.min ?? ''}..${f.max ?? ''}${f.na ? '' : ',-na'}`;
  }
}

/** Filters -> `f` value in column order (one view, one URL), or '' when there is none. */
export function serializeFilters(filters: Filters, order: readonly string[]): string {
  return order
    .filter((id) => filters[id])
    .map((id) => `${id}:${specOf(filters[id] as Filter)}`)
    .join(';');
}

/**
 * Pick token of a value: ja / nein for booleans, the value itself for enums and for "paid" in a
 * bool column (same token and label as whois_privacy paid), na for k. A.
 */
export function pickToken(v: SortKey): string {
  if (v === null) return NA;
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  return String(v);
}

/** Days between an ISO timestamp and `now` (fractional). */
const ageDays = (iso: string, now: number) => (now - Date.parse(iso)) / 86_400_000;

/** Does one value pass one filter? Missing values (k. A.) are kept unless excluded explicitly. */
export function matches(f: Filter, v: SortKey, now: number): boolean {
  switch (f.kind) {
    case 'text':
      // k. A. is kept: an unknown value is never silently treated as "does not contain"
      return v === null || textFold(String(v)).includes(textFold(f.text));
    case 'pick':
      return f.values.includes(pickToken(v));
    case 'age':
      return v === null || ageDays(String(v), now) <= f.days;
    case 'range':
      if (v === null || typeof v !== 'number') return f.na;
      return (f.min === null || v >= f.min) && (f.max === null || v <= f.max);
  }
}

export function matchesAll(
  filters: Filters,
  values: Readonly<Record<string, SortKey>>,
  now: number,
): boolean {
  for (const [id, f] of Object.entries(filters)) {
    if (!matches(f, values[id] ?? null, now)) return false;
  }
  return true;
}

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Text match on both sides as stored: the URL separators ; : , count as spaces, so the cell
 * "SEPA, PayPal" matches the filter "sepa, paypal" (stored as "sepa paypal"). */
const textFold = (s: string) => fold(s.replace(/[;:,]/g, ' ').replace(/\s+/g, ' '));

/** Only the filters of visible columns survive (a hidden column's filter is cleared). */
export function keepVisible(filters: Filters, visible: readonly string[]): Filters {
  return Object.fromEntries(Object.entries(filters).filter(([id]) => visible.includes(id)));
}

// ---------- texts (per language: src/i18n) ----------

/** A range bound as shown: "6,00 €" / "€6.00" for prices, "30 Tage" / "30 days" for counts. */
export function boundText(L: Locale, col: ColumnDef, v: number): string {
  if (col.kind === 'money' || col.kind === 'tco') return L.f.eur(v);
  const unit = L.m.columns[col.id]?.unit;
  return unit ? `${v} ${unit}` : String(v);
}

/** Integer input -> number; '' -> null; invalid -> undefined. */
export function parseIntInput(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  return /^\d{1,9}$/.test(t) ? Number(t) : undefined;
}

/** Label of a pick value: "ja" / "yes", "kostenlos" / "free", "k. A." / "n/a", or the country code with its name. */
export function pickLabel(
  L: Locale,
  token: string,
  countryNames: Readonly<Record<string, string>> = {},
): string {
  if (token === NA) return L.m.common.missing;
  if (countryNames[token]) return `${token} ${countryNames[token]}`;
  // bool tokens are URL tokens (ja, nein), the same in every language
  if (token === 'ja') return L.m.common.yes;
  if (token === 'nein') return L.m.common.no;
  return L.m.enums[token] ?? token;
}

/** Value part of a chip or summary: "bis 6,00 €", "ja, k. A.", "enthält „sepa“", "≤ 7 Tage". */
export function filterValueText(
  L: Locale,
  col: ColumnDef,
  f: Filter,
  countryNames: Readonly<Record<string, string>> = {},
): string {
  const t = L.m.filters;
  switch (f.kind) {
    case 'text':
      return t.contains(f.text);
    case 'pick':
      return f.values.length
        ? f.values.map((v) => (countryNames[v] ? v : pickLabel(L, v))).join(', ')
        : t.none;
    case 'age':
      return t.maxDays(f.days);
    case 'range': {
      const parts: string[] = [];
      if (f.min !== null && f.max !== null)
        parts.push(t.between(boundText(L, col, f.min), boundText(L, col, f.max)));
      else if (f.min !== null) parts.push(t.atLeast(boundText(L, col, f.min)));
      else if (f.max !== null) parts.push(t.atMost(boundText(L, col, f.max)));
      if (!f.na) parts.push(t.withoutNa);
      return parts.join(', ');
    }
  }
}
