// The price table island: controls + price table, built from the design system's table components
// (Controls, PriceTable, Badge, Legend, RowDetail, CountryFlag; classes tc-*). Server-rendered
// with the default view, hydrated with client:load; afterwards the view follows the query string
// (url-state.ts). No cookies, no storage. The language comes from the island entry
// (PriceTableDe.tsx / PriceTableEn.tsx) as a Locale, provided to every component below.
import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
} from '@tanstack/preact-table';
import { LocaleContext } from '../i18n/context';
import type { Locale } from '../i18n/de';
import {
  COLUMN_BY_ID,
  COLUMN_IDS,
  COLUMNS,
  DEFAULT_COLUMNS,
  ENUM_RANK,
  MOBILE_COLUMNS,
  type ColumnDef,
} from '../lib/columns';
import { filterValueText, keepVisible, type Filter } from '../lib/filters';
import type { PayloadRow, SitePayload } from '../lib/payload';
import type { SortKey } from '../lib/sort';
import {
  canonicalCols,
  defaultState,
  parse,
  serialize,
  type UrlContext,
  type ViewState,
} from '../lib/url-state';
import '../styles/table.css';
import { Badge, Legend, type BadgeKind } from './Badge';
import Controls from './Controls';
import CountryFlag from './CountryFlag';
import FilterControl, { pickOptions } from './FilterControl';
import NoteBody from './NoteBody';
import RowDetail from './RowDetail';
import {
  bestForView,
  cellNotes,
  columnText,
  footnotes,
  formatPerMonth,
  formatValue,
  orderedRows,
  perMonthSpoken,
  rowCount,
  sortLabel,
  visibleColumns,
  type ViewRow,
} from '../lib/view';

const features = tableFeatures({ columnVisibilityFeature });
const helper = createColumnHelper<typeof features, ViewRow>();
const columns = helper.columns(
  COLUMNS.map((c) =>
    helper.accessor((r: ViewRow): SortKey => r.values[c.id] ?? null, {
      id: c.id,
      header: c.id, // the header cells are rendered below, with the label of the page language
    }),
  ),
);
const MOBILE_QUERY = '(max-width: 639.98px)';
/** Screen-reader text of a tc-best cell. Neutral: a fact about the column, not a verdict. */

/** Footnote markers of one cell (markup contract of footnote-tips.js in the foundation). */
function Marks({
  L,
  ids,
  numbers,
}: {
  L: Locale;
  ids: readonly string[];
  numbers: Map<string, number>;
}) {
  return (
    <>
      {ids
        .map((id) => [id, numbers.get(id)] as const)
        .filter((e): e is readonly [string, number] => e[1] !== undefined)
        .sort((a, b) => a[1] - b[1])
        .map(([id, n]) => (
          <a
            key={id}
            class="tc-fn"
            href={`#fn-${id}`}
            aria-label={L.m.common.footnote(n)}
            aria-describedby={`fn-${id}`}
          >
            {n}
          </a>
        ))}
    </>
  );
}

/** Element id of a row's detail region (row keys contain "/" and dots). */
const detailId = (row: PayloadRow) => `detail-${row.key.replace(/[^a-z0-9-]/gi, '-')}`;

/** Cell classes of the design system per column kind. */
function cellClass(col: ColumnDef, v: SortKey, best: boolean): string {
  const c = [`k-${col.kind}`];
  if (col.kind === 'money' || col.kind === 'tco' || col.kind === 'int') c.push('tc-num');
  if (col.kind === 'bool') {
    c.push(
      'tc-bool',
      v === null ? 'tc-missing' : v === 'paid' ? 'tc-paid' : v ? 'tc-yes' : 'tc-no',
    );
  } else if (v === null) c.push('tc-missing');
  if (best) c.push('tc-best');
  return c.join(' ');
}

/**
 * Cell content. `after` (tc-best text, footnote markers) follows the value directly, before any
 * second line (Ø, monthly price, stale note), so markers sit right after the number.
 */
