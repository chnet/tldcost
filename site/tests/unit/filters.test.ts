// Archiv-Issue 76 column filters: URL parameter f, matching, texts, and tc-best per owner decision B.
import { fileURLToPath } from 'node:url';
import { loadData } from '@tldcost/core/load';
import { DE } from '../../src/i18n/de';
import { describe, expect, it } from 'vitest';
import { COLUMN_BY_ID, COLUMN_IDS, DEFAULT_COLUMNS } from '../../src/lib/columns';
import {
  filterKind,
  filterValueText as fvt,
  keepVisible,
  matches,
  normalizeText,
  parseFilters,
  parseIntInput,
  pickToken,
  serializeFilters,
  type Filter,
} from '../../src/lib/filters';
import { pickOptions } from '../../src/components/FilterControl';
import { buildPayload } from '../../src/lib/rows';
import { defaultState, parse, serialize } from '../../src/lib/url-state';
import { bestCells, bestForView, filtersActive, orderedRows } from '../../src/lib/view';

const col = (id: string) => COLUMN_BY_ID.get(id)!;
const NOW = Date.parse('2026-11-15T12:00:00Z');
const payload = buildPayload(
  loadData(fileURLToPath(new URL('../fixtures/data', import.meta.url))),
  { today: '2026-11-15' },
);
const ctx = { tlds: payload.tlds };
const state = (patch: Partial<ReturnType<typeof defaultState>> = {}) => ({
  ...defaultState(ctx),
  ...patch,
});
const ids = (rows: { row: { providerId: string } }[]) => rows.map((r) => r.row.providerId);

describe('filter kinds', () => {
  it('follow the column kind; Land is a picker and not sortable', () => {
    expect(filterKind(col('payment'))).toBe('text');
    expect(filterKind(col('ssl_free'))).toBe('pick');
    expect(filterKind(col('whois_privacy'))).toBe('pick');
    expect(filterKind(col('country'))).toBe('pick');
    expect(filterKind(col('year1'))).toBe('range');
    expect(filterKind(col('sum_3y'))).toBe('range');
    expect(filterKind(col('notice_days'))).toBe('range');
    expect(filterKind(col('fetched_at'))).toBe('age');
    expect(col('country').sortable).toBe(false);
    expect(parse('?sort=country', ctx).sort).toBe('sum_3y');
  });
});

describe('URL parameter f', () => {
  it('round-trips every kind, in column order, money in cents', () => {
    const raw =
      'year1:100..600;country:DE;ssl_free:ja,na;payment:sepa;fetched_at:7;notice_days:..30,-na';
    const f = parseFilters(raw);
    expect(f).toEqual({
      year1: { kind: 'range', min: 100, max: 600, na: true },
      country: { kind: 'pick', values: ['DE'] },
      ssl_free: { kind: 'pick', values: ['ja', 'na'] },
      payment: { kind: 'text', text: 'sepa' },
      fetched_at: { kind: 'age', days: 7 },
      notice_days: { kind: 'range', min: null, max: 30, na: false },
    });
    expect(serializeFilters(f, COLUMN_IDS)).toBe(
      'country:DE;year1:100..600;notice_days:..30,-na;ssl_free:ja,na;payment:sepa;fetched_at:7',
    );
  });

  it('drops unknown columns, the provider column, bad specs and duplicates', () => {
    expect(
      parseFilters(
        'nope:1;provider:x;year1:abc;year1:5..1;fetched_at:3;country:<b>;payment:;ssl_free:ja;ssl_free:nein',
      ),
    ).toEqual({ ssl_free: { kind: 'pick', values: ['ja'] } });
    expect(parseFilters('year1:..')).toEqual({});
    expect(parseFilters('year1:..,-na')).toEqual({
      year1: { kind: 'range', min: null, max: null, na: false },
    });
    expect(parseFilters('country:-')).toEqual({ country: { kind: 'pick', values: [] } });
    expect(parseFilters(null)).toEqual({});
  });

  it('is part of the view URL, readable, and only for visible columns', () => {
    const s = parse('?f=country:DE;year1:..600', ctx);
    expect(s.f).toEqual({
      country: { kind: 'pick', values: ['DE'] },
      year1: { kind: 'range', min: null, max: 600, na: true },
    });
    expect(serialize(s, ctx)).toBe('?f=country:DE;year1:..600');
    // transfer_in is not a default column: its filter is dropped (hidden column, cleared)
    expect(parse('?f=transfer_in:..100', ctx).f).toEqual({});
    expect(parse('?cols=transfer_in&f=transfer_in:..100', ctx).f).toEqual({
      transfer_in: { kind: 'range', min: null, max: 100, na: true },
    });
    expect(keepVisible({ year1: { kind: 'age', days: 7 } as Filter }, ['provider'])).toEqual({});
    expect(
      serialize(
        state({ f: { year3: { kind: 'range', min: 1, max: null, na: true } } }),
        ctx,
        '?theme=dark',
      ),
    ).toBe('?f=year3:1..&theme=dark');
    expect(DEFAULT_COLUMNS).toContain('country');
  });
});

