// Design system phase 1, table logic: provider search (`q`), pass-through of foreign URL
// parameters (`theme`), lowest value per column (`tc-best`), country data and flag files.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData } from '@tldcost/core/load';
import { describe, expect, it } from 'vitest';
import { buildPayload, countryName } from '../../src/lib/rows';
import { defaultState, MAX_QUERY, parse, serialize } from '../../src/lib/url-state';
import { bestCells, matchesQuery, orderedRows, rowCount } from '../../src/lib/view';

const FIXTURES = fileURLToPath(new URL('../fixtures/data', import.meta.url));
const data = loadData(FIXTURES);
const payload = buildPayload(data);
const ctx = { tlds: payload.tlds };
const state = (patch: Partial<ReturnType<typeof defaultState>> = {}) => ({
  ...defaultState(ctx),
  ...patch,
});

describe('provider search (q)', () => {
  it('is parsed, normalised and written last among the own parameters; empty = absent', () => {
    expect(parse('?q=%20%20Bravo%20%20Net%20', ctx).q).toBe('Bravo Net');
    expect(serialize(state({ q: 'bravo', vat: 'net' }), ctx)).toBe('?vat=net&q=bravo');
    expect(serialize(state({ q: '   ' }), ctx)).toBe('');
    expect(parse('?q=' + 'x'.repeat(200), ctx).q).toHaveLength(MAX_QUERY);
    expect(serialize(state({ q: 'a&b=c' }), ctx)).toBe('?q=a%26b%3Dc');
  });

  it('keeps parameters the table does not own (theme) after its own, drops stale own ones', () => {
    const current = '?theme=dark&q=old&sort=year1&x=1';
    expect(serialize(state({ vat: 'net' }), ctx, current)).toBe('?vat=net&theme=dark&x=1');
    expect(serialize(defaultState(ctx), ctx, '?theme=light')).toBe('?theme=light');
  });

  it('filters by provider name or id, case- and accent-insensitive; order unchanged', () => {
    const all = orderedRows(payload, state()).map((v) => v.row.providerId);
    const some = orderedRows(payload, state({ q: 'CHAR' })).map((v) => v.row.providerId);
    expect(some).toEqual(['charlie']);
    const two = orderedRows(payload, state({ q: 'o' })).map((v) => v.row.providerId);
    expect(two).toEqual(all.filter((id) => two.includes(id))); // a subsequence of the full order
    expect(orderedRows(payload, state({ q: 'nichts' }))).toEqual([]);
    expect(rowCount(payload, 'de')).toBe(all.length);
    const row = payload.rows.find((r) => r.key === 'bravo/de')!;
    expect(matchesQuery({ ...payload, providers: {} }, row, 'BRAV')).toBe(true); // id fallback
    expect(matchesQuery(payload, row, '')).toBe(true);
    const named = { ...payload.providers['bravo']!, name: 'Bräu Domains' };
    expect(matchesQuery({ ...payload, providers: { bravo: named } }, row, 'brau')).toBe(true);
  });
});

describe('tc-best: lowest value per price column', () => {
  it('marks every minimum cell of money and sum columns, never a missing value', () => {
    const rows = orderedRows(payload, state());
    const best = bestCells(rows);
    for (const col of ['year1', 'sum_3y']) {
      const nums = rows.map((r) => r.values[col]).filter((v): v is number => typeof v === 'number');
      const min = Math.min(...nums);
      const expected = rows.filter((r) => r.values[col] === min).map((r) => `${r.row.key}|${col}`);
      expect([...best].filter((k) => k.endsWith(`|${col}`)).sort()).toEqual(expected.sort());
    }
    for (const k of best) {
      const [key, col] = k.split('|');
      const r = rows.find((x) => x.row.key === key)!;
      expect(typeof r.values[col!]).toBe('number');
    }
    // no bool/int/enum columns
    expect([...best].some((k) => /\|(notice_days|ssl_free|whois_privacy)$/.test(k))).toBe(false);
  });

  it('ties: all cells with the minimum', () => {
    const rows = orderedRows(payload, state({ tld: 'com' }));
    const best = bestCells(rows);
    const zero = rows.filter((r) => r.values['setup'] === 0).map((r) => `${r.row.key}|setup`);
    expect(zero.length).toBeGreaterThan(1);
    for (const k of zero) expect(best.has(k)).toBe(true);
  });

  it('depends on the values only: identical with and without the operator flag', () => {
    const noOperator = buildPayload({
      ...data,
      providers: data.providers.map(({ operator: _drop, ...p }) => p),
    });
    for (const tld of payload.tlds) {
      for (const vat of ['gross', 'net'] as const) {
        const a = bestCells(orderedRows(payload, state({ tld, vat })));
        const b = bestCells(orderedRows(noOperator, state({ tld, vat })));
        expect([...a].sort(), `${tld} ${vat}`).toEqual([...b].sort());
      }
    }
  });

  it('the table computes it over all rows of the TLD, so the search never changes it', () => {
    // what PriceTable does: bestCells over the rows without q, displayed on the filtered rows
    const all = bestCells(orderedRows(payload, state({ q: '' })));
    const shown = orderedRows(payload, state({ q: 'charlie' })).map((v) => v.row.key);
    const marked = [...all].filter((k) => shown.includes(k.split('|')[0]!));
    // charlie/de is not the cheapest in year 1 (alpha is): never marked, also when alone
    expect(marked).not.toContain('charlie/de|year1');
    expect(all.has('alpha/de|year1')).toBe(true);
  });
});

describe('country', () => {
  it('provider metadata carries the code and the German name', () => {
    expect(payload.providers['echo']).toMatchObject({
      country: 'US',
      countryName: 'Vereinigte Staaten',
    });
    expect(payload.providers['alpha']).toMatchObject({ country: 'DE', countryName: 'Deutschland' });
    expect(countryName('se')).toBe('Schweden');
    expect(countryName('??')).toBe('??');
  });

  it('a flag file exists for every country in data/ and the fixtures, plus the MIT text', () => {
    const flags = fileURLToPath(new URL('../../public/flags/', import.meta.url));
    const countries = new Set<string>();
    for (const dir of [fileURLToPath(new URL('../../../data/providers/', import.meta.url))]) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        countries.add((JSON.parse(readFileSync(dir + f, 'utf8')) as { country: string }).country);
      }
    }
    for (const p of data.providers) countries.add(p.country);
    for (const c of countries) {
      expect(existsSync(`${flags}${c.toLowerCase()}.svg`), c).toBe(true);
    }
    expect(readFileSync(`${flags}LICENSE.txt`, 'utf8')).toContain('The MIT License');
  });
});
