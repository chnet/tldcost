// Price history in the row detail (Archiv-Issue 51): values from data/history/ through the same
// core calls as the table, a row needs 3 entries, segments break at a change of currency, VAT
// mode, unit or market, and the sparkline's path data stays inside its viewBox.
import { fileURLToPath } from 'node:url';
import {
  computeTco,
  fxRateFor,
  normalizePrice,
  type HistoryEntry,
  type PriceHistory,
} from '@tldcost/core';
import { loadData, loadHistories } from '@tldcost/core/load';
import { describe, expect, it } from 'vitest';
import { HISTORY_SVG } from '../../src/lib/history-svg';
import { DE } from '../../src/i18n/de';
import { EN } from '../../src/i18n/en';
import {
  historyPath,
  MAX_HISTORY_POINTS,
  MIN_HISTORY_POINTS,
  rowHistory,
} from '../../src/lib/price-history';
import { buildPayload } from '../../src/lib/rows';

const FIXTURES = fileURLToPath(new URL('../fixtures/data', import.meta.url));
const data = loadData(FIXTURES);
const history = loadHistories(FIXTURES);
const payload = buildPayload(data, { history });
const row = (key: string) => payload.rows.find((r) => r.key === key);

const entry = (date: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  date,
  currency: 'EUR',
  vat_included: true,
  unit: 'year',
  setup: 0,
  year1: 500,
  renewal: 1000,
  transfer_in: 1000,
  source: { url: 'https://alpha.example/preise', fetched_at: `${date}T08:00:00Z` },
  ...over,
});

/** Only the M/L/V commands and their numbers of a path. */
const points = (d: string) =>
  [...d.matchAll(/([ML])([\d.]+) ([\d.]+)/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);

describe('price history in the payload', () => {
  it('rows from 3 entries on carry it; 2 entries or no history option: none', () => {
    expect(MIN_HISTORY_POINTS).toBe(3);
    expect(history.get('alpha/de')?.entries).toHaveLength(3);
    expect(history.get('bravo/de')?.entries).toHaveLength(2);
    expect(row('alpha/de')?.detail.history?.dates).toEqual([
      '2026-11-01',
      '2026-11-06',
      '2026-11-12',
    ]);
    expect(row('bravo/de')?.detail).not.toHaveProperty('history');
    expect(payload.rows.filter((r) => r.detail.history).map((r) => r.key)).toEqual(['alpha/de']);
    expect(buildPayload(data).rows.some((r) => r.detail.history)).toBe(false);
  });

  it('amounts per entry equal @tldcost/core on the entry prices, gross and net', () => {
    const provider = data.providers.find((p) => p.id === 'alpha')!;
    const offer = data.offers.find((o) => o.provider === 'alpha' && o.tld === 'de')!;
    const h = row('alpha/de')!.detail.history!;
    const entries = history.get('alpha/de')!.entries;
    for (const mode of ['gross', 'net'] as const) {
      entries.forEach((e, i) => {
        const at = {
          ...offer,
          price: { ...offer.price, year1: e.year1, renewal: e.renewal, setup: e.setup },
        };
        expect(h[mode].year1[i], `${mode} ${e.date}`).toBe(
          computeTco(at, 3, { mode, provider }).perYear[0],
        );
        const renewal = normalizePrice(e.renewal as number, {
          currency: 'EUR',
          vatIncluded: true,
          vatRate: 1900,
          unit: 'year',
          mode,
        });
        expect(h[mode].renewal[i], `${mode} ${e.date}`).toBe(renewal);
      });
    }
    expect(h.gross.year1).toEqual([99, 199, 99]);
    expect(h.gross.renewal).toEqual([500, 550, 600]);
    expect(h.net.renewal).toEqual([420, 462, 504]);
    // the last entry is the offer: the same values as the table row
    expect(h.gross.year1.at(-1)).toBe(row('alpha/de')!.gross['year1']);
    expect(h.net.renewal.at(-1)).toBe(row('alpha/de')!.net['renewal']);
    expect(h.breaks).toEqual([]);
    // one VAT rate for all entries: the net lines are the gross lines, not repeated in the payload
    expect(h.gross.path).toBeDefined();
    expect(h.net).not.toHaveProperty('path');
  });

  it('a market switch starts a new segment, converted at the ECB rate of its fetch date', () => {
    const us = (date: string, year1: number) =>
      entry(date, { currency: 'USD', vat_included: false, year1, renewal: 1799, market: 'US' });
    const switched: PriceHistory = {
      schema_version: 1,
      provider: 'alpha',
      tld: 'de',
      entries: [entry('2026-11-01'), entry('2026-11-06', { year1: 600 }), us('2026-11-12', 1599)],
    };
    const h = buildPayload(data, { history: new Map([['alpha/de', switched]]) }).rows.find(
      (r) => r.key === 'alpha/de',
    )!.detail.history!;
    expect(h.breaks).toEqual([{ index: 2, currency: 'USD', market: 'US' }]);
    const fx = fxRateFor(data.fx, 'USD', '2026-11-12T08:00:00Z')!;
    expect(fx.date).toBe('2026-11-11');
    const usd = (cents: number, mode: 'gross' | 'net') =>
      normalizePrice(cents, {
        currency: 'USD',
        vatIncluded: false,
        vatRate: 1900,
        unit: 'year',
        mode,
        fx,
      });
    expect(h.gross.year1).toEqual([500, 600, usd(1599, 'gross')]);
    expect(h.net.renewal.at(-1)).toBe(usd(1799, 'net'));
    // the line does not cross the break: a new subpath (M) at the US entry, one break line
    expect(points(h.gross.path!.year1).map((p) => p[0])).toEqual(['M', 'L', 'M']);
    expect(h.gross.path!.breaks).toMatch(/^M[\d.]+ 4V52$/);
    // gross and net scale the two segments differently: net keeps its own lines
    expect(h.net.path).toBeDefined();
    expect(h.net.path).not.toEqual(h.gross.path);
  });

  it('every change of currency, VAT mode or unit breaks the line, not only a market switch', () => {
    const breaks = (e: HistoryEntry) =>
      rowHistory([entry('2026-11-01'), entry('2026-11-02'), e], () => ({
        year1: 1,
        renewal: 1,
      }))!.breaks.map((b) => b.index);
    expect(breaks(entry('2026-11-03', { vat_included: false }))).toEqual([2]);
    expect(breaks(entry('2026-11-03', { unit: 'month' }))).toEqual([2]);
    expect(breaks(entry('2026-11-03', { currency: 'USD' }))).toEqual([2]);
    expect(breaks(entry('2026-11-03', { year1: 900 }))).toEqual([]);
  });
});

describe('at most the newest 12 entries', () => {
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      entry(`2026-12-${String(i + 1).padStart(2, '0')}`, { year1: 100 + i }),
    );
  const amounts = (e: HistoryEntry) => ({ year1: e.year1, renewal: e.renewal });

  it('15 entries: the newest 12, marked as capped; 12 entries: all, not capped', () => {
    expect(MAX_HISTORY_POINTS).toBe(12);
    const h = rowHistory(days(15), amounts)!;
    expect(h.dates).toHaveLength(12);
    expect(h.dates[0]).toBe('2026-12-04');
    expect(h.dates.at(-1)).toBe('2026-12-15');
    expect(h.gross.year1).toEqual(
      days(15)
        .slice(-12)
        .map((e) => e.year1),
    );
    expect(h.capped).toBe(true);
    const all = rowHistory(days(12), amounts)!;
    expect(all.dates).toHaveLength(12);
    expect(all).not.toHaveProperty('capped');
  });

  it('a break inside the shown entries is indexed within them', () => {
    const e = days(14);
    e[10] = { ...(e[10] as HistoryEntry), vat_included: false };
    e[11] = { ...(e[11] as HistoryEntry), vat_included: false };
    // 14 entries, the first 2 left out: the change at entry 10 is shown entry 8, back at 12 is 10
    expect(rowHistory(e, amounts)!.breaks.map((b) => b.index)).toEqual([8, 10]);
  });

  it('the caption says so in both languages', () => {
    expect(DE.m.detail.historyCaption('brutto', true)).toBe(
      'Letzte 12 Änderungen, brutto in Euro pro Jahr:',
    );
    expect(DE.m.detail.historyCaption('netto', false)).toBe(
      'Je Datenstand, netto in Euro pro Jahr:',
    );
    expect(EN.m.detail.historyCaption('gross', true)).toBe(
      'Last 12 changes, gross in euros per year:',
    );
  });
});

