// Portfolio calculator (Archiv-Issue 74), built from the design system (Controls segments and fields,
// PriceTable frame and cells, Badge/Legend, footnote markers and tc-notes). The reader enters
// TLD × count, the period and the mode; computeBasket from @tldcost/core computes everything in
// the browser from the embedded payload. State lives in the URL only (basket-state.ts). The
// language comes from the island entry (BasketCalculatorDe.tsx / BasketCalculatorEn.tsx).
// Neutrality as in the table: order by total (core), no recommendation, the operator row differs
// only by its badge; a missing TLD or transfer price is shown, never skipped. The result table
// sorts and filters like the price table (Archiv-Issue 123, basket-view.ts): FilterRow controls, chips, the
// phone panel, tc-best over the shown rows; rows without a total always come last.
import {
  computeBasket,
  offerMarket,
  type BasketLine,
  type BasketProvider,
  type BasketPromoPool,
  type BasketResult,
  type FxRate,
  type Offer,
  type PriceMode,
} from '@tldcost/core';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { LocaleContext } from '../i18n/context';
import type { Locale } from '../i18n/de';
import type { BasketPayload } from '../lib/basket-payload';
import type { NoteText } from '../lib/payload';
import {
  BASKET_YEARS,
  MAX_BASKET_ROWS,
  MAX_COUNT,
  defaultBasketState,
  fitView,
  parseBasketState,
  parseCount,
  serializeBasketState,
  type BasketState,
} from '../lib/basket-state';
import {
  assumptions,
  basketBestCells,
  basketColumns,
  basketRows,
  tldColumn,
  visibleBasketRows,
  type Assumption,
} from '../lib/basket-view';
import type { ColumnDef } from '../lib/columns';
import { filterValueText, type Filter } from '../lib/filters';
import { Badge, Legend, type BadgeKind } from './Badge';
import CountryFlag from './CountryFlag';
import FilterControl, { pickOptions } from './FilterControl';
import NoteBody from './NoteBody';
import '../styles/table.css';
import '../styles/basket.css';

const EXAMPLE = ['de', 'com', 'eu'];
const EXAMPLE_COUNTS = [10, 3, 5];

const NOTE_VAT_NOT_STATED = 'vat-not-stated';
const NOTE_MONTHLY = 'unit-month';
const NOTE_TRANSFER = 'transfer-assumption';
const NOTE_MIX = 'mix';
const NOTE_REGULAR_FROM_RENEWAL = 'regular-from-renewal';

/** Fixed footnote texts in the page language. */
export function noteText(L: Locale, id: string): string | undefined {
  const n = L.m.basket.notes;
  return {
    [NOTE_VAT_NOT_STATED]: n.vatNotStated,
    [NOTE_MONTHLY]: n.monthly,
    [NOTE_TRANSFER]: n.transfer,
    [NOTE_REGULAR_FROM_RENEWAL]: n.regularFromRenewal,
    [NOTE_MIX]: n.mix,
  }[id];
}

const fxNoteId = (fx: FxRate) => `fx-${fx.currency}-${fx.date}`;
const fxNoteText = (L: Locale, fx: FxRate) =>
  L.m.basket.notes.fx(fx.currency, L.f.date(fx.date), L.f.decimal(fx.perEur));
const promoNoteId = (provider: string, tld: string) =>
  `promo-${provider}-${tld}`.replace(/[^a-z0-9-]/gi, '-');
/**
 * Promo in year 1: the provider's condition verbatim, a stated per-TLD limit, and for
 * `unlimited` (as decided by core, line.promoScope) the provider's quote.
 */
export function promoNoteText(L: Locale, offer: Offer, unlimited = false): NoteText {
  const c = offer.promo?.conditions?.trim();
  const until = offer.promo?.valid_until;
  const max = offer.promo?.max_per_customer;
  const quote = offer.promo?.max_per_customer_source?.quote?.trim() || null;
  return L.m.basket.notes.promo({
    tld: offer.tld,
    conditions: c || null,
    until: until ? L.f.date(until) : null,
    max: typeof max === 'number' && offer.promo?.limit_scope === 'per_tld' ? max : null,
    unlimited: unlimited ? { quote: quote && quote !== c ? quote : null } : null,
  });
}

