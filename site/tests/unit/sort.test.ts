import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAYABLE_FEATURES } from '@tldcost/core';
import { COLUMN_BY_ID, COLUMN_IDS, COLUMNS, ENUM_RANK } from '../../src/lib/columns';
import { FEATURE_COST_COLUMNS } from '../../src/lib/rows';
import { DE } from '../../src/i18n/de';
const ENUM_LABELS = DE.m.enums;
import {
  compareIds,
  sortRows,
  TIE_BREAK_COLUMN,
  type SortableRow,
  type SortDir,
} from '../../src/lib/sort';

const row = (providerId: string, values: SortableRow['values']): SortableRow => ({
  key: `${providerId}/de`,
  providerId,
  values,
});

// Ties, nulls and mixed kinds on purpose: c is "the operator" in the operator tests below.
const ROWS: SortableRow[] = [
  row('e', { sum_3y: 1500, ssl_free: true, provider: 'Echo', billing_cycle: 'yearly' }),
  row('a', { sum_3y: 1299, ssl_free: true, provider: 'alpha', billing_cycle: 'monthly' }),
  row('c', { sum_3y: 1500, ssl_free: false, provider: 'Charlie', billing_cycle: null }),
  row('b', { sum_3y: 1500, ssl_free: null, provider: 'bravo', billing_cycle: 'multi-year' }),
  row('d', { sum_3y: null, ssl_free: true, provider: 'Delta', billing_cycle: 'yearly' }),
  row('f', { ssl_free: false, provider: 'Foxtrot', billing_cycle: 'yearly' }),
];

function seededShuffle<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const DIRS: SortDir[] = ['asc', 'desc'];

/** Reference tie-break, written independently of sort.ts: sum_3y asc (missing last), then id. */
function tieBreak(ka: string, kb: string): number {
  const ra = ROWS.find((r) => r.key === ka);
  const rb = ROWS.find((r) => r.key === kb);
  const a = ra?.values[TIE_BREAK_COLUMN] ?? null;
  const b = rb?.values[TIE_BREAK_COLUMN] ?? null;
  if (a !== b) {
    if (a === null) return 1;
    if (b === null) return -1;
    return (a as number) - (b as number);
  }
  return compareIds(ra?.providerId ?? '', rb?.providerId ?? '');
}
const ids = (keys: string[]) => keys.map((k) => k.split('/')[0] ?? '');

