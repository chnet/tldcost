// Pure view logic shared by the server render and the island: which rows, in which order, which
// columns, which footnotes. No DOM access here (unit-tested).
import type { Locale } from '../i18n/de';
import { COLUMN_BY_ID, COLUMNS, DEFAULT_COLUMNS, type ColumnDef } from './columns';
import type { PayloadRow, ProviderMeta, SitePayload } from './payload';
import { REPORT_VIA, correctionUrl, type ReportVia } from './report.mjs';
import { matchesAll } from './filters';
import { sortRows, type SortableRow, type SortKey } from './sort';
import type { Vat, ViewState } from './url-state';

/** Rows of one TLD as the comparator sees them: key, provider id, values. Nothing else. */
export function sortableRows(payload: SitePayload, tld: string, vat: Vat): SortableRow[] {
  return payload.rows
    .filter((r) => r.tld === tld)
    .map((r) => ({ key: r.key, providerId: r.providerId, values: { ...r.common, ...r[vat] } }));
}

export interface ViewRow {
  row: PayloadRow;
  values: Record<string, SortKey>;
}

/**
 * Rows of the current TLD in display order, narrowed by the provider search (`state.q`) and the
 * column filters (`state.f`). `now` is the clock of the Datenstand filter (ms).
 */
export function orderedRows(payload: SitePayload, state: ViewState, now = Date.now()): ViewRow[] {
  const byKey = new Map(payload.rows.map((r) => [r.key, r]));
  // sort all rows of the TLD first, then filter: search and filters never change the order
  return sortRows(sortableRows(payload, state.tld, state.vat), state.sort, state.dir)
    .map((key) => {
      const row = byKey.get(key) as PayloadRow;
      return { row, values: { ...row.common, ...row[state.vat] } };
    })
    .filter(
      (v) => matchesQuery(payload, v.row, state.q) && matchesAll(state.f ?? {}, v.values, now),
    );
}

/** A search or a column filter is active (owner decision B: tc-best then over the shown rows). */
export function filtersActive(state: ViewState): boolean {
  return state.q !== '' || Object.keys(state.f ?? {}).length > 0;
}

/**
 * tc-best for the view (owner decision B, Archiv-Issue 76): without a search or filter over all rows of the
 * TLD; with one over the shown rows. `scope` says which, for the wording.
 */
export function bestForView(
  payload: SitePayload,
  state: ViewState,
  shown: readonly ViewRow[],
  now = Date.now(),
): { cells: Set<string>; scope: 'all' | 'filtered' } {
  if (filtersActive(state)) return { cells: bestCells(shown), scope: 'filtered' };
  return { cells: bestCells(orderedRows(payload, { ...state, q: '', f: {} }, now)), scope: 'all' };
}

/** Number of rows of the TLD before the provider search (for "N von M Anbietern"). */
export function rowCount(payload: SitePayload, tld: string): number {
  return payload.rows.filter((r) => r.tld === tld).length;
}

