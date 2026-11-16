// Sort and filter of the portfolio result table (Archiv-Issue 123). Pure: the columns of a basket, the values
// the comparator and the filters see, the row order and the tc-best cells. Same rules as the price
// table (Archiv-Issue 76): missing values last, ties by total and provider id, filters from filters.ts. The
// comparator only sees BasketViewRow, which has no operator field.
import type { BasketProvider, BasketResult } from '@tldcost/core';
import type { ColumnDef, ColumnKind } from './columns';
import { fold, matchesAll, type Filters } from './filters';
import { compareIds, compareValues, type SortDir, type SortKey } from './sort';

/** Default sort column (methodik: by total, ascending). */
export const BASKET_DEFAULT_SORT = 'total';

/**
 * Land is filterable but not sortable, as in the price table (CountryFlag README: the country is no
 * ranking signal; owner decision 2026-11-15, Archiv-Issue 123). true would sort by country code.
 */
export const BASKET_COUNTRY_SORTABLE = false;

/** Column id of one basket TLD (its subtotal). */
export const tldColumn = (tld: string) => `tld-${tld}`;

const col = (id: string, kind: ColumnKind, sortable = true): ColumnDef => ({
  id,
  kind,
  vatDependent: kind === 'money',
  defaultVisible: true,
  mobileDefault: true,
  sortable,
});

/** Columns of the result table for the basket TLDs, in display order. */
export function basketColumns(tlds: readonly string[]): ColumnDef[] {
  return [
    col('provider', 'text'),
    col('country', 'enum', BASKET_COUNTRY_SORTABLE),
    col('total', 'money'),
    ...tlds.map((t) => col(tldColumn(t), 'money')),
    col('complete', 'bool'),
    col('assumption', 'bool'),
  ];
}

/** Assumptions the calculator makes for a provider (each has its own footnote). */
export type Assumption = 'vat' | 'renewal' | 'pool';

/**
 * The provider's footnotes that are assumptions of the calculation rather than stated facts: no
 * VAT statement (price taken as stated), the renewal price used as the regular year-1 price, and
 * the promo budget per customer counted on the TLD with the smallest saving.
 */
export function assumptions(p: BasketProvider): Assumption[] {
  const out: Assumption[] = [];
  if (p.vatNotStated) out.push('vat');
  if (p.lines.some((l) => l.regularFromRenewal && l.subtotal !== null)) out.push('renewal');
  if (p.promoPool?.limited && p.total !== null) out.push('pool');
  return out;
}

export interface BasketViewRow {
  provider: string;
  /** Column id -> value. */
  values: Readonly<Record<string, SortKey>>;
  /** Lines with a subtotal (core tie-break: more complete lines first). */
  completeLines: number;
}

export interface BasketRowMeta {
  name: string;
  country: string;
}

/** Rows of the result in core order, with the values of every column. */
export function basketRows(
  result: BasketResult,
  meta: (id: string) => BasketRowMeta | undefined,
): BasketViewRow[] {
  return result.providers.map((p) => {
    const m = meta(p.provider);
    const values: Record<string, SortKey> = {
      provider: m?.name ?? p.provider,
      country: m?.country ?? null,
      total: p.total,
      complete: p.total !== null,
      assumption: assumptions(p).length > 0,
    };
    for (const l of p.lines) values[tldColumn(l.tld)] = l.subtotal;
    return {
      provider: p.provider,
      values,
      completeLines: p.lines.filter((l) => l.subtotal !== null).length,
    };
  });
}

/** Ascending comparison of one column, missing values last; 0 = tie. */
function compareColumn(a: BasketViewRow, b: BasketViewRow, id: string, sign: 1 | -1): number {
  const va = a.values[id] ?? null;
  const vb = b.values[id] ?? null;
  if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
  return sign * compareValues(va, vb);
}

/**
 * Display order. Rows without a total always come after rows with one, whatever the column and
 * direction (Archiv-Issue 123). Then the sort column (missing values last), then total ascending, more complete
 * lines, provider id. With `total` ascending this is the order of computeBasket.
 */
export function sortBasketRows(
  rows: readonly BasketViewRow[],
  sort: string,
  dir: SortDir,
): BasketViewRow[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort(
    (a, b) =>
      Number(a.values.total === null) - Number(b.values.total === null) ||
      compareColumn(a, b, sort, sign) ||
      compareColumn(a, b, 'total', 1) ||
      b.completeLines - a.completeLines ||
      compareIds(a.provider, b.provider),
  );
}

/** Provider search: case- and accent-insensitive substring of the name or the id. */
export function matchesProvider(row: BasketViewRow, q: string): boolean {
  const needle = fold(q);
  if (!needle) return true;
  return (
    fold(String(row.values.provider ?? '')).includes(needle) || fold(row.provider).includes(needle)
  );
}

/** Sorted rows narrowed by the provider search and the column filters. */
export function visibleBasketRows(
  rows: readonly BasketViewRow[],
  view: { sort: string; dir: SortDir; q: string; f: Filters },
  now = Date.now(),
): BasketViewRow[] {
  return sortBasketRows(rows, view.sort, view.dir).filter(
    (r) => matchesProvider(r, view.q) && matchesAll(view.f, r.values, now),
  );
}

/**
 * tc-best (owner decision B, Archiv-Issue 76): per amount column the lowest value among the shown rows, as
 * `<provider>|<column id>`. Without a filter the shown rows are all rows. Ties: every cell with the
 * minimum; missing values never.
 */
export function basketBestCells(
  rows: readonly BasketViewRow[],
  columns: readonly ColumnDef[],
): Set<string> {
  const out = new Set<string>();
  for (const c of columns) {
    if (c.kind !== 'money') continue;
    let min = Infinity;
    for (const r of rows) {
      const v = r.values[c.id];
      if (typeof v === 'number' && v < min) min = v;
    }
    if (min === Infinity) continue;
    for (const r of rows) if (r.values[c.id] === min) out.add(`${r.provider}|${c.id}`);
  }
  return out;
}
