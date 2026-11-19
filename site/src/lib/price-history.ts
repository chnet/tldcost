// Build time only: the price history of one offer (data/history/, Archiv-Issue 51) for the row
// detail. Per entry the year-1 and renewal amounts in EUR per year, gross and net, computed by the
// caller with the same core functions as the table (rows.ts), and the path data of a small static
// SVG, so the page needs no chart code. Shown from MIN_HISTORY_POINTS entries on, at most the
// newest MAX_HISTORY_POINTS (payload size: every row's history is in the page). An entry whose
// currency, VAT mode, unit or market differs from the one before (core `comparable`) starts a new
// segment: no line connects it to the earlier entries, and a dashed line marks the break.
import { comparable, type Cents, type HistoryEntry, type PriceMode } from '@tldcost/core';
import { HISTORY_SVG } from './history-svg';
import type { HistoryPath, HistorySeries, RowHistory } from './payload';

/** A row shows its price history from this many entries on. */
export const MIN_HISTORY_POINTS = 3;
/** At most this many entries, the newest ones; the list then says so. */
export const MAX_HISTORY_POINTS = 12;

/** Year-1 and renewal amount of one entry in one VAT mode (EUR cents per year; null: unknown). */
export interface HistoryAmounts {
  year1: Cents | null;
  renewal: Cents | null;
  /**
   * Another market's prices (entry.market): the table's market footnote for this entry and mode
   * (conversion date, in gross mode the added VAT), so a converted value never reads as a German
   * price. null otherwise.
   */
  note?: string | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Path data for one series: a line through consecutive known values of the same segment, and a
 * dot per known value (a zero-length segment, drawn by the round line cap), so a single point
 * between breaks stays visible.
 */
function seriesPath(
  xs: readonly number[],
  values: readonly (Cents | null)[],
  segment: readonly number[],
  y: (v: Cents) => number,
): { line: string; dots: string } {
  let line = '';
  let dots = '';
  let open = false;
  values.forEach((v, i) => {
    if (v === null) {
      open = false;
      return;
    }
    const p = `${r1(xs[i] as number)} ${r1(y(v))}`;
    line += `${open && segment[i] === segment[i - 1] ? 'L' : 'M'}${p}`;
    dots += `M${p}h0`;
    open = true;
  });
  return { line, dots };
}

/** The SVG path data of both series in one VAT mode, on a shared scale. */
export function historyPath(
  dates: readonly string[],
  amounts: readonly HistoryAmounts[],
  breaks: readonly number[],
): HistoryPath {
  const { width, height, pad } = HISTORY_SVG;
  const t = dates.map((d) => Date.parse(`${d}T00:00:00Z`));
  const t0 = t[0] as number;
  const span = (t.at(-1) as number) - t0;
  // by date; all on one day cannot happen (one entry per day), but stay finite anyway
  const xs = t.map((v, i) =>
    span > 0
      ? pad + ((v - t0) / span) * (width - 2 * pad)
      : pad + (i / Math.max(1, t.length - 1)) * (width - 2 * pad),
  );
  const known = amounts.flatMap((a) => [a.year1, a.renewal]).filter((v): v is Cents => v !== null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  const y = (v: Cents) =>
    max === min ? height / 2 : pad + ((max - v) / (max - min)) * (height - 2 * pad);
  const segment = dates.map((_, i) => breaks.filter((b) => b <= i).length);
  const year1 = seriesPath(
    xs,
    amounts.map((a) => a.year1),
    segment,
    y,
  );
  const renewal = seriesPath(
    xs,
    amounts.map((a) => a.renewal),
    segment,
    y,
  );
  // halfway between the last entry before the break and the first after it
  const breakLines = breaks
    .map((b) => `M${r1(((xs[b - 1] as number) + (xs[b] as number)) / 2)} ${pad}V${height - pad}`)
    .join('');
  return {
    year1: year1.line,
    year1Dots: year1.dots,
    renewal: renewal.line,
    renewalDots: renewal.dots,
    breaks: breakLines,
  };
}

/**
 * The row detail's price history, or undefined below MIN_HISTORY_POINTS entries. `amountsOf`
 * converts one entry in one VAT mode (rows.ts: the table's own core calls on the entry's prices).
 */
export function rowHistory(
  all: readonly HistoryEntry[],
  amountsOf: (entry: HistoryEntry, mode: PriceMode) => HistoryAmounts,
): RowHistory | undefined {
  if (all.length < MIN_HISTORY_POINTS) return undefined;
  const entries = all.slice(-MAX_HISTORY_POINTS);
  const dates = entries.map((e) => e.date);
  const breakAt = entries
    .map((e, i) => i)
    .filter(
      (i) => i > 0 && !comparable(entries[i - 1] as HistoryEntry, entries[i] as HistoryEntry),
    );
  const series = (mode: PriceMode): HistorySeries => {
    const amounts = entries.map((e) => amountsOf(e, mode));
    const notes = amounts.map((a) => a.note ?? null);
    return {
      year1: amounts.map((a) => a.year1),
      renewal: amounts.map((a) => a.renewal),
      path: historyPath(dates, amounts, breakAt),
      // only rows with a foreign market entry carry the notes (payload size)
      ...(notes.some((n) => n !== null) ? { notes } : {}),
    };
  };
  const gross = series('gross');
  const net = series('net');
  // one VAT rate scales every amount alike: then the net lines are the gross lines (payload size)
  const samePath = JSON.stringify(net.path) === JSON.stringify(gross.path);
  return {
    dates,
    breaks: breakAt,
    gross,
    net: samePath
      ? { year1: net.year1, renewal: net.renewal, ...(net.notes ? { notes: net.notes } : {}) }
      : net,
    ...(all.length > entries.length ? { capped: true as const } : {}),
  };
}