/** Provider search: case- and accent-insensitive substring of the provider name or id. */
export function matchesQuery(payload: SitePayload, row: PayloadRow, q: string): boolean {
  const needle = fold(q);
  if (!needle) return true;
  const name = payload.providers[row.providerId]?.name ?? '';
  return fold(name).includes(needle) || fold(row.providerId).includes(needle);
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Cells with the lowest value of their price column among the given rows (`tc-best`), as
 * `<row key>|<column id>`. Only money and sum columns; ties: every cell with the minimum; missing
 * values never. Pure function of the values: no provider or operator information is involved.
 */
export function bestCells(rows: readonly ViewRow[]): Set<string> {
  const out = new Set<string>();
  for (const col of COLUMNS) {
    if (col.kind !== 'money' && col.kind !== 'tco') continue;
    let min = Infinity;
    for (const { values } of rows) {
      const v = values[col.id];
      if (typeof v === 'number' && v < min) min = v;
    }
    if (min === Infinity) continue;
    for (const { row, values } of rows) if (values[col.id] === min) out.add(`${row.key}|${col.id}`);
  }
  return out;
}

/** Visible column ids: the explicit selection or the desktop default (mobile is done in CSS). */
export function visibleColumns(state: ViewState): readonly string[] {
  return state.cols ?? DEFAULT_COLUMNS;
}

/** Footnote ids of one cell in the given VAT mode (row-level notes belong to `provider`). */
export function cellNotes(row: PayloadRow, col: string, vat: Vat): readonly string[] {
  return col === 'provider' ? row.notes : (row.cellNotes[vat][col] ?? []);
}

/**
 * Footnote ids of the shown rows and visible columns in first-use order (row by row, left to
 * right), numbered from 1. Notes of hidden columns are not listed.
 */
export function footnotes(
  rows: readonly ViewRow[],
  cols: readonly string[] = DEFAULT_COLUMNS,
  vat: Vat = 'gross',
): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = COLUMNS.map((c) => c.id).filter((id) => id === 'provider' || cols.includes(id));
  for (const { row } of rows) {
    for (const col of ordered) {
      for (const id of cellNotes(row, col, vat)) if (!out.has(id)) out.set(id, out.size + 1);
    }
  }
  return out;
}

/** Label, unit (plural, singular) and the text for 0 of a column in the page language. */
export function columnText(
  L: Locale,
  col: Pick<ColumnDef, 'id'>,
): { label: string; unit?: string; unitOne?: string; zero?: string } {
  return L.m.columns[col.id] ?? { label: col.id };
}

/** Visible second line of a cell with a monthly price, e.g. "0,42 €/Monat" / "€0.42/month". */
export const formatPerMonth = (L: Locale, cents: number): string =>
  L.m.table.perMonth(L.f.eur(cents));

/**
 * Screen-reader text that follows the year value of such a cell, so the cell reads
 * "5,04 € pro Jahr, entspricht 0,42 € pro Monat".
 */
export const perMonthSpoken = (L: Locale, cents: number): string =>
  L.m.table.perMonthSpoken(L.f.eur(cents));

/** Text of a cell value (bool: ja / kostenpflichtig / nein). */
export function formatValue(L: Locale, col: ColumnDef, v: SortKey): string {
  if (v === null) return L.m.common.missing;
  switch (col.kind) {
    case 'money':
    case 'tco':
      return typeof v === 'number' ? L.f.eur(v) : L.m.common.missing;
    case 'enum':
      return L.m.enums[String(v)] ?? String(v);
    case 'date':
      return L.f.date(String(v));
    case 'bool':
      // "paid": offered only for a fee (Archiv-Issue 124); plain text, label as whois_privacy paid
      if (v === 'paid') return L.m.enums.paid ?? 'paid';
      return v ? L.m.common.yes : L.m.common.no;
    case 'int': {
      const zero = columnText(L, col).zero;
      return v === 0 && zero ? zero : String(v);
    }
    default:
      return String(v);
  }
}

export function sortLabel(L: Locale, state: ViewState): string {
  const col = COLUMN_BY_ID.get(state.sort) ?? COLUMNS[0];
  const label = col ? columnText(L, col).label : state.sort;
  return `${label} ${state.dir === 'asc' ? L.m.table.asc : L.m.table.desc}`;
}

/**
 * Prefilled "Fehler melden" link for one row (e-mail or GitHub issue form, see src/lib/report.mjs):
 * provider id and TLD only. The field and value are chosen by the visitor; nothing about the
 * visitor is sent.
 */
export function reportUrl(
  row: Pick<PayloadRow, 'providerId' | 'tld'>,
  providerName: string,
  via: ReportVia = REPORT_VIA,
): string {
  return correctionUrl({ row, providerName }, via);
}

/**
 * Editorial note of the provider's terms for one contract column of a row (provider.terms.notes),
 * or null. Same rule as the table footnote: only where the offer does not set the field itself.
 */
export function contractNote(
  row: PayloadRow,
  meta: ProviderMeta | undefined,
  col: string,
): string | null {
  if (row.detail.contractSource[col] === 'offer') return null;
  return meta?.terms.notes?.[col] ?? null;
}