describe('sortRows', () => {
  it('sorts numbers ascending, ties by provider id, nulls last', () => {
    expect(ids(sortRows(ROWS, 'sum_3y', 'asc'))).toEqual(['a', 'b', 'c', 'e', 'd', 'f']);
  });

  it('desc reverses the values only: tie-breaks stay ascending, nulls stay last', () => {
    expect(ids(sortRows(ROWS, 'sum_3y', 'desc'))).toEqual(['b', 'c', 'e', 'a', 'd', 'f']);
  });

  it('yes/no: asc = "ja" first, missing last in both directions', () => {
    // ties inside "ja"/"nein" by sum_3y (a 1299 < e 1500 < d missing), then id
    expect(ids(sortRows(ROWS, 'ssl_free', 'asc'))).toEqual(['a', 'e', 'd', 'c', 'f', 'b']);
    expect(ids(sortRows(ROWS, 'ssl_free', 'desc'))).toEqual(['c', 'f', 'a', 'e', 'd', 'b']);
  });

  it('strings use a fixed German collator, not the code-unit order', () => {
    expect(ids(sortRows(ROWS, 'provider', 'asc'))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('enums sort by rank (monthly < yearly < multi-year), not alphabetically', () => {
    expect(ids(sortRows(ROWS, 'billing_cycle', 'asc'))).toEqual(['a', 'e', 'd', 'f', 'b', 'c']);
  });

  it.each(DIRS)('null is always last for every column (%s)', (dir) => {
    for (const col of COLUMN_IDS) {
      const order = sortRows(ROWS, col, dir);
      const firstNull = order.findIndex((k) => {
        const v = ROWS.find((r) => r.key === k)?.values[col];
        return v === null || v === undefined;
      });
      if (firstNull === -1) continue;
      const tail = order.slice(firstNull).map((k) => ROWS.find((r) => r.key === k)?.values[col]);
      expect(
        tail.every((v) => v === null || v === undefined),
        `${col} ${dir}`,
      ).toBe(true);
      // and among themselves by the tie-break: sum_3y ascending (missing last), then id
      const tail3 = order.slice(firstNull);
      expect(tail3).toEqual([...tail3].sort(tieBreak));
    }
  });

  it('the input order never matters (50 seeded shuffles, every column and direction)', () => {
    for (const col of COLUMN_IDS) {
      for (const dir of DIRS) {
        const expected = sortRows(ROWS, col, dir);
        for (let seed = 1; seed <= 50; seed++) {
          expect(sortRows(seededShuffle(ROWS, seed), col, dir)).toEqual(expected);
        }
      }
    }
  });

  it('ties: the cheaper row (sum_3y) wins before an early provider id', () => {
    // "aaa" would win every tie with an id-only tie-break; here it is the most expensive
    const rows = [
      row('aaa', { dnssec: true, sum_3y: 3000 }),
      row('mmm', { dnssec: true, sum_3y: 1000 }),
      row('zzz', { dnssec: true, sum_3y: 2000 }),
    ];
    for (const dir of DIRS) {
      expect(ids(sortRows(rows, 'dnssec', dir))).toEqual(['mmm', 'zzz', 'aaa']);
    }
  });

  it('ties: equal sum_3y falls back to provider id ascending, also for desc', () => {
    const rows = [
      row('zzz', { api: true, sum_3y: 1000 }),
      row('aaa', { api: true, sum_3y: 1000 }),
      row('mmm', { api: false, sum_3y: 500 }),
    ];
    expect(ids(sortRows(rows, 'api', 'asc'))).toEqual(['aaa', 'zzz', 'mmm']);
    expect(ids(sortRows(rows, 'api', 'desc'))).toEqual(['mmm', 'aaa', 'zzz']);
  });

  it('feature columns: ja, kostenpflichtig ("paid"), nein, k. A. (Archiv-Issue 124); desc flips, k. A. stays last', () => {
    const rows = [
      row('a', { dns_editor: false, sum_3y: 100 }),
      row('b', { dns_editor: 'paid', sum_3y: 300 }),
      row('c', { dns_editor: true, sum_3y: 900 }),
      row('d', { dns_editor: null, sum_3y: 1 }),
      row('e', { dns_editor: 'paid', sum_3y: 200 }),
    ];
    expect(ids(sortRows(rows, 'dns_editor', 'asc'))).toEqual(['c', 'e', 'b', 'a', 'd']);
    expect(ids(sortRows(rows, 'dns_editor', 'desc'))).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('every payable feature field of the offer schema has a "paid" bool column (Archiv-Issue 124)', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../../../schema/offer.schema.json', import.meta.url), 'utf8'),
    );
    const payable = Object.entries(
      schema.properties.features.properties as Record<string, { $ref?: string }>,
    )
      .filter(([, p]) => p.$ref === '#/$defs/featureValue')
      .map(([f]) => f);
    expect([...payable].sort()).toEqual([...PAYABLE_FEATURES].sort());
    expect(Object.keys(schema.properties.feature_costs.properties).sort()).toEqual(
      [...PAYABLE_FEATURES, 'whois_privacy'].sort(),
    );
    expect(Object.keys(FEATURE_COST_COLUMNS).sort()).toEqual(
      [...PAYABLE_FEATURES, 'whois_privacy'].sort(),
    );
    for (const f of PAYABLE_FEATURES) {
      const c = COLUMN_BY_ID.get(FEATURE_COST_COLUMNS[f]);
      expect(c?.kind, f).toBe('bool');
      expect(c?.paid, f).toBe(true);
    }
    // no other column takes "paid"
    expect(COLUMNS.filter((c) => c.paid).length).toBe(PAYABLE_FEATURES.length);
  });

  it('whois_privacy: "n/a" ranks equal to "free" (tie-break decides), "paid" after both', () => {
    const rows = [
      row('a', { whois_privacy: 'paid', sum_3y: 100 }),
      row('b', { whois_privacy: 'n/a', sum_3y: 300 }),
      row('c', { whois_privacy: 'free', sum_3y: 200 }),
      row('d', { whois_privacy: null, sum_3y: 50 }),
    ];
    expect(ids(sortRows(rows, 'whois_privacy', 'asc'))).toEqual(['c', 'b', 'a', 'd']);
    expect(ids(sortRows(rows, 'whois_privacy', 'desc'))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('whois_privacy: "none" ranks after "paid", even when it is cheaper and sorts first by text', () => {
    const rows = [
      row('a', { whois_privacy: 'paid', sum_3y: 100 }),
      row('b', { whois_privacy: 'none', sum_3y: 10 }),
      row('c', { whois_privacy: 'free', sum_3y: 200 }),
      row('d', { whois_privacy: null, sum_3y: 5 }),
    ];
    expect(ids(sortRows(rows, 'whois_privacy', 'asc'))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(sortRows(rows, 'whois_privacy', 'desc'))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('every enum value of the offer schema has a sort rank and a label', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../../../schema/offer.schema.json', import.meta.url), 'utf8'),
    );
    const values = [
      ...schema.properties.contract.properties.billing_cycle.enum,
      ...schema.properties.features.properties.whois_privacy.enum,
    ].filter((v: unknown): v is string => typeof v === 'string');
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(ENUM_RANK[v], `rank of ${v}`).toBeTypeOf('number');
      expect(ENUM_LABELS[v], `label of ${v}`).toBeTypeOf('string');
    }
    expect(Object.keys(ENUM_LABELS).sort()).toEqual(Object.keys(ENUM_RANK).sort());
  });

  it('extra fields on a row (e.g. an operator flag) never change the order', () => {
    for (const flagged of ROWS.map((r) => r.providerId)) {
      const withFlag = ROWS.map((r) =>
        r.providerId === flagged ? Object.assign({ operator: true }, r) : r,
      );
      for (const col of COLUMN_IDS) {
        for (const dir of DIRS) {
          expect(sortRows(withFlag, col, dir)).toEqual(sortRows(ROWS, col, dir));
        }
      }
    }
  });
});
