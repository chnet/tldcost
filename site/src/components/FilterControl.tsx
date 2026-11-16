// FilterRow control of one column (design system FilterRow): a search field for text columns, a
// value picker for bool/enum/Land, a von/bis range for prices, sums and counts, and an age picker
// for the Datenstand. Text and range fields apply after 300 ms; pickers apply at once. Every
// control carries an aria-label with the column name; pickers are details/summary with real
// checkboxes or radios. The same component renders in the header cell and in the phone panel
// (`idPrefix` keeps the ids unique).
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocale } from '../i18n/context';
import type { ColumnDef } from '../lib/columns';
import {
  AGE_OPTIONS,
  NA,
  filterKind,
  filterValueText,
  normalizeText,
  parseIntInput,
  pickLabel,
  type AgeDays,
  type Filter,
} from '../lib/filters';

export const DEBOUNCE_MS = 300;

export interface FilterControlProps {
  col: ColumnDef;
  filter: Filter | undefined;
  /** Text of the provider search (the Anbieter column's filter is `q`). */
  query?: string;
  /** Pick options: values present in the TLD's rows plus k. A. */
  options: readonly string[];
  countryNames: Readonly<Record<string, string>>;
  set: (id: string, filter: Filter | null) => void;
  setQuery?: (q: string) => void;
  idPrefix: string;
  /** Column name in the aria-labels; default: the price table's label (i18n `columns`). */
  label?: string;
}

/** Calls `fn` 300 ms after the last call; a newer call cancels the pending one. */
function useDebounced<T>(fn: (v: T) => void): (v: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (v: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current(v);
    }, DEBOUNCE_MS);
  };
}

/** Column name of a control's aria-label. */
function labelOf(L: ReturnType<typeof useLocale>, props: FilterControlProps): string {
  return props.label ?? L.m.columns[props.col.id]?.label ?? props.col.id;
}

function TextFilter(props: FilterControlProps) {
  const { col, filter, query, set, setQuery, idPrefix } = props;
  const L = useLocale();
  const label = labelOf(L, props);
  const external =
    col.id === 'provider' ? (query ?? '') : filter?.kind === 'text' ? filter.text : '';
  const [value, setValue] = useState(external);
  const pending = useRef(false);
  // follow outside changes (chip removed, reset, back/forward) unless the reader is still typing
  useEffect(() => {
    if (!pending.current) setValue(external);
  }, [external]);
  const apply = useDebounced((v: string) => {
    pending.current = false;
    if (col.id === 'provider') setQuery?.(v);
    else {
      const text = normalizeText(v);
      set(col.id, text ? { kind: 'text', text } : null);
    }
  });
  const active = external !== '';
  return (
    <input
      type="search"
      class={`tc-fin${active ? ' is-active' : ''}`}
      id={`${idPrefix}${col.id}`}
      value={value}
      placeholder={L.m.filters.containsPlaceholder}
      autoComplete="off"
      spellcheck={false}
      aria-label={L.m.filters.ariaText(label)}
      onInput={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        setValue(v);
        pending.current = true;
        apply(v);
      }}
    />
  );
}