describe('historyPath', () => {
  const { width, height, pad } = HISTORY_SVG;

  it('x by date from pad to width - pad, y from max (top) to min (bottom)', () => {
    const p = historyPath(
      ['2026-11-01', '2026-11-03', '2026-11-11'],
      [
        { year1: 100, renewal: 300 },
        { year1: 200, renewal: 300 },
        { year1: 100, renewal: 300 },
      ],
      [],
    );
    expect(points(p.year1)).toEqual([
      ['M', pad, height - pad],
      ['L', 50.4, 28],
      ['L', width - pad, height - pad],
    ]);
    expect(points(p.renewal).map((q) => q[2])).toEqual([pad, pad, pad]);
    expect(p.year1Dots).toBe(
      `M${pad} ${height - pad}h0M50.4 28h0M${width - pad} ${height - pad}h0`,
    );
    expect(p.breaks).toBe('');
  });

  it('equal values sit in the middle; an unknown value interrupts the line, a lone dot stays', () => {
    const p = historyPath(
      ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
      [
        { year1: 500, renewal: 500 },
        { year1: null, renewal: 500 },
        { year1: 500, renewal: 500 },
        { year1: 500, renewal: null },
      ],
      [],
    );
    expect(points(p.renewal).map((q) => q[2])).toEqual([height / 2, height / 2, height / 2]);
    expect(points(p.year1).map((q) => q[0])).toEqual(['M', 'M', 'L']);
    expect(points(p.renewal).map((q) => q[0])).toEqual(['M', 'L', 'L']);
    expect(p.year1Dots.match(/h0/g)).toHaveLength(3);
  });

  it('without any known value: no lines, only the break marks', () => {
    const p = historyPath(
      ['2026-11-01', '2026-11-02', '2026-11-03'],
      [
        { year1: null, renewal: null },
        { year1: null, renewal: null },
        { year1: null, renewal: null },
      ],
      [1],
    );
    expect([p.year1, p.year1Dots, p.renewal, p.renewalDots]).toEqual(['', '', '', '']);
    expect(p.breaks).toBe(`M62 ${pad}V${height - pad}`);
  });

  it('all on one date (not possible in data/): spread by index, still finite', () => {
    const p = historyPath(
      ['2026-11-01', '2026-11-01', '2026-11-01'],
      [
        { year1: 1, renewal: 2 },
        { year1: 1, renewal: 2 },
        { year1: 1, renewal: 2 },
      ],
      [],
    );
    expect(points(p.year1).map((q) => q[1])).toEqual([pad, width / 2, width - pad]);
  });
});
