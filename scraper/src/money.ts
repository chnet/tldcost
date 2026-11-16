// Decimal price strings to integer cents without floating point maths (schema: integer cents).
import type { Cents } from '@tldcost/core';

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

export interface CentsOptions {
  /**
   * true (default): more than two decimals throw. false: round half up to cents (INWX lists some
   * net prices with four decimals, e.g. 26.8908, whose gross is a round 32.00).
   */
  exact?: boolean;
}

/** "12.5" / "2.90" / 0.42 -> 1250 / 290 / 42. Throws on anything but a plain non-negative decimal. */
export function toCents(value: string | number, opts: CentsOptions = {}): Cents {
  const text = typeof value === 'number' ? String(value) : value.trim();
  const m = DECIMAL.exec(text);
  if (!m) throw new RangeError(`not a non-negative decimal price: ${JSON.stringify(value)}`);
  const frac = m[2] ?? '';
  if (frac.length > 2 && opts.exact !== false) {
    throw new RangeError(`price has more than two decimals: ${text}`);
  }
  const cents = Number(m[1]) * 100 + Number(frac.slice(0, 2).padEnd(2, '0'));
  const roundUp = frac.length > 2 && Number(frac[2]) >= 5;
  const result = cents + (roundUp ? 1 : 0);
  if (!Number.isSafeInteger(result)) throw new RangeError(`price out of range: ${text}`);
  return result;
}

/** 1234567 -> "12.345,67" (German notation, as printed on German price pages). */
export function formatEuroDe(cents: Cents): string {
  const euros = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${euros},${String(cents % 100).padStart(2, '0')}`;
}