function RangeFilter(props: FilterControlProps) {
  const { col, filter, set, idPrefix } = props;
  const L = useLocale();
  const t = L.m.filters;
  const label = labelOf(L, props);
  const money = col.kind === 'money' || col.kind === 'tco';
  const f = filter?.kind === 'range' ? filter : undefined;
  const show = (v: number | null | undefined) =>
    v === null || v === undefined ? '' : money ? L.f.euroInput(v) : String(v);
  const [min, setMin] = useState(show(f?.min));
  const [max, setMax] = useState(show(f?.max));
  const [invalid, setInvalid] = useState<'min' | 'max' | null>(null);
  const pending = useRef(false);
  const na = f?.na ?? true;
  useEffect(() => {
    if (pending.current) return;
    setMin(show(f?.min));
    setMax(show(f?.max));
    setInvalid(null);
  }, [f?.min, f?.max]);
  const parse = money ? L.f.parseEuro : parseIntInput;
  const commit = (lo: string, hi: string, keepNa: boolean) => {
    pending.current = false;
    const a = parse(lo);
    const b = parse(hi);
    if (a === undefined || b === undefined) {
      setInvalid(a === undefined ? 'min' : 'max');
      return;
    }
    if (a !== null && b !== null && a > b) {
      setInvalid('max');
      return;
    }
    setInvalid(null);
    set(
      col.id,
      a === null && b === null && keepNa ? null : { kind: 'range', min: a, max: b, na: keepNa },
    );
  };
  const apply = useDebounced(([lo, hi]: [string, string]) => commit(lo, hi, na));
  const active = f !== undefined;
  const unit = money ? '€' : (L.m.columns[col.id]?.unit ?? '');
  return (
    <div
      class={`tc-range${active ? ' is-active' : ''}`}
      role="group"
      aria-label={t.ariaGroup(label)}
    >
      <input
        class={`tc-fin${active && f?.min !== null ? ' is-active' : ''}`}
        id={`${idPrefix}${col.id}-min`}
        inputMode={money ? 'decimal' : 'numeric'}
        value={min}
        placeholder={t.from}
        aria-label={t.ariaFrom(label, unit)}
        aria-invalid={invalid === 'min' ? 'true' : undefined}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          setMin(v);
          pending.current = true;
          apply([v, max]);
        }}
      />
      <input
        class={`tc-fin${active && f?.max !== null ? ' is-active' : ''}`}
        id={`${idPrefix}${col.id}-max`}
        inputMode={money ? 'decimal' : 'numeric'}
        value={max}
        placeholder={t.to}
        aria-label={t.ariaTo(label, unit)}
        aria-invalid={invalid === 'max' ? 'true' : undefined}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          setMax(v);
          pending.current = true;
          apply([min, v]);
        }}
      />
      <label class="tc-fna">
        <input
          type="checkbox"
          checked={na}
          aria-label={t.ariaNa(label)}
          onChange={(e) => commit(min, max, (e.currentTarget as HTMLInputElement).checked)}
        />{' '}
        {L.m.common.missing}
      </label>
    </div>
  );
}

function PickFilter(props: FilterControlProps) {
  const { col, filter, options, countryNames, set, idPrefix } = props;
  const L = useLocale();
  const label = labelOf(L, props);
  const f = filter?.kind === 'pick' ? filter : undefined;
  const checked = new Set(f ? f.values : options);
  const summary = f ? filterValueText(L, col, f, countryNames) : L.m.filters.all;
  const toggle = (token: string, on: boolean) => {
    const next = options.filter((o) => (o === token ? on : checked.has(o)));
    set(col.id, next.length === options.length ? null : { kind: 'pick', values: next });
  };
  return (
    <details class={`tc-fpick${f ? ' is-active' : ''}`}>
      <summary aria-label={L.m.filters.ariaPick(label, summary)}>{summary}</summary>
      <ul>
        {options.map((o) => (
          <li key={o}>
            <label>
              <input
                type="checkbox"
                id={`${idPrefix}${col.id}-${o}`}
                checked={checked.has(o)}
                onChange={(e) => toggle(o, (e.currentTarget as HTMLInputElement).checked)}
              />
              {pickLabel(L, o, countryNames)}
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AgeFilter(props: FilterControlProps) {
  const { col, filter, set, idPrefix } = props;
  const L = useLocale();
  const t = L.m.filters;
  const label = labelOf(L, props);
  const days = filter?.kind === 'age' ? filter.days : null;
  const summary = days ? t.maxDays(days) : t.any;
  const choices: Array<[AgeDays | null, string]> = [
    [null, t.any],
    ...AGE_OPTIONS.map((d) => [d, t.maxDays(d)] as [AgeDays, string]),
  ];
  return (
    <details class={`tc-fpick${days ? ' is-active' : ''}`}>
      <summary aria-label={t.ariaPick(label, summary)}>{summary}</summary>
      <ul>
        {choices.map(([d, label]) => (
          <li key={label}>
            <label>
              <input
                type="radio"
                name={`${idPrefix}${col.id}`}
                checked={days === d}
                onChange={() => set(col.id, d ? { kind: 'age', days: d } : null)}
              />
              {label}
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function FilterControl(props: FilterControlProps) {
  switch (filterKind(props.col)) {
    case 'text':
      return <TextFilter {...props} />;
    case 'range':
      return <RangeFilter {...props} />;
    case 'age':
      return <AgeFilter {...props} />;
    default:
      return <PickFilter {...props} />;
  }
}

/**
 * Pick options of a column: the values present in the rows (in rank or code order) plus k. A.
 * bool columns always offer ja, nein, k. A.; those of a feature that may cost extra also
 * kostenpflichtig (token "paid", Archiv-Issue 124), in sort order.
 */
export function pickOptions(
  col: ColumnDef,
  values: readonly (string | number | boolean | null)[],
  rank: (v: string) => number,
): string[] {
  if (col.kind === 'bool') return col.paid ? ['ja', 'paid', 'nein', NA] : ['ja', 'nein', NA];
  const present = [...new Set(values.filter((v): v is string => typeof v === 'string'))];
  present.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return [...present, NA];
}