const poolNoteId = (provider: string) => `promo-pool-${provider}`.replace(/[^a-z0-9-]/gi, '-');
/**
 * The provider's promo budget is shared across the basket TLDs and smaller than the domains:
 * where it is counted. Budget 1: the owner-approved wording, verbatim.
 */
export function poolNoteText(L: Locale, pool: BasketPromoPool): string {
  if (pool.budget === 1) {
    return L.m.basket.notes.poolOne(pool.credited.map((c) => `.${c.tld}`).join(', '));
  }
  const counted = pool.credited.map((c) => `.${c.tld} (${c.domains})`).join(', ');
  return L.m.basket.notes.pool(pool.budget, counted);
}
const termNoteId = (provider: string, tld: string) =>
  `transfer-term-${provider}-${tld}`.replace(/[^a-z0-9-]/gi, '-');
/** The provider states that the transfer includes a term: quote and source as recorded. */
function termNoteText(L: Locale, offer: Offer): NoteText {
  const src = offer.price.transfer_includes_term_source;
  return L.m.basket.notes.term(offer.tld, src?.quote || null, src?.url || null);
}
/** Another market's prices (Offer.foreign_market): converted, in gross mode with VAT added. */
interface MarketNote {
  fx: FxRate;
  market: string;
  rate: number;
}
export const marketNoteId = (n: MarketNote, vat: PriceMode) =>
  vat === 'gross'
    ? `market-${n.market}-${n.fx.currency}-${n.fx.date}-${n.rate}`
    : `market-net-${n.market}-${n.fx.currency}-${n.fx.date}`;
/** Gross: the owner's wording (2026-11-19); net: without the VAT part. */
export function marketNoteText(L: Locale, n: MarketNote, vat: PriceMode): string {
  const date = L.f.date(n.fx.date);
  return vat === 'gross'
    ? L.m.basket.notes.foreignMarket(n.market, date, L.f.decimal(n.rate / 100))
    : L.m.basket.notes.foreignMarketNet(n.market, date);
}
const netNoteId = (rate: number) => `vat-net-${rate}`;
const netNoteText = (L: Locale, rate: number) => L.m.basket.notes.vatNet(L.f.decimal(rate / 100));
const grossNoteId = (rate: number) => `vat-gross-${rate}`;
const grossNoteText = (L: Locale, rate: number) =>
  L.m.basket.notes.vatGross(L.f.decimal(rate / 100));

