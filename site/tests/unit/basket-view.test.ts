// Archiv-Issue 123: sort and filter of the portfolio result table (basket-view.ts) and its URL state
// (basket-state.ts): columns, values, order (no total last, null last, ties), filters, tc-best,
// operator neutrality, URL round trip without clashing with basket/years/vat/mode.
import { fileURLToPath } from 'node:url';
import { computeBasket, type BasketItem, type BasketResult } from '@tldcost/core';
import { loadData } from '@tldcost/core/load';
import { describe, expect, it } from 'vitest';
import { buildBasketPayload } from '../../src/lib/basket-payload';
import {
  defaultBasketState,
  fitView,
  parseBasketState,
  serializeBasketState,
} from '../../src/lib/basket-state';
import {
  BASKET_COUNTRY_SORTABLE,
  assumptions,
  basketBestCells,
  basketColumns,
  basketRows,
  sortBasketRows,
  visibleBasketRows,
  type BasketViewRow,
} from '../../src/lib/basket-view';

const PAYLOAD = buildBasketPayload(
  loadData(fileURLToPath(new URL('../fixtures/data', import.meta.url))),
);
const meta = (id: string) => PAYLOAD.providers[id];
const result = (basket: BasketItem[], mode: 'new' | 'transfer' = 'new'): BasketResult =>
  computeBasket(PAYLOAD.offers, basket, 3, mode, {
    price: 'gross',
    providers: PAYLOAD.providers,
    fx: PAYLOAD.fx,
  });
const BASKET = [
  { tld: 'de', count: 2 },
  { tld: 'com', count: 1 },
];
const ids = (rows: readonly BasketViewRow[]) => rows.map((r) => r.provider);
const row = (provider: string, values: Record<string, number | string | boolean | null>) => ({
  provider,
  values: {
    provider,
    country: 'DE',
    complete: values.total !== null,
    assumption: false,
    ...values,
  },
  completeLines: Object.keys(values).filter((k) => k.startsWith('tld-') && values[k] !== null)
    .length,
});

describe('basket columns and rows', () => {
  it('columns: provider, Land, total, one per TLD, complete, assumption', () => {
    const cols = basketColumns(['de', 'com']);
    expect(cols.map((c) => c.id)).toEqual([
      'provider',
      'country',
      'total',
      'tld-de',
      'tld-com',
      'complete',
      'assumption',
    ]);
    expect(cols.map((c) => c.kind)).toEqual([
      'text',
      'enum',
      'money',
      'money',
      'money',
      'bool',
      'bool',
    ]);
    // Land as in the price table: filterable, not sortable (owner decision, Archiv-Issue 123)
    expect(BASKET_COUNTRY_SORTABLE).toBe(false);
    expect(cols.find((c) => c.id === 'country')?.sortable).toBe(false);
  });

  it('values come from computeBasket; the default order equals the core order', () => {
    const r = result(BASKET);
    const rows = basketRows(r, meta);
    expect(ids(sortBasketRows(rows, 'total', 'asc'))).toEqual(r.providers.map((p) => p.provider));
    const delta = rows.find((x) => x.provider === 'delta') as BasketViewRow;
    // delta has no .com: no total, not complete
    expect(delta.values).toMatchObject({ total: null, complete: false, 'tld-com': null });
    const echo = rows.find((x) => x.provider === 'echo') as BasketViewRow;
    expect(echo.values.country).toBe('US');
    // echo states no VAT: an assumption of the calculation
    expect(echo.values.assumption).toBe(true);
    // the row carries no operator information
    expect(Object.keys(rows[0] as object).sort()).toEqual(['completeLines', 'provider', 'values']);
  });

  it('assumptions: no VAT statement, renewal as year 1, the promo budget per customer', () => {
    const r = result(BASKET);
    const by = new Map(r.providers.map((p) => [p.provider, assumptions(p)]));
    expect(by.get('echo')).toContain('vat');
    // alpha: a promo without a stated limit, counted once (pool note)
    expect(by.get('alpha')).toContain('pool');
    for (const p of r.providers) {
      if (p.total === null) expect(assumptions(p)).not.toContain('pool');
    }
  });
});

