// URL state of the portfolio calculator (Archiv-Issue 74): ?basket=de:10,com:3,eu:5&years=3&vat=net&mode=transfer,
// plus sort and filter of the result table (Archiv-Issue 123) with the parameters of the price table:
// sort, dir, q (provider search) and f (column filters, filters.ts).
// Like the table (url-state.ts): no cookies, no storage; parse() never fails (invalid parts fall
// back to the default), serialize() writes a fixed order and leaves defaults out, so one view has
// exactly one URL. Parameters the calculator does not own (e.g. `theme`) are passed through.
import {
  MAX_BASKET_COUNT,
  MAX_BASKET_ROWS as CORE_MAX_BASKET_ROWS,
  type BasketItem,
  type BasketMode,
} from '@tldcost/core';
import { BASKET_DEFAULT_SORT, basketColumns } from './basket-view';
import type { ColumnDef } from './columns';
import { keepVisible, parseFilters, serializeFilters, type Filters } from './filters';
import type { SortDir } from './sort';
import { normalizeQuery, type Vat } from './url-state';

export const BASKET_YEARS = [1, 2, 3, 5] as const;
export type BasketYears = (typeof BASKET_YEARS)[number];
export const DEFAULT_YEARS: BasketYears = 3;
/** Most rows (TLDs) in one basket: the core limit (one constant, shared with the MCP tool). */
export const MAX_BASKET_ROWS = CORE_MAX_BASKET_ROWS;
/** Largest count per TLD accepted from the URL or the input: the core limit (one constant). */
export const MAX_COUNT = MAX_BASKET_COUNT;

export interface BasketState {
  /** In the reader's order; TLDs unique and with data. */
  basket: BasketItem[];
  years: BasketYears;
  vat: Vat;
  mode: BasketMode;
  /** Sort column of the result table (Archiv-Issue 123); a column of the current basket. */
  sort: string;
  dir: SortDir;
  /** Provider search: substring of the provider name; '' = all rows. */
  q: string;
  /** Column filters of the result table, only for columns of the current basket. */
  f: Filters;
}

export const BASKET_PARAMS: readonly string[] = [
  'basket',
  'years',
  'vat',
  'mode',
  'sort',
  'dir',
  'q',
  'f',
];

export function defaultBasketState(): BasketState {
  return {
    basket: [],
    years: DEFAULT_YEARS,
    vat: 'gross',
    mode: 'new',
    sort: BASKET_DEFAULT_SORT,
    dir: 'asc',
    q: '',
    f: {},
  };
}

const columnsOf = (state: Pick<BasketState, 'basket'>): ColumnDef[] =>
  basketColumns(state.basket.map((b) => b.tld));

/**
 * Sort and filters that fit the basket: a sort on a TLD that is no longer in the basket falls back
 * to the default (total ascending), a filter on it is cleared.
 */
export function fitView(state: BasketState): BasketState {
  const cols = columnsOf(state);
  const sortable = cols.some((c) => c.id === state.sort && c.sortable !== false);
  return {
    ...state,
    sort: sortable ? state.sort : BASKET_DEFAULT_SORT,
    dir: sortable ? state.dir : 'asc',
    f: keepVisible(
      state.f,
      cols.map((c) => c.id),
    ),
  };
}

/** A count from the URL or the input: integer 1..MAX_COUNT, else null. */
export function parseCount(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= MAX_COUNT ? n : null;
}

/** `de:10,com:3`: known TLDs only, first occurrence wins, at most MAX_BASKET_ROWS. */
export function parseBasket(raw: string | null, tlds: readonly string[]): BasketItem[] {
  const out: BasketItem[] = [];
  for (const part of (raw ?? '').split(',')) {
    if (out.length >= MAX_BASKET_ROWS) break;
    const [t, c, extra] = part.split(':');
    if (t === undefined || c === undefined || extra !== undefined) continue;
    const tld = t.trim().toLowerCase().replace(/^\./, '');
    const count = parseCount(c);
    if (!tlds.includes(tld) || count === null || out.some((b) => b.tld === tld)) continue;
    out.push({ tld, count });
  }
  return out;
}

export function parseBasketState(search: string, tlds: readonly string[]): BasketState {
  const q = new URLSearchParams(search);
  const state = defaultBasketState();
  state.basket = parseBasket(q.get('basket'), tlds);
  const years = Number(q.get('years'));
  if ((BASKET_YEARS as readonly number[]).includes(years)) state.years = years as BasketYears;
  const vat = q.get('vat');
  if (vat === 'gross' || vat === 'net') state.vat = vat;
  if (q.get('mode') === 'transfer') state.mode = 'transfer';
  state.sort = q.get('sort') ?? BASKET_DEFAULT_SORT;
  const dir = q.get('dir');
  if (dir === 'asc' || dir === 'desc') state.dir = dir;
  state.q = normalizeQuery(q.get('q') ?? '');
  state.f = parseFilters(q.get('f'), new Map(columnsOf(state).map((c) => [c.id, c])));
  return fitView(state);
}

/** Canonical query string including the leading `?`, or '' for the default view. */
export function serializeBasketState(state: BasketState, current = ''): string {
  const q: string[] = [];
  if (state.basket.length) {
    q.push(
      `basket=${state.basket.map((b) => `${encodeURIComponent(b.tld)}:${b.count}`).join(',')}`,
    );
  }
  if (state.years !== DEFAULT_YEARS) q.push(`years=${state.years}`);
  if (state.vat !== 'gross') q.push(`vat=${state.vat}`);
  if (state.mode !== 'new') q.push(`mode=${state.mode}`);
  const view = fitView(state);
  if (view.sort !== BASKET_DEFAULT_SORT) q.push(`sort=${encodeURIComponent(view.sort)}`);
  if (view.dir !== 'asc') q.push(`dir=${view.dir}`);
  const query = normalizeQuery(view.q);
  if (query) q.push(`q=${encodeURIComponent(query)}`);
  const f = serializeFilters(
    view.f,
    columnsOf(view).map((c) => c.id),
  );
  // readable separators, as in the table: f=total:..50000;complete:ja
  if (f)
    q.push(
      `f=${encodeURIComponent(f).replace(/%3A/g, ':').replace(/%3B/g, ';').replace(/%2C/g, ',')}`,
    );
  for (const [k, v] of new URLSearchParams(current)) {
    if (!BASKET_PARAMS.includes(k)) q.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return q.length ? `?${q.join('&')}` : '';
}
