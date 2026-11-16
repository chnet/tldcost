import { describe, expect, it } from 'vitest';
import { evidenceHash } from '../src/evidence.js';
import { formatEuroDe, toCents } from '../src/money.js';
import { isoSeconds } from '../src/tlds.js';

describe('toCents', () => {
  it('converts decimal strings and numbers without float maths', () => {
    expect(toCents('2.90')).toBe(290);
    expect(toCents('12.5')).toBe(1250);
    expect(toCents(' 7 ')).toBe(700);
    expect(toCents(0.42)).toBe(42);
    expect(toCents(28.12)).toBe(2812);
    expect(toCents('0.07')).toBe(7);
  });
  it('rejects anything but a plain non-negative decimal', () => {
    for (const bad of ['', '-1', '1,50', 'abc', '1.', '.5', '1e3'])
      expect(() => toCents(bad)).toThrow(RangeError);
    expect(() => toCents(-1)).toThrow(RangeError);
    expect(() => toCents(1e21)).toThrow(RangeError);
    expect(() => toCents('99999999999999999')).toThrow(/out of range/);
  });
  it('throws on more than two decimals unless rounding is allowed (half up)', () => {
    expect(() => toCents(26.8908)).toThrow(/more than two decimals/);
    expect(toCents(26.8908, { exact: false })).toBe(2689);
    expect(toCents('1.004', { exact: false })).toBe(100);
    expect(toCents('1.005', { exact: false })).toBe(101);
  });
});

describe('formatEuroDe', () => {
  it('formats cents in German notation', () => {
    expect(formatEuroDe(42)).toBe('0,42');
    expect(formatEuroDe(179)).toBe('1,79');
    expect(formatEuroDe(0)).toBe('0,00');
    expect(formatEuroDe(1234567)).toBe('12.345,67');
  });
});

describe('evidenceHash / isoSeconds', () => {
  it('hashes bodies as sha256:<hex>', () => {
    expect(evidenceHash('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(evidenceHash(new TextEncoder().encode('abc'))).toBe(evidenceHash('abc'));
  });
  it('drops milliseconds', () => {
    expect(isoSeconds(new Date('2026-11-13T06:00:00.123Z'))).toBe('2026-11-13T06:00:00Z');
  });
});