function Cell({
  L,
  col,
  view,
  after,
  countryNames,
}: {
  L: Locale;
  col: ColumnDef;
  view: ViewRow;
  after: ComponentChildren;
  countryNames: Readonly<Record<string, string>>;
}) {
  const v = view.values[col.id] ?? null;
  if (col.id === 'country' && typeof v === 'string') {
    return (
      <>
        <CountryFlag code={v} name={countryNames[v] ?? v} />
        {after}
      </>
    );
  }
  if (col.kind === 'bool' || v === null) {
    return (
      <>
        {col.kind === 'bool' ? formatValue(L, col, v) : L.m.common.missing}
        {after}
      </>
    );
  }
  if (col.kind === 'tco' && typeof v === 'number' && col.years) {
    const avg = view.values[`avg_${col.years}y`];
    return (
      <>
        {L.f.eur(v)}
        {after}
        {typeof avg === 'number' && <span class="tc-avg">{L.m.table.avg(L.f.eur(avg))}</span>}
      </>
    );
  }
  const month = monthOf(col, view);
  const promoExpired = col.id === 'year1' && view.row.detail.promo?.expired === true;
  return (
    <>
      {typeof v === 'number' && col.kind === 'money' ? L.f.eur(v) : formatValue(L, col, v)}
      {month !== null && <span class="sr-only">{perMonthSpoken(L, month)}</span>}
      {after}
      {month !== null && (
        <span class="tc-avg" aria-hidden="true">
          {formatPerMonth(L, month)}
        </span>
      )}
      {promoExpired && <span class="tc-stale">{L.m.table.promoExpired}</span>}
      {col.id === 'fetched_at' && view.row.detail.dataStale && (
        <span class="tc-stale">{L.m.common.stale}</span>
      )}
    </>
  );
}

/** The provider's monthly price for a money cell of a monthly offer, else null. */
function monthOf(col: ColumnDef, view: ViewRow): number | null {
  if (col.kind !== 'money' || typeof view.values[col.id] !== 'number') return null;
  const m = view.values[`${col.id}_month`];
  return typeof m === 'number' ? m : null;
}

/** Unit line of a column header: "€ brutto" / "€ netto" for prices, the unit for counts. */
function headerUnit(L: Locale, col: ColumnDef, vat: 'gross' | 'net'): string | undefined {
  if (col.kind === 'money' || col.kind === 'tco')
    return vat === 'gross' ? L.m.table.unitGross : L.m.table.unitNet;
  return columnText(L, col).unit;
}

/** The island: the language is fixed by the entry file, everything below reads it from context. */
export default function PriceTable({ data, L }: { data: string; L: Locale }) {
  return (
    <LocaleContext.Provider value={L}>
      <Table data={data} L={L} />
    </LocaleContext.Provider>
  );
}

