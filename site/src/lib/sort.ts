// Deterministic row order (methodik; concept section 3.1 point 3 and Finding 1).
//
// Rules, in this order:
//   1. Missing values (null) are always last, whatever the direction.
//   2. The value of the sort column decides, compared in the selected VAT mode. Amounts are integer
//      cents, so equal prices are real ties. asc = cheapest / smallest / "ja" first; in feature
//      columns that may cost extra: ja, kostenpflichtig ("paid"), nein (Archiv-Issue 124).
//   3. Ties: total cost over 3 years (sum_3y, same VAT mode) ascending, missing last. This comes
//      before the id, because an id-only tie-break favours ids early in the alphabet on every tie
//      (frequent in yes/no columns), including the portal operator's.
//   4. Then provider id ascending (code-unit order). Steps 3 and 4 are ascending also when sorting
//      descending: the direction applies to the sort column only.
//   5. Last resort: row key ascending (provider/tld), so the order is total.
//
// The comparator only ever sees SortableRow. It has no operator field (the badge lives in
// separate display data), so the portal operator's row cannot be treated differently.
import { ENUM_RANK } from './columns';

export type SortKey = number | string | boolean | null;
export type SortDir = 'asc' | 'desc';

export interface SortableRow {
  /** Unique row key, `<providerId>/<tld>`. */
  readonly key: string;
  readonly providerId: string;
  /** Column id -> value in the selected VAT mode. A missing entry counts as null. */
  readonly values: Readonly<Record<string, SortKey>>;
}

/** Compile-time guard: adding an `operator` field to SortableRow breaks the build. */
export const SORTABLE_ROW_HAS_NO_OPERATOR: 'operator' extends keyof SortableRow ? never : true =
  true;

/** Code-unit order, independent of the browser locale (same as @tldcost/core compareIds). */
export const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Fixed collator: German, numeric, case- and accent-insensitive. Never the browser locale. */
const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Rank of a yes/no feature value: ja, kostenpflichtig ("paid"), nein; undefined otherwise. */
const featureRank = (v: Exclude<SortKey, null>): number | undefined =>
  v === true ? 0 : v === 'paid' ? 1 : v === false ? 2 : undefined;

/** Ascending comparison of two non-null values of one column. */
export function compareValues(a: Exclude<SortKey, null>, b: Exclude<SortKey, null>): number {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a < b ? -1 : 1;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const ra = featureRank(a);
    const rb = featureRank(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    const ra = ENUM_RANK[a];
    const rb = ENUM_RANK[b];
    if (ra !== undefined && rb !== undefined) return ra - rb;
    return collator.compare(a, b) || compareIds(a, b);
  }
  // mixed types never occur in valid data; keep the order total anyway
  return compareIds(typeof a, typeof b);
}

/** Column of the first tie-break (methodik): total cost over 3 years in the selected VAT mode. */
export const TIE_BREAK_COLUMN = 'sum_3y';

/** Ascending comparison of one column, missing values last; 0 = tie. */
function compareColumn(ra: SortableRow, rb: SortableRow, col: string, sign: 1 | -1): number {
  const a = ra.values[col] ?? null;
  const b = rb.values[col] ?? null;
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return sign * compareValues(a, b);
}

/** Keys of `rows` in display order for column `col` and direction `dir`. Pure; input order is irrelevant. */
export function sortRows(rows: readonly SortableRow[], col: string, dir: SortDir): string[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows]
    .sort(
      (ra, rb) =>
        compareColumn(ra, rb, col, sign) ||
        compareColumn(ra, rb, TIE_BREAK_COLUMN, 1) ||
        compareIds(ra.providerId, rb.providerId) ||
        compareIds(ra.key, rb.key),
    )
    .map((r) => r.key);
}