describe('sort', () => {
  const rows = [
    row('a', { total: 300, 'tld-de': 100, 'tld-com': 200 }),
    row('b', { total: 200, 'tld-de': 150, 'tld-com': 50 }),
    row('c', { total: null, 'tld-de': 10, 'tld-com': null }),
    row('d', { total: 200, 'tld-de': null, 'tld-com': 60 }),
    row('e', { total: null, 'tld-de': null, 'tld-com': null }),
  ];

  it('rows without a total come last for every column and direction', () => {
    for (const col of ['total', 'tld-de', 'tld-com', 'provider', 'complete', 'assumption']) {
      for (const dir of ['asc', 'desc'] as const) {
        expect(
          ids(sortBasketRows(rows, col, dir))
            .slice(-2)
            .sort(),
        ).toEqual(['c', 'e']);
      }
    }
  });

  it('by a TLD column: ascending and descending, missing values last, ties by total then id', () => {
    expect(ids(sortBasketRows(rows, 'tld-de', 'asc'))).toEqual(['a', 'b', 'd', 'c', 'e']);
    expect(ids(sortBasketRows(rows, 'tld-de', 'desc'))).toEqual(['b', 'a', 'd', 'c', 'e']);
    // tie on total 200: more complete lines first, then the id
    expect(ids(sortBasketRows(rows, 'total', 'asc'))).toEqual(['b', 'd', 'a', 'c', 'e']);
    expect(ids(sortBasketRows(rows, 'total', 'desc'))).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('is independent of the input order', () => {
    const rev = [...rows].reverse();
    for (const col of ['total', 'tld-de', 'provider'])
      expect(ids(sortBasketRows(rev, col, 'asc'))).toEqual(ids(sortBasketRows(rows, col, 'asc')));
  });
});

describe('filter and tc-best', () => {
  const r = result(BASKET);
  const rows = basketRows(r, meta);
  const cols = basketColumns(['de', 'com']);
  const view = { sort: 'total', dir: 'asc' as const, q: '', f: {} };

  it('a range filter keeps rows without a value (k. A.) unless unticked', () => {
    const kept = visibleBasketRows(rows, {
      ...view,
      f: { total: { kind: 'range', min: null, max: 1, na: true } },
    });
    expect(ids(kept)).toEqual(rows.filter((x) => x.values.total === null).map((x) => x.provider));
    expect(
      visibleBasketRows(rows, {
        ...view,
        f: { total: { kind: 'range', min: null, max: 1, na: false } },
      }),
    ).toEqual([]);
  });

  it('complete, assumption, Land and the provider search', () => {
    const complete = visibleBasketRows(rows, {
      ...view,
      f: { complete: { kind: 'pick', values: ['ja'] } },
    });
    expect(complete.every((x) => x.values.total !== null)).toBe(true);
    expect(
      visibleBasketRows(rows, {
        ...view,
        f: { assumption: { kind: 'pick', values: ['nein'] } },
      }).map((x) => x.provider),
    ).not.toContain('echo');
    expect(
      ids(visibleBasketRows(rows, { ...view, f: { country: { kind: 'pick', values: ['US'] } } })),
    ).toEqual(['echo']);
    expect(ids(visibleBasketRows(rows, { ...view, q: 'ALPH' }))).toEqual(['alpha']);
  });

  it('tc-best marks the lowest value of the shown rows (owner decision B)', () => {
    const all = basketBestCells(rows, cols);
    const cheapest = sortBasketRows(rows, 'total', 'asc')[0] as BasketViewRow;
    expect(all.has(`${cheapest.provider}|total`)).toBe(true);
    const rest = visibleBasketRows(rows, { ...view, q: '' }).filter(
      (x) => x.provider !== cheapest.provider,
    );
    const best = basketBestCells(rest, cols);
    expect(best.has(`${cheapest.provider}|total`)).toBe(false);
    const min = Math.min(...rest.map((x) => x.values.total).filter((v): v is number => v !== null));
    for (const x of rest) expect(best.has(`${x.provider}|total`)).toBe(x.values.total === min);
    // never on a missing value, never on yes/no columns
    for (const key of best) expect(key).not.toMatch(/\|(complete|assumption|country|provider)$/);
  });

  it('operator neutrality: without the operator flag the order and tc-best are the same', () => {
    const plain = Object.fromEntries(
      Object.entries(PAYLOAD.providers).map(([k, v]) => [k, { ...v, operator: false }]),
    );
    const r2 = computeBasket(PAYLOAD.offers, BASKET, 3, 'new', {
      price: 'gross',
      providers: plain,
      fx: PAYLOAD.fx,
    });
    const rows2 = basketRows(r2, (id) => plain[id]);
    for (const col of ['total', 'tld-de', 'provider']) {
      expect(ids(sortBasketRows(rows2, col, 'asc'))).toEqual(ids(sortBasketRows(rows, col, 'asc')));
    }
    expect(basketBestCells(rows2, cols)).toEqual(basketBestCells(rows, cols));
  });
});

describe('URL state of sort and filter', () => {
  const TLDS = ['de', 'com', 'io'];

  it('round-trips with the basket parameters, in canonical order', () => {
    const url =
      '?basket=de:10,com:3&years=5&vat=net&mode=transfer&sort=tld-com&dir=desc&q=alpha&f=country:DE;total:..50000,-na;complete:ja&theme=dark';
    const s = parseBasketState(url, TLDS);
    expect(s).toMatchObject({ sort: 'tld-com', dir: 'desc', q: 'alpha' });
    expect(s.f).toEqual({
      country: { kind: 'pick', values: ['DE'] },
      total: { kind: 'range', min: null, max: 50000, na: false },
      complete: { kind: 'pick', values: ['ja'] },
    });
    expect(serializeBasketState(s, 'theme=dark&sort=x&f=y')).toBe(url);
  });

  it('defaults stay out of the URL; the default sort is total ascending', () => {
    const s = parseBasketState('?basket=de:1&sort=total&dir=asc', TLDS);
    expect(s.sort).toBe('total');
    expect(serializeBasketState(s)).toBe('?basket=de:1');
    expect(defaultBasketState()).toMatchObject({ sort: 'total', dir: 'asc', q: '', f: {} });
  });

  it('a sort or filter on a TLD outside the basket, Land as sort and bad specs fall back', () => {
    const s = parseBasketState(
      '?basket=de:1&sort=tld-io&dir=x&f=tld-io:..100;tld-de:5..1;nope:1;complete:ja',
      TLDS,
    );
    expect(s.sort).toBe('total');
    expect(s.dir).toBe('asc');
    expect(s.f).toEqual({ complete: { kind: 'pick', values: ['ja'] } });
    expect(parseBasketState('?basket=de:1&sort=country', TLDS).sort).toBe('total');
    // removing a TLD from the basket drops its sort and filter
    const before = parseBasketState(
      '?basket=de:1,com:2&sort=tld-com&dir=desc&f=tld-com:..900',
      TLDS,
    );
    const after = fitView({ ...before, basket: [{ tld: 'de', count: 1 }] });
    expect(after.sort).toBe('total');
    expect(after.dir).toBe('asc');
    expect(after.f).toEqual({});
    expect(serializeBasketState(after)).toBe('?basket=de:1');
  });
});