/** Footnote markers (markup contract of footnote-tips.js in the foundation). */
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
      {[...new Set(ids)]
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

/** Second line of a subtotal cell with several domains: price per domain, promo split. */
export function perDomain(L: Locale, l: BasketLine): string {
  const b = L.m.basket;
  const p = l.promoDomains;
  if (p === null || p === l.count) {
    return `${b.perDomain(L.f.eur(l.each as number))}${p === null ? '' : b.promoTag}`;
  }
  if (p === 0) return b.perDomain(L.f.eur(l.eachRegular as number));
  return b.promoSplit(p, L.f.eur(l.each as number), l.count - p, L.f.eur(l.eachRegular as number));
}

/** Text of a line without a subtotal (shown instead of the amount, never skipped). */
export function lineGap(
  L: Locale,
  line: Pick<BasketLine, 'status' | 'missing'>,
): {
  text: string;
  spoken: string;
} {
  const g = L.m.basket.gap;
  if (line.status === 'not_offered') return g.notOffered;
  if (line.missing.includes('price.transfer_in')) return g.noTransfer;
  // the provider says the transfer includes a term, but renewals run for more than 1 year
  if (line.missing.includes('transfer_term_unclear')) return g.termUnclear;
  return { text: L.m.common.missing, spoken: g.missing(line.missing.join(', ')) };
}

export interface BasketCalculatorProps {
  /** JSON of BasketPayload (string, so the island prop stays one compact attribute). */
  data: string;
  /** Language, fixed by the island entry. */
  L: Locale;
}

export default function BasketCalculator(props: BasketCalculatorProps) {
  return (
    <LocaleContext.Provider value={props.L}>
      <Calculator {...props} />
    </LocaleContext.Provider>
  );
}

function Calculator({ data, L }: BasketCalculatorProps) {
  const b = L.m.basket;
  const payload = useMemo(() => JSON.parse(data) as BasketPayload, [data]);
  const [state, setState] = useState<BasketState>(defaultBasketState);
  const [hydrated, setHydrated] = useState(false);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const read = () => setState(parseBasketState(window.location.search, payload.tlds));
    read();
    setHydrated(true);
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [payload]);

  const update = (patch: Partial<BasketState>) => {
    // a sort or filter on a TLD that leaves the basket is dropped
    const next = fitView({ ...state, ...patch });
    setState(next);
    const { pathname, hash, search } = window.location;
    // ?theme= (public/theme-init.js) is kept only with a valid value, as in the table
    const keep = new URLSearchParams(search);
    const theme = keep.get('theme');
    if (theme !== null && theme !== 'light' && theme !== 'dark') keep.delete('theme');
    window.history.replaceState(
      null,
      '',
      pathname + serializeBasketState(next, keep.toString()) + hash,
    );
  };

  const offerOf = useMemo(() => {
    const m = new Map<string, Offer>();
    for (const o of payload.offers) m.set(`${o.provider}/${o.tld}`, o);
    return m;
  }, [payload]);

  const result: BasketResult = useMemo(
    () =>
      computeBasket(payload.offers, state.basket, state.years, state.mode, {
        price: state.vat,
        providers: payload.providers,
        fx: payload.fx,
      }),
    [payload, state],
  );

  const columns = useMemo(() => basketColumns(state.basket.map((x) => x.tld)), [state.basket]);
  const allRows = useMemo(
    () =>
      basketRows(result, (id) => {
        const m = payload.providers[id];
        return m ? { name: m.name, country: m.country } : undefined;
      }),
    [result, payload],
  );
  const rows = useMemo(() => visibleBasketRows(allRows, state), [allRows, state]);
  const byProvider = new Map(result.providers.map((p) => [p.provider, p]));
  const shownProviders = rows.map((r) => byProvider.get(r.provider) as BasketProvider);
  const filtered = state.q !== '' || Object.keys(state.f).length > 0;
  // tc-best (owner decision B): over the shown rows; without a filter these are all rows
  const best = useMemo(() => basketBestCells(rows, columns), [rows, columns]);
  const bestScope = filtered ? 'filtered' : 'all';

  // footnotes in reading order: header, shown provider rows, cheapest mix
  const texts = new Map<string, NoteText>();
  const rowNotes = new Map<string, string[]>();
  /** Notes of one subtotal cell, by `<provider>/<tld>`. */
  const cellNotes = new Map<string, string[]>();
  if (state.basket.length && state.mode === 'transfer')
    texts.set(NOTE_TRANSFER, noteText(L, NOTE_TRANSFER) as string);
  for (const p of shownProviders) {
    const ids: string[] = [];
    if (p.vatNotStated) ids.push(NOTE_VAT_NOT_STATED);
    for (const line of p.lines) {
      const offer = offerOf.get(`${p.provider}/${line.tld}`);
      if (!offer) continue;
      const rate = offer.vat_rate ?? payload.providers[p.provider]?.vat_rate ?? null;
      // another market's prices (owner decision 2026-11-19): a note per VAT mode on the line's
      // subtotal (conversion, in gross mode also the added VAT), in place of the FX and net notes
      const market = offerMarket(offer);
      const marketNote = line.fx && market && rate !== null ? { fx: line.fx, market, rate } : null;
      if (!marketNote && line.fx) {
        ids.push(fxNoteId(line.fx));
        texts.set(fxNoteId(line.fx), fxNoteText(L, line.fx));
      }
      if (offer.vat_included === false && state.vat === 'gross' && rate !== null && !marketNote) {
        ids.push(netNoteId(rate));
        texts.set(netNoteId(rate), netNoteText(L, rate));
      }
      if (offer.vat_included === true && state.vat === 'net' && rate !== null) {
        ids.push(grossNoteId(rate));
        texts.set(grossNoteId(rate), grossNoteText(L, rate));
      }
      if (offer.price.unit === 'month') ids.push(NOTE_MONTHLY);
      const cell: string[] = [];
      if (marketNote) {
        const id = marketNoteId(marketNote, state.vat);
        texts.set(id, marketNoteText(L, marketNote, state.vat));
        (line.subtotal !== null ? cell : ids).push(id);
      }
      if (line.promoDomains !== null && line.subtotal !== null) {
        const id = promoNoteId(p.provider, line.tld);
        texts.set(id, promoNoteText(L, offer, line.promoScope === 'unlimited'));
        cell.push(id);
      }
      if (line.regularFromRenewal && line.subtotal !== null) {
        texts.set(NOTE_REGULAR_FROM_RENEWAL, noteText(L, NOTE_REGULAR_FROM_RENEWAL) as string);
        cell.push(NOTE_REGULAR_FROM_RENEWAL);
      }
      if (line.transferIncludesTerm === true && line.subtotal !== null) {
        const id = termNoteId(p.provider, line.tld);
        texts.set(id, termNoteText(L, offer));
        cell.push(id);
      }
      if (cell.length) cellNotes.set(`${p.provider}/${line.tld}`, cell);
    }
    for (const id of ids) if (!texts.has(id)) texts.set(id, noteText(L, id) as string);
    if (p.promoPool?.limited && p.total !== null) {
      ids.push(poolNoteId(p.provider));
      texts.set(poolNoteId(p.provider), poolNoteText(L, p.promoPool));
    }
    rowNotes.set(p.provider, [...new Set(ids)]);
  }
  if (state.basket.length) texts.set(NOTE_MIX, noteText(L, NOTE_MIX) as string);
  // the mix row is not filtered: its notes stay even when the provider row is hidden
  for (const id of [
    ...(result.mix.vatNotStated ? [NOTE_VAT_NOT_STATED] : []),
    ...(result.mix.lines.some((l) => l.regularFromRenewal) ? [NOTE_REGULAR_FROM_RENEWAL] : []),
  ]) {
    if (!texts.has(id)) texts.set(id, noteText(L, id) as string);
  }
  const numbers = new Map([...texts.keys()].map((id, i) => [id, i + 1]));

  const badges = new Set<BadgeKind>();
  if (shownProviders.some((p) => payload.providers[p.provider]?.operator)) badges.add('operator');

  const unused = payload.tlds.filter((t) => !state.basket.some((b) => b.tld === t));
  const domains = state.basket.reduce((n, b) => n + b.count, 0);
  const example = (() => {
    const tlds = EXAMPLE.filter((t) => payload.tlds.includes(t));
    for (const t of payload.tlds) if (tlds.length < 3 && !tlds.includes(t)) tlds.push(t);
    return tlds.map((t, i) => ({ tld: t, count: EXAMPLE_COUNTS[i] ?? 1 }));
  })();
  const name = (id: string) => payload.providers[id]?.name ?? id;

  // ---- sort and filter of the result table (Archiv-Issue 123) ----
  const countOf = new Map(state.basket.map((x) => [tldColumn(x.tld), x]));
  /** Header and filter label of a column. */
  const colLabel = (c: ColumnDef): string => {
    const item = countOf.get(c.id);
    if (item) return `.${item.tld} × ${item.count}`;
    if (c.id === 'total') return b.total(state.years);
    return (
      { provider: b.provider, country: b.country, complete: b.complete, assumption: b.assumption }[
        c.id
      ] ?? c.id
    );
  };
  const sortText = b.sortText(
    countOf.get(state.sort)
      ? `.${countOf.get(state.sort)?.tld}`
      : (b.sortName[state.sort] ?? state.sort),
    state.dir,
  );
  const countryNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of Object.values(payload.providers)) out[m.country] = m.countryName;
    return out;
  }, [payload]);
  const optionsFor = (c: ColumnDef): string[] => {
    if (c.kind === 'bool') return ['ja', 'nein'];
    if (c.kind !== 'enum') return [];
    return pickOptions(
      c,
      allRows.map((r) => r.values[c.id] ?? null),
      () => 0,
    );
  };
  const setFilter = (id: string, filter: Filter | null) => {
    const f = { ...state.f };
    if (filter) f[id] = filter;
    else delete f[id];
    update({ f });
  };
  const setQuery = (q: string) => update({ q });
  const filterProps = (c: ColumnDef, idPrefix: string) => ({
    col: c,
    label: colLabel(c),
    filter: state.f[c.id],
    query: state.q,
    options: optionsFor(c),
    countryNames,
    set: setFilter,
    setQuery,
    idPrefix,
  });
  const active: Array<{ id: string; label: string; value: string }> = [
    ...(state.q
      ? [{ id: 'provider', label: b.provider, value: L.m.filters.contains(state.q) }]
      : []),
    ...columns
      .filter((c) => state.f[c.id])
      .map((c) => ({
        id: c.id,
        label: colLabel(c),
        value: filterValueText(L, c, state.f[c.id] as Filter, countryNames),
      })),
  ];
  const clearFilter = (id: string) => (id === 'provider' ? setQuery('') : setFilter(id, null));
  const onSort = (id: string) =>
    update(
      state.sort === id ? { dir: state.dir === 'asc' ? 'desc' : 'asc' } : { sort: id, dir: 'asc' },
    );
  /** Footnote ids of the provider's assumptions (the "Annahme" column). */
  const assumptionNotes = (p: BasketProvider): string[] =>
    assumptions(p).map((a: Assumption) =>
      a === 'vat'
        ? NOTE_VAT_NOT_STATED
        : a === 'renewal'
          ? NOTE_REGULAR_FROM_RENEWAL
          : poolNoteId(p.provider),
    );
  /** tc-best: class and screen-reader text of a cell. */
  const bestOf = (provider: string, id: string): { cls: string; sr: ComponentChildren } =>
    best.has(`${provider}|${id}`)
      ? {
          cls: ' tc-best',
          sr: <span class="sr-only tc-best-sr">{L.m.table.bestSpoken[bestScope]}</span>,
        }
      : { cls: '', sr: null };

  const setCount = (tld: string, raw: string) => {
    const count = parseCount(raw);
    setInvalid((prev) => {
      const next = new Set(prev);
      if (count === null) next.add(tld);
      else next.delete(tld);
      return next;
    });
    if (count !== null) {
      update({ basket: state.basket.map((b) => (b.tld === tld ? { tld, count } : b)) });
    }
  };

  return (
    <div class="basket" data-hydrated={hydrated ? '' : undefined}>
      <form class="tc-controls" onSubmit={(e) => e.preventDefault()}>
        <fieldset class="tc-field">
          <legend>{b.domains}</legend>
          <div class="tc-segment">
            {(
              [
                ['new', b.modes.new],
                ['transfer', b.modes.transfer],
              ] as const
            ).map(([v, label]) => (
              <label key={v}>
                <input
                  type="radio"
                  name="mode"
                  value={v}
                  checked={state.mode === v}
                  onChange={() => update({ mode: v })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset class="tc-field">
          <legend>{b.period}</legend>
          <div class="tc-segment">
            {BASKET_YEARS.map((y) => (
              <label key={y}>
                <input
                  type="radio"
                  name="years"
                  value={y}
                  checked={state.years === y}
                  onChange={() => update({ years: y })}
                />
                <span>{b.years(y)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset class="tc-field">
          <legend>{b.prices}</legend>
          <div class="tc-segment">
            {(['gross', 'net'] as const).map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="vat"
                  value={v}
                  checked={state.vat === v}
                  onChange={() => update({ vat: v })}
                />
                <span>{v === 'gross' ? L.m.common.gross : L.m.common.net}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>

      <fieldset class="tc-basket">
        <legend>{b.portfolio}</legend>
        {state.basket.length > 0 && (
          <ul class="tc-basket-rows">
            {state.basket.map((b) => (
              <li key={b.tld}>
                <label>
                  <span class="tc-basket-tld">.{b.tld}</span>
                  <span class="sr-only">{L.m.basket.countOf(b.tld)}</span>
                  <input
                    class="tc-search tc-count"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_COUNT}
                    step={1}
                    name={`count-${b.tld}`}
                    value={b.count}
                    aria-invalid={invalid.has(b.tld) ? 'true' : undefined}
                    onInput={(e) => setCount(b.tld, (e.currentTarget as HTMLInputElement).value)}
                  />
                </label>
                <button
                  type="button"
                  class="tc-basket-remove"
                  aria-label={L.m.basket.remove(b.tld)}
                  onClick={() => update({ basket: state.basket.filter((x) => x.tld !== b.tld) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {unused.length > 0 && state.basket.length < MAX_BASKET_ROWS && (
          <label class="tc-field">
            <span>{b.add}</span>
            <select
              class="tc-select"
              id="basket-add"
              value=""
              onChange={(e) => {
                const tld = (e.currentTarget as HTMLSelectElement).value;
                if (tld) update({ basket: [...state.basket, { tld, count: 1 }] });
              }}
            >
              <option value="">{b.choose}</option>
              {unused.map((t) => (
                <option key={t} value={t}>
                  .{t}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      {state.basket.length === 0 ? (
        <p class="tc-empty tc-basket-empty">
          {b.emptyBefore}{' '}
          <a href={`?${`basket=${example.map((e) => `${e.tld}:${e.count}`).join(',')}`}`}>
            {example.map((e) => `${e.count}× .${e.tld}`).join(', ')}
          </a>
          {b.emptyAfter}
        </p>
      ) : (
        <>
          <p class="tc-status status" role="status" aria-live="polite">
            {b.status({
              shown: rows.length,
              providers: result.providers.length,
              filtered,
              filters: active.map((a) => a.label),
              domains,
              years: state.years,
              mode: state.mode,
              vat: state.vat,
              sort: sortText,
              best: best.size > 0 ? bestScope : null,
            })}
          </p>

          {active.length > 0 && (
            <div class="tc-fstatus" aria-label={L.m.table.activeFilters}>
              {active.map((a) => (
                <span class="tc-fchip" key={a.id}>
                  {a.label}: {a.value}
                  <button
                    type="button"
                    aria-label={L.m.table.removeFilter(a.label)}
                    onClick={() => clearFilter(a.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button type="button" class="tc-freset" onClick={() => update({ q: '', f: {} })}>
                {L.m.table.resetFilters}
              </button>
            </div>
          )}

          <details class="tc-fpanel">
            <summary>{L.m.table.filterPanel(active.length)}</summary>
            <form class="tc-fpanel-form" onSubmit={(e) => e.preventDefault()}>
              {columns.map((c) => (
                <div class="tc-field" key={c.id}>
                  <span>{colLabel(c)}</span>
                  <FilterControl {...filterProps(c, 'fp-')} />
                </div>
              ))}
            </form>
          </details>

          <div class="tc-table-frame" tabIndex={0} role="region" aria-label={b.region}>
            <table class="tc-table tc-basket-table">
              <caption class="sr-only">{b.caption(state.years, sortText)}</caption>
              <thead>
                <tr>
                  {columns.map((c) => {
                    const sorted = state.sort === c.id;
                    const head = (
                      <span>
                        {colLabel(c)}
                        {c.id === 'total' && (
                          <span class="tc-unit">
                            {' '}
                            {state.vat === 'gross' ? L.m.common.gross : L.m.common.net}
                          </span>
                        )}
                      </span>
                    );
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        data-col={c.id}
                        class={
                          c.id === 'provider'
                            ? 'tc-provider'
                            : c.kind === 'money'
                              ? 'tc-num'
                              : c.kind === 'bool'
                                ? 'tc-bool'
                                : undefined
                        }
                        aria-sort={
                          sorted ? (state.dir === 'asc' ? 'ascending' : 'descending') : undefined
                        }
                      >
                        {c.sortable === false ? (
                          <span class="tc-nosort">{head}</span>
                        ) : (
                          <button type="button" onClick={() => onSort(c.id)}>
                            {head}
                            <span class="tc-sort" aria-hidden="true">
                              {sorted ? (state.dir === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </button>
                        )}
                        {c.id === 'total' && state.mode === 'transfer' && (
                          <Marks L={L} ids={[NOTE_TRANSFER]} numbers={numbers} />
                        )}
                        <div class="tc-filter">
                          <FilterControl {...filterProps(c, 'fh-')} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shownProviders.map((p) => {
                  const meta = payload.providers[p.provider];
                  const total = bestOf(p.provider, 'total');
                  const notes = assumptionNotes(p);
                  return (
                    <tr key={p.provider} data-provider-id={p.provider}>
                      <th scope="row" class="tc-provider">
                        {meta && <CountryFlag code={meta.country} name={meta.countryName} />}
                        {name(p.provider)}
                        <Marks L={L} ids={rowNotes.get(p.provider) ?? []} numbers={numbers} />
                        {meta?.operator && <Badge kind="operator" />}
                      </th>
                      <td data-col="country" class={meta ? undefined : 'tc-missing'}>
                        {meta ? (
                          <CountryFlag code={meta.country} name={meta.countryName} />
                        ) : (
                          L.m.common.missing
                        )}
                      </td>
                      <td
                        class={`tc-num${p.total === null ? ' tc-missing' : ''}${total.cls}`}
                        data-col="total"
                      >
                        {p.total === null ? (
                          <>
                            {b.incomplete}
                            <span class="sr-only">{b.incompleteSpoken}</span>
                          </>
                        ) : (
                          <>
                            {L.f.eur(p.total)}
                            {total.sr}
                          </>
                        )}
                      </td>
                      {p.lines.map((l) => {
                        const gap = l.subtotal === null ? lineGap(L, l) : null;
                        const hi = bestOf(p.provider, tldColumn(l.tld));
                        return (
                          <td
                            key={l.tld}
                            class={`tc-num${gap ? ' tc-missing' : ''}${hi.cls}`}
                            data-col={tldColumn(l.tld)}
                          >
                            {gap ? (
                              <>
                                {gap.text}
                                <span class="sr-only"> ({gap.spoken})</span>
                              </>
                            ) : (
                              <>
                                {L.f.eur(l.subtotal as number)}
                                {hi.sr}
                                <Marks
                                  L={L}
                                  ids={cellNotes.get(`${p.provider}/${l.tld}`) ?? []}
                                  numbers={numbers}
                                />
                                {l.count > 1 && <span class="tc-avg">{perDomain(L, l)}</span>}
                              </>
                            )}
                          </td>
                        );
                      })}
                      <td
                        data-col="complete"
                        class={`tc-bool ${p.total !== null ? 'tc-yes' : 'tc-no'}`}
                      >
                        {p.total !== null ? L.m.common.yes : L.m.common.no}
                      </td>
                      <td
                        data-col="assumption"
                        class={`tc-bool ${notes.length ? 'tc-yes' : 'tc-no'}`}
                      >
                        {notes.length ? L.m.common.yes : L.m.common.no}
                        <Marks L={L} ids={notes} numbers={numbers} />
                      </td>
                    </tr>
                  );
                })}
                {result.providers.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} class="tc-empty">
                      {b.noPrices}
                    </td>
                  </tr>
                )}
                {result.providers.length > 0 && rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} class="tc-empty">
                      {L.m.table.noMatch}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr class="tc-mix" data-row="mix">
                  <th scope="row" class="tc-provider">
                    {b.mix}
                    <Marks
                      L={L}
                      ids={result.mix.vatNotStated ? [NOTE_MIX, NOTE_VAT_NOT_STATED] : [NOTE_MIX]}
                      numbers={numbers}
                    />
                  </th>
                  <td data-col="country" />
                  <td
                    class={`tc-num${result.mix.total === null ? ' tc-missing' : ''}`}
                    data-col="total"
                  >
                    {result.mix.total === null ? L.m.common.missing : L.f.eur(result.mix.total)}
                  </td>
                  {result.mix.lines.map((l) => (
                    <td
                      key={l.tld}
                      class={`tc-num${l.subtotal === null ? ' tc-missing' : ''}`}
                      data-col={tldColumn(l.tld)}
                    >
                      {l.subtotal === null ? (
                        <>
                          {b.mixMissing}
                          <span class="sr-only">{b.mixMissingSpoken}</span>
                        </>
                      ) : (
                        <>
                          {L.f.eur(l.subtotal)}
                          {l.regularFromRenewal && (
                            <Marks L={L} ids={[NOTE_REGULAR_FROM_RENEWAL]} numbers={numbers} />
                          )}
                          <span class="tc-avg">{l.providers.map(name).join(', ')}</span>
                        </>
                      )}
                    </td>
                  ))}
                  <td data-col="complete" />
                  <td data-col="assumption" />
                </tr>
              </tfoot>
            </table>
          </div>
          <Legend kinds={badges} best={best.size > 0 ? bestScope : null} bestTexts={b.bestLegend} />
        </>
      )}

      {texts.size > 0 && state.basket.length > 0 && (
        <ol class="tc-notes">
          {[...texts].map(([id, text]) => (
            <li key={id} id={`fn-${id}`}>
              <NoteBody text={text} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