function Table({ data, L }: { data: string; L: Locale }) {
  const t = L.m.table;
  const label = (c: ColumnDef) => columnText(L, c).label;
  const payload = useMemo(() => JSON.parse(data) as SitePayload, [data]);
  const ctx = useMemo<UrlContext>(() => ({ tlds: payload.tlds }), [payload]);
  // First render = server render (default view); the URL is applied after hydration.
  const [state, setState] = useState<ViewState>(() => defaultState(ctx));
  const [mobile, setMobile] = useState(false);
  // true once the URL state is applied (tests wait for data-hydrated)
  const [hydrated, setHydrated] = useState(false);
  // expanded rows (row keys); view-only, not part of the URL
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleOpen = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    const read = () => setState(parse(window.location.search, ctx));
    read();
    setHydrated(true);
    window.addEventListener('popstate', read);
    const mq = window.matchMedia(MOBILE_QUERY);
    const onMq = () => setMobile(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    return () => {
      window.removeEventListener('popstate', read);
      mq.removeEventListener('change', onMq);
    };
  }, [ctx]);

  const update = (patch: Partial<ViewState>) => {
    const next = { ...state, ...patch };
    setState(next);
    const { pathname, hash, search } = window.location;
    // parameters the table does not own are kept by serialize(); ?theme= (public/theme-init.js)
    // only with a valid value, so a bad one does not stick in the URL
    const keep = new URLSearchParams(search);
    const theme = keep.get('theme');
    if (theme !== null && theme !== 'light' && theme !== 'dark') keep.delete('theme');
    window.history.replaceState(null, '', pathname + serialize(next, ctx, keep.toString()) + hash);
  };

  const rows = useMemo(() => orderedRows(payload, state), [payload, state]);
  const shown = visibleColumns(state);
  const columnVisibility = useMemo<ColumnVisibilityState>(
    () => Object.fromEntries(COLUMN_IDS.map((id) => [id, shown.includes(id)])),
    [shown],
  );
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (r: ViewRow) => r.row.key,
    state: { columnVisibility },
    onColumnVisibilityChange: () => {}, // visibility is derived from the URL state only
  });
  const notes = footnotes(rows, shown, state.vat);
  // tc-best per owner decision B: all rows of the TLD without a filter, the shown rows with one
  const { cells: best, scope: bestScope } = useMemo(
    () => bestForView(payload, state, rows),
    [payload, state, rows],
  );
  // all rows of the TLD, unfiltered: the values the pickers offer
  const allRows = useMemo(
    () => orderedRows(payload, { ...state, q: '', f: {} }),
    [payload, state.tld, state.vat],
  );
  const countryNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of Object.values(payload.providers)) out[p.country] = p.countryName;
    return out;
  }, [payload]);
  const optionsFor = (col: ColumnDef) =>
    pickOptions(
      col,
      allRows.map((v) => v.values[col.id] ?? null),
      (v) => (col.id === 'country' ? 0 : (ENUM_RANK[v] ?? 99)),
    );
  const setFilter = (id: string, filter: Filter | null) => {
    const f = { ...state.f };
    if (filter) f[id] = filter;
    else delete f[id];
    update({ f });
  };
  const setQuery = (q: string) => update({ q });
  const filterProps = (col: ColumnDef, idPrefix: string) => ({
    col,
    filter: state.f[col.id],
    query: state.q,
    options: col.kind === 'bool' || col.kind === 'enum' ? optionsFor(col) : [],
    countryNames,
    set: setFilter,
    setQuery,
    idPrefix,
  });
  const active: Array<{ id: string; label: string; value: string }> = [
    ...(state.q
      ? [
          {
            id: 'provider',
            label: L.m.columns.provider?.label ?? 'provider',
            value: L.m.filters.contains(state.q),
          },
        ]
      : []),
    ...COLUMNS.filter((c) => state.f[c.id]).map((c) => ({
      id: c.id,
      label: label(c),
      value: filterValueText(L, c, state.f[c.id] as Filter, countryNames),
    })),
  ];
  const clearFilter = (id: string) => (id === 'provider' ? setQuery('') : setFilter(id, null));
  const badgesInView = new Set<BadgeKind>();
  for (const v of rows) {
    if (v.row.badges.promo) badgesInView.add('promo');
    if (v.row.badges.verified) badgesInView.add('verified');
    if (payload.providers[v.row.providerId]?.operator) badgesInView.add('operator');
  }
  // a visible bool cell says „kostenpflichtig“ (Archiv-Issue 124): the legend explains it
  const paidInView = rows.some((v) =>
    shown.some((id) => COLUMN_BY_ID.get(id)?.paid && v.values[id] === 'paid'),
  );
  const total = rowCount(payload, state.tld);
  const newest = rows
    .map((v) => v.row.detail.fetchedAt)
    .sort()
    .at(-1);

  // Columns the chooser shows as checked: on small screens without `cols`, the mobile default.
  const chosen = state.cols ?? (mobile ? MOBILE_COLUMNS : shown);
  const toggleColumn = (id: string, on: boolean) => {
    // adding keeps every active filter, so its column joins `cols` (on phones a filter can be
    // active on a column outside the mobile default, e.g. Land); hiding clears only that filter
    const next = on ? [...chosen, id, ...Object.keys(state.f)] : chosen.filter((c) => c !== id);
    const cols = canonicalCols(next);
    // a hidden column's filter is cleared (FilterRow: never hidden, cleared instead)
    update({ cols, f: keepVisible(state.f, cols ?? DEFAULT_COLUMNS) });
  };
  const onSort = (id: string) =>
    update(
      state.sort === id ? { dir: state.dir === 'asc' ? 'desc' : 'asc' } : { sort: id, dir: 'asc' },
    );

  if (payload.rows.length === 0) {
    return <p class="tc-empty">{t.empty}</p>;
  }

  return (
    <div class="price-table" data-hydrated={hydrated ? '' : undefined}>
      <Controls
        tlds={payload.tlds}
        state={state}
        chosen={chosen}
        update={update}
        toggleColumn={toggleColumn}
      />

      <p class="tc-status status" role="status" aria-live="polite">
        {t.status({
          shown: rows.length,
          total,
          filtered: active.length > 0,
          tld: state.tld,
          filters: active.map((a) => a.label),
          sort: sortLabel(L, state),
          vat: state.vat,
          asOf: newest ? L.f.date(newest) : null,
          best: best.size > 0 ? bestScope : null,
        })}
      </p>

      {active.length > 0 && (
        <div class="tc-fstatus" aria-label={t.activeFilters}>
          {active.map((a) => (
            <span class="tc-fchip" key={a.id}>
              {a.label}: {a.value}
              <button
                type="button"
                aria-label={t.removeFilter(a.label)}
                onClick={() => clearFilter(a.id)}
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" class="tc-freset" onClick={() => update({ q: '', f: {} })}>
            {t.resetFilters}
          </button>
        </div>
      )}

      <details class="tc-fpanel">
        <summary>{t.filterPanel(active.length)}</summary>
        <form class="tc-fpanel-form" onSubmit={(e) => e.preventDefault()}>
          {COLUMNS.filter((c) => chosen.includes(c.id) || c.id in state.f).map((c) => (
            <div class="tc-field" key={c.id}>
              <span>{label(c)}</span>
              <FilterControl {...filterProps(c, 'fp-')} />
            </div>
          ))}
        </form>
      </details>

      <div class="tc-table-frame" tabIndex={0} role="region" aria-label={t.region(state.tld)}>
        <table class={`tc-table${state.cols === null ? ' cols-default' : ''}`}>
          <caption class="sr-only">{t.caption(state.tld, sortLabel(L, state))}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((h) => {
                  const col = COLUMN_BY_ID.get(h.column.id) as ColumnDef;
                  const sorted = state.sort === col.id;
                  const unit = headerUnit(L, col, state.vat);
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      data-col={col.id}
                      data-mobile={col.mobileDefault ? '1' : '0'}
                      class={[
                        `k-${col.kind}`,
                        col.id === 'provider' ? 'tc-provider' : '',
                        col.kind === 'money' || col.kind === 'tco' || col.kind === 'int'
                          ? 'tc-num'
                          : '',
                        col.kind === 'bool' ? 'tc-bool' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-sort={
                        sorted ? (state.dir === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                    >
                      {col.sortable === false ? (
                        <span class="tc-nosort">
                          {label(col)}
                          {unit && <span class="tc-unit">{unit}</span>}
                        </span>
                      ) : (
                        <button type="button" onClick={() => onSort(col.id)}>
                          <span>
                            {label(col)}
                            {unit && <span class="tc-unit">{unit}</span>}
                          </span>
                          <span class="tc-sort" aria-hidden="true">
                            {sorted ? (state.dir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      )}
                      <div class="tc-filter">
                        <FilterControl {...filterProps(col, 'fh-')} />
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={shown.length} class="tc-empty">
                  {t.noMatch}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((r) => {
              const view = r.original;
              const meta = payload.providers[view.row.providerId];
              const isOpen = open.has(view.row.key);
              const cells = r.getVisibleCells();
              return (
                <Fragment key={r.id}>
                  <tr data-provider-id={view.row.providerId} data-key={view.row.key}>
                    {cells.map((cell) => {
                      const col = COLUMN_BY_ID.get(cell.column.id) as ColumnDef;
                      const v = view.values[col.id] ?? null;
                      const isBest = best.has(`${view.row.key}|${col.id}`);
                      const attrs = {
                        'data-col': col.id,
                        'data-mobile': col.mobileDefault ? '1' : '0',
                      };
                      if (col.id !== 'provider') {
                        return (
                          <td key={cell.id} {...attrs} class={cellClass(col, v, isBest)}>
                            <Cell
                              L={L}
                              col={col}
                              view={view}
                              countryNames={countryNames}
                              after={
                                <>
                                  {isBest && (
                                    <span class="sr-only tc-best-sr">
                                      {t.bestSpoken[bestScope]}
                                    </span>
                                  )}
                                  <Marks
                                    L={L}
                                    ids={cellNotes(view.row, col.id, state.vat)}
                                    numbers={notes}
                                  />
                                </>
                              }
                            />
                          </td>
                        );
                      }
                      return (
                        <th key={cell.id} scope="row" {...attrs} class="k-text tc-provider">
                          {meta && <CountryFlag code={meta.country} name={meta.countryName} />}
                          {meta ? (
                            <a href={meta.website} rel="noopener noreferrer nofollow">
                              {meta.name}
                            </a>
                          ) : (
                            view.row.providerId
                          )}
                          <Marks L={L} ids={view.row.notes} numbers={notes} />
                          {view.row.badges.promo && <Badge kind="promo" />}
                          {view.row.badges.verified && <Badge kind="verified" />}
                          {meta?.operator && <Badge kind="operator" />}
                          {hydrated ? (
                            <button
                              type="button"
                              class="tc-detail-toggle"
                              aria-expanded={isOpen ? 'true' : 'false'}
                              aria-controls={isOpen ? detailId(view.row) : undefined}
                              onClick={() => toggleOpen(view.row.key)}
                            >
                              {t.details}
                              <span class="sr-only">
                                {t.detailsFor(meta?.name ?? view.row.providerId)}
                              </span>
                            </button>
                          ) : (
                            // same box before hydration, so the rows do not shift (CLS); invisible
                            // and inert, so there is no dead button without JavaScript
                            <span class="tc-detail-toggle tc-placeholder" aria-hidden="true">
                              {t.details}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr class="tc-detail-row" id={detailId(view.row)}>
                      <td colSpan={cells.length}>
                        <RowDetail
                          row={view.row}
                          meta={meta}
                          values={view.values}
                          vat={state.vat}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Legend kinds={badgesInView} best={best.size > 0 ? bestScope : null} paid={paidInView} />

      {notes.size > 0 && (
        <ol class="tc-notes">
          {[...notes.keys()].map((id) => (
            <li key={id} id={`fn-${id}`}>
              <NoteBody text={payload.notes[id] ?? ''} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