describe('matching', () => {
  it('keeps k. A. unless it is excluded explicitly', () => {
    const range = (na: boolean): Filter => ({ kind: 'range', min: 100, max: 600, na });
    expect(matches(range(true), null, NOW)).toBe(true);
    expect(matches(range(false), null, NOW)).toBe(false);
    expect(matches(range(true), 600, NOW)).toBe(true);
    expect(matches(range(true), 601, NOW)).toBe(false);
    expect(matches({ kind: 'text', text: 'pay' }, null, NOW)).toBe(true);
    expect(matches({ kind: 'text', text: 'PAY' }, 'sepa, paypal', NOW)).toBe(true);
    expect(matches({ kind: 'text', text: 'card' }, 'sepa', NOW)).toBe(false);
    // a comma in the filter is stored as a space and matched the same way in the cell
    const sepaPaypal = parseFilters('payment:sepa, paypal').payment!;
    expect(sepaPaypal).toEqual({ kind: 'text', text: 'sepa paypal' });
    expect(matches(sepaPaypal, 'SEPA, PayPal', NOW)).toBe(true);
    expect(matches(sepaPaypal, 'SEPA; Kreditkarte', NOW)).toBe(false);
    const pick: Filter = { kind: 'pick', values: ['ja', 'na'] };
    expect([true, false, null].map((v) => matches(pick, v, NOW))).toEqual([true, false, true]);
    expect(matches({ kind: 'pick', values: ['DE'] }, 'US', NOW)).toBe(false);
    expect(matches({ kind: 'age', days: 7 }, '2026-11-10T00:00:00Z', NOW)).toBe(true);
    expect(matches({ kind: 'age', days: 7 }, '2026-11-01T00:00:00Z', NOW)).toBe(false);
    expect(pickToken('n/a')).toBe('n/a');
  });

  it('filters after sorting: the order of the remaining rows never changes', () => {
    for (const tld of payload.tlds) {
      const all = ids(orderedRows(payload, state({ tld }), NOW));
      const de = ids(
        orderedRows(payload, state({ tld, f: { country: { kind: 'pick', values: ['DE'] } } }), NOW),
      );
      expect(de).toEqual(all.filter((id) => de.includes(id)));
      expect(de).not.toContain('echo'); // echo is the US provider
    }
  });
});

describe('kostenpflichtig (Archiv-Issue 124)', () => {
  it('payable bool columns offer ja, kostenpflichtig, nein, k. A.; other bool columns no "paid"', () => {
    expect(pickOptions(col('dns_editor'), [], () => 0)).toEqual(['ja', 'paid', 'nein', 'na']);
    expect(pickOptions(col('email_fwd'), [], () => 0)).toEqual(['ja', 'paid', 'nein', 'na']);
    expect(pickOptions(col('two_factor'), [], () => 0)).toEqual(['ja', 'nein', 'na']);
    expect(pickOptions(col('auto_renew'), [], () => 0)).toEqual(['ja', 'nein', 'na']);
  });

  it('"paid" is its own pick token, round-trips in the URL and filters the rows', () => {
    expect(pickToken('paid')).toBe('paid');
    expect(pickToken(true)).toBe('ja');
    const f = parseFilters('email_fwd:ja,paid');
    expect(f).toEqual({ email_fwd: { kind: 'pick', values: ['ja', 'paid'] } });
    expect(serializeFilters(f, COLUMN_IDS)).toBe('email_fwd:ja,paid');
    const only = (values: string[]) =>
      ids(orderedRows(payload, state({ f: { email_fwd: { kind: 'pick', values } } }), NOW));
    expect(only(['paid'])).toEqual(['bravo']);
    expect(only(['nein'])).not.toContain('bravo');
    expect(fvt(DE, col('email_fwd'), { kind: 'pick', values: ['ja', 'paid'] })).toBe(
      'ja, kostenpflichtig',
    );
  });
});

