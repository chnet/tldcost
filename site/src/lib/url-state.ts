// The whole view state lives in the query string (no cookies, no storage: datenschutz).
// parse() never fails: unknown or invalid values fall back to the default. serialize() writes the
// parameters in a fixed order and leaves defaults out, so one view has exactly one URL.
import { COLUMNS, COLUMN_BY_ID, COLUMN_IDS, DEFAULT_COLUMNS, DEFAULT_SORT } from './columns';
import { keepVisible, parseFilters, serializeFilters, type Filters } from './filters';
import type { SortDir } from './sort';

export type Vat = 'gross' | 'net';

export interface ViewState {
  tld: string;
  sort: string;
  dir: SortDir;
  /** Explicit column selection in canonical order; null = device default (desktop or mobile). */
  cols: string[] | null;
  vat: Vat;
  /** Provider search: case-insensitive substring of the provider name; '' = all rows. */
  q: string;
  /** Column filters (URL `f`), only for visible columns. */
  f: Filters;
}

/** Parameters owned by the table. Anything else (e.g. `theme`) is passed through untouched. */
export const OWN_PARAMS: readonly string[] = ['tld', 'sort', 'dir', 'cols', 'vat', 'q', 'f'];
/** Longest search text kept in the URL (longer input is cut). */
export const MAX_QUERY = 60;

export interface UrlContext {
  /** TLDs that have data. */
  tlds: readonly string[];
}

export const PREFERRED_TLD = 'de';

export function defaultTld(ctx: UrlContext): string {
  return ctx.tlds.includes(PREFERRED_TLD) ? PREFERRED_TLD : (ctx.tlds[0] ?? PREFERRED_TLD);
}

export function defaultState(ctx: UrlContext): ViewState {
  return {
    tld: defaultTld(ctx),
    sort: DEFAULT_SORT,
    dir: 'asc',
    cols: null,
    vat: 'gross',
    q: '',
    f: {},
  };
}

/** Known column ids from a `cols` value, deduplicated, in display order, `provider` always first. */
export function canonicalCols(raw: readonly string[]): string[] | null {
  const wanted = new Set(raw.filter((id) => COLUMN_BY_ID.has(id) && id !== 'provider'));
  if (wanted.size === 0) return null;
  return ['provider', ...COLUMNS.filter((c) => wanted.has(c.id)).map((c) => c.id)];
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function parse(search: string, ctx: UrlContext): ViewState {
  const q = new URLSearchParams(search);
  const state = defaultState(ctx);

  const tld = q.get('tld')?.toLowerCase().replace(/^\./, '');
  if (tld && ctx.tlds.includes(tld)) state.tld = tld;

  const sort = q.get('sort');
  if (sort && COLUMN_BY_ID.has(sort) && COLUMN_BY_ID.get(sort)?.sortable !== false) {
    state.sort = sort;
  }

  const dir = q.get('dir');
  if (dir === 'asc' || dir === 'desc') state.dir = dir;

  const cols = q.get('cols');
  if (cols) {
    const c = canonicalCols(cols.split(','));
    state.cols = c && sameList(c, DEFAULT_COLUMNS) ? null : c;
  }

  const vat = q.get('vat');
  if (vat === 'gross' || vat === 'net') state.vat = vat;

  state.q = normalizeQuery(q.get('q') ?? '');
  state.f = keepVisible(parseFilters(q.get('f')), state.cols ?? DEFAULT_COLUMNS);
  return state;
}

/** Search text as stored: single spaces, trimmed, at most MAX_QUERY characters. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
}

/**
 * Canonical query string including the leading `?`, or '' for the default view. `current` is the
 * present query string: its parameters that the table does not own (e.g. `theme` of the theme
 * switch) are kept, in their order, after the table's own.
 */

export function serialize(state: ViewState, ctx: UrlContext, current = ''): string {
  const q: string[] = [];
  if (state.tld !== defaultTld(ctx)) q.push(`tld=${encodeURIComponent(state.tld)}`);
  if (state.sort !== DEFAULT_SORT) q.push(`sort=${state.sort}`);
  if (state.dir !== 'asc') q.push(`dir=${state.dir}`);
  if (state.cols && !sameList(state.cols, DEFAULT_COLUMNS)) {
    q.push(`cols=${state.cols.filter((id) => id !== 'provider').join(',')}`);
  }
  if (state.vat !== 'gross') q.push(`vat=${state.vat}`);
  const query = normalizeQuery(state.q);
  if (query) q.push(`q=${encodeURIComponent(query)}`);
  const f = serializeFilters(keepVisible(state.f, state.cols ?? DEFAULT_COLUMNS), COLUMN_IDS);
  // readable separators: f=country:DE;year1:..600
  if (f)
    q.push(
      `f=${encodeURIComponent(f).replace(/%3A/g, ':').replace(/%3B/g, ';').replace(/%2C/g, ',')}`,
    );
  for (const [k, v] of new URLSearchParams(current)) {
    if (!OWN_PARAMS.includes(k)) q.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return q.length ? `?${q.join('&')}` : '';
}
