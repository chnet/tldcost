import { fileURLToPath } from 'node:url';
import { computeTco, effectiveContract } from '@tldcost/core';
import { loadData } from '@tldcost/core/load';
import { describe, expect, it } from 'vitest';
import { COLUMN_IDS } from '../../src/lib/columns';
import { buildPayload, NOTE_VAT_NOT_STATED } from '../../src/lib/rows';
import { footnotes, orderedRows, sortableRows } from '../../src/lib/view';
import { defaultState } from '../../src/lib/url-state';

const FIXTURES = fileURLToPath(new URL('../fixtures/data', import.meta.url));
const data = loadData(FIXTURES);
const payload = buildPayload(data);

describe('buildPayload', () => {
  it('has the TLDs in concept order and rows sorted by key', () => {
    expect(payload.tlds).toEqual(['de', 'com', 'io']);
    const keys = payload.rows.map((r) => r.key);
    expect(keys).toEqual([...keys].sort());
  });

  it('takes every amount from @tldcost/core (no own price maths)', () => {
    for (const offer of data.offers) {
      const provider = data.providers.find((p) => p.id === offer.provider);
      const row = payload.rows.find((r) => r.key === `${offer.provider}/${offer.tld}`);
      if (!provider || !row || offer.currency !== 'EUR') continue;
      for (const mode of ['gross', 'net'] as const) {
        const t3 = computeTco(offer, 3, { mode, provider });
        expect(row[mode].sum_3y).toBe(t3.sum);
        expect(row[mode].year1).toBe(t3.perYear[0] ?? null);
      }
      const c = effectiveContract(offer, provider);
      expect(row.common.notice_days).toBe(c.notice_period_days);
    }
  });

  it('offer.contract wins, provider.terms fills the gaps', () => {
    const fox = payload.rows.find((r) => r.key === 'foxtrot/de');
    expect(fox?.common.notice_days).toBe(14); // only in provider.terms
  });

  it('converts USD with the ECB rate and adds a footnote with the rate date', () => {
    const echo = payload.rows.find((r) => r.key === 'echo/de');
    expect(echo?.gross.year1).toBe(Math.round(600 / 1.0834));
    expect(echo?.notes).toContain('fx-USD-2026-11-11');
    expect(payload.notes['fx-USD-2026-11-11']).toContain('11.11.2026');
    expect(echo?.notes).toContain(NOTE_VAT_NOT_STATED);
    expect(echo?.gross.sum_3y).toBe(echo?.net.sum_3y); // no VAT statement: same in both modes
  });

  it('provider vat_rate null (non-EU): no VAT statement as stated, stated VAT without rate unknown', () => {
    const provider = { ...data.providers.find((p) => p.id === 'echo')!, vat_rate: null };
    const offer = data.offers.find((o) => o.provider === 'echo' && o.tld === 'com')!;
    const stated = payload.rows.find((r) => r.key === 'echo/com')!;
    const asStated = buildPayload({ providers: [provider], offers: [offer], fx: data.fx }).rows[0];
    expect(asStated?.gross).toEqual(stated.gross);
    expect(asStated?.net).toEqual(stated.net);
    const net = buildPayload({
      providers: [provider],
      offers: [{ ...offer, vat_included: false }],
      fx: data.fx,
    }).rows[0];
    expect(net?.gross.renewal).toBeNull();
    expect(net?.gross.sum_3y).toBeNull();
    expect(net?.net.renewal).toBe(stated.net.renewal);
  });

  it('marks the operator in the provider metadata only, never in a row', () => {
    expect(payload.providers['charlie']?.operator).toBe(true);
    expect(payload.providers['bravo']?.operator).toBe(false);
    for (const r of payload.rows) expect(JSON.stringify(r)).not.toContain('operator');
  });

  it('the rows handed to sortRows carry no operator information', () => {
    for (const tld of payload.tlds) {
      for (const r of sortableRows(payload, tld, 'gross')) {
        expect(Object.keys(r).sort()).toEqual(['key', 'providerId', 'values']);
        expect(Object.keys(r.values).every((k) => k !== 'operator')).toBe(true);
      }
    }
  });

  it('empty data gives an empty payload', () => {
    const empty = buildPayload({ providers: [], offers: [], fx: [] });
    expect(empty).toEqual({ version: 1, tlds: [], providers: {}, rows: [], notes: {} });
  });
});

describe('view', () => {
  it('default view: .de by sum_3y ascending, operator not first, nulls last', () => {
    const order = orderedRows(payload, defaultState({ tlds: payload.tlds })).map(
      (v) => v.row.providerId,
    );
    expect(order[0]).toBe('alpha');
    expect(order.at(-1)).toBe('delta'); // sum_3y unknown
    expect(order.indexOf('bravo')).toBeLessThan(order.indexOf('charlie')); // tie: id asc
  });

  it('numbers footnotes in first-use order', () => {
    const rows = orderedRows(payload, { ...defaultState({ tlds: payload.tlds }), tld: 'com' });
    const notes = footnotes(rows);
    expect([...notes.values()]).toEqual([...Array(notes.size).keys()].map((i) => i + 1));
  });

  it('every column id exists in the row values or is a known gap', () => {
    const r = sortableRows(payload, 'de', 'gross')[0];
    for (const id of COLUMN_IDS) expect(r?.values).toHaveProperty(id);
  });
});