describe('texts and inputs', () => {
  it('describe the active value', () => {
    const names = { DE: 'Deutschland' };
    // Intl puts a no-break space before €; compare with plain spaces
    const filterValueText = (
      ...a: Parameters<typeof fvt> extends [unknown, ...infer R] ? R : never
    ) => fvt(DE, ...a).replace(/\u00a0/g, ' ');
    expect(filterValueText(col('year1'), { kind: 'range', min: null, max: 600, na: true })).toBe(
      'bis 6,00 €',
    );
    expect(filterValueText(col('year1'), { kind: 'range', min: 100, max: 600, na: false })).toBe(
      '1,00 € bis 6,00 €, ohne k. A.',
    );
    expect(
      filterValueText(col('notice_days'), { kind: 'range', min: 14, max: null, na: true }),
    ).toBe('ab 14 Tage');
    expect(filterValueText(col('country'), { kind: 'pick', values: ['DE', 'na'] }, names)).toBe(
      'DE, k. A.',
    );
    expect(filterValueText(col('whois_privacy'), { kind: 'pick', values: ['free'] })).toBe(
      'kostenlos',
    );
    expect(filterValueText(col('ssl_free'), { kind: 'pick', values: [] })).toBe('keine Auswahl');
    expect(filterValueText(col('payment'), { kind: 'text', text: 'sepa' })).toBe('enthält „sepa“');
    expect(filterValueText(col('fetched_at'), { kind: 'age', days: 30 })).toBe('≤ 30 Tage');
  });

  it('read German decimals and integers; invalid input is undefined, empty is null', () => {
    expect(DE.f.parseEuro('6')).toBe(600);
    expect(DE.f.parseEuro('6,5')).toBe(650);
    expect(DE.f.parseEuro(' 1.234,50 € ')).toBe(123450);
    expect(DE.f.parseEuro('')).toBeNull();
    expect(DE.f.parseEuro('6.5')).toBeUndefined();
    expect(DE.f.parseEuro('abc')).toBeUndefined();
    expect(DE.f.euroInput(650)).toBe('6,50');
    expect(parseIntInput('30')).toBe(30);
    expect(parseIntInput('')).toBeNull();
    expect(parseIntInput('3,5')).toBeUndefined();
    expect(normalizeText('  a;b:c,d  ')).toBe('a b c d');
  });
});

describe('tc-best per owner decision B', () => {
  it('without search or filter: over all rows of the TLD', () => {
    const s = state({ tld: 'com' });
    const rows = orderedRows(payload, s, NOW);
    const { cells, scope } = bestForView(payload, s, rows, NOW);
    expect(filtersActive(s)).toBe(false);
    expect(scope).toBe('all');
    expect([...cells].sort()).toEqual([...bestCells(rows)].sort());
  });

  it('with a filter (Land = DE hides the US row): over the shown rows, the marking moves', () => {
    const all = bestForView(
      payload,
      state({ tld: 'com' }),
      orderedRows(payload, state({ tld: 'com' }), NOW),
      NOW,
    );
    expect(all.cells.has('echo/com|year1')).toBe(true); // USD 10.00 at the ECB rate is the lowest
    const s = state({ tld: 'com', f: { country: { kind: 'pick', values: ['DE'] } } });
    const rows = orderedRows(payload, s, NOW);
    const filtered = bestForView(payload, s, rows, NOW);
    expect(filtered.scope).toBe('filtered');
    expect(filtered.cells.has('echo/com|year1')).toBe(false);
    expect(filtered.cells.has('bravo/com|year1')).toBe(true);
    expect(filtered.cells.has('charlie/com|year1')).toBe(true);
  });

  it('the search counts as a filter', () => {
    const s = state({ q: 'charlie' });
    expect(filtersActive(s)).toBe(true);
    const { cells, scope } = bestForView(payload, s, orderedRows(payload, s, NOW), NOW);
    expect(scope).toBe('filtered');
    expect(cells.has('charlie/de|year1')).toBe(true);
  });
});
