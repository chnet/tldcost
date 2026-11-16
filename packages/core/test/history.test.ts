import { describe, expect, it } from 'vitest';
import { appendHistory, priceState, samePriceState, type Offer } from '../src/index.js';
import { offer } from './fixtures.js';

/** The offer as seen on `day` (evidence.fetched_at). */
const seen = (day: string, price: Parameters<typeof offer>[0] = {}, rest: Partial<Offer> = {}) => {
  const o = offer(price, rest);
  return { ...o, evidence: { ...o.evidence, fetched_at: `${day}T10:00:00Z` } };
};
const dates = (h: { entries: { date: string }[] }) => h.entries.map((e) => e.date);

describe('price history', () => {
  it('seeds one entry from the offer: stated amounts, missing transfer_in as null, evidence as source', () => {
    const { history, changed } = appendHistory(undefined, seen('2026-11-16'));
    expect(changed).toBe(true);
    expect(history).toEqual({
      schema_version: 1,
      provider: 'example-registrar',
      tld: 'de',
      entries: [
        {
          date: '2026-11-16',
          currency: 'EUR',
          vat_included: true,
          unit: 'year',
          setup: 0,
          year1: 504,
          renewal: 504,
          transfer_in: null,
          source: {
            url: 'https://registrar.example/prices',
            fetched_at: '2026-11-16T10:00:00Z',
          },
        },
      ],
    });
    // an empty entry list counts as no history
    expect(
      appendHistory({ ...history, entries: [] }, seen('2026-11-17')).history.entries,
    ).toHaveLength(1);
  });

  it('no change, no entry: the same object comes back, even with newer evidence', () => {
    const { history } = appendHistory(undefined, seen('2026-11-16'));
    const again = appendHistory(history, seen('2026-12-01'));
    expect(again.changed).toBe(false);
    expect(again.history).toBe(history);
  });

  it('a price change appends an entry dated with the fetch day', () => {
    const { history } = appendHistory(undefined, seen('2026-11-16'));
    const next = appendHistory(history, seen('2026-11-23', { renewal: 590, transfer_in: 100 }));
    expect(next.changed).toBe(true);
    expect(dates(next.history)).toEqual(['2026-11-16', '2026-11-23']);
    expect(next.history.entries[1]).toMatchObject({ renewal: 590, transfer_in: 100 });
    expect(history.entries).toHaveLength(1); // not mutated
  });

  it('a second change on the same day replaces that day; back to the state before drops it', () => {
    let h = appendHistory(undefined, seen('2026-11-16')).history;
    h = appendHistory(h, seen('2026-11-23', { renewal: 590 })).history;
    h = appendHistory(h, seen('2026-11-23', { renewal: 600 })).history;
    expect(dates(h)).toEqual(['2026-11-16', '2026-11-23']);
    expect(h.entries[1]?.renewal).toBe(600);
    const back = appendHistory(h, seen('2026-11-23'));
    expect(back.changed).toBe(true);
    expect(dates(back.history)).toEqual(['2026-11-16']);
  });

  it('another currency, price unit or VAT mode is an error: the history is never dropped', () => {
    const h = appendHistory(undefined, seen('2026-11-16')).history;
    for (const o of [
      seen('2026-11-23', {}, { currency: 'USD' }),
      seen('2026-11-23', { unit: 'month', year1: 42, renewal: 42 }),
      seen('2026-11-23', {}, { vat_included: false }),
    ]) {
      expect(() => appendHistory(h, o)).toThrow(
        /example-registrar\/de: currency, price unit or VAT mode changed \(EUR\/year\/vat_included true -> .*\); the history is kept and not continued.*delete data\/history\/example-registrar\/de\.json in a visible commit/,
      );
    }
    expect(h.entries).toHaveLength(1);
  });

  it('evidence older than the last entry is an error', () => {
    const h = appendHistory(undefined, seen('2026-11-16')).history;
    expect(() => appendHistory(h, seen('2026-11-10', { renewal: 590 }))).toThrow(
      /example-registrar\/de: evidence.fetched_at 2026-11-10 is older than the last history entry 2026-11-16/,
    );
  });

  it('priceState and samePriceState compare the state fields only', () => {
    const a = priceState(seen('2026-11-16'));
    expect(samePriceState(a, priceState(seen('2026-12-01')))).toBe(true);
    expect(samePriceState(a, priceState(seen('2026-11-16', { setup: 100 })))).toBe(false);
  });
});
