import { describe, expect, it } from 'vitest';
import { DEFAULT_COLUMNS } from '../../src/lib/columns';
import { canonicalCols, defaultState, parse, serialize } from '../../src/lib/url-state';

const ctx = { tlds: ['de', 'com', 'io'] };

describe('url state', () => {
  it('empty query = default view; default view = empty query', () => {
    expect(parse('', ctx)).toEqual(defaultState(ctx));
    expect(serialize(defaultState(ctx), ctx)).toBe('');
  });

  it('falls back to .de, else to the first TLD with data', () => {
    expect(defaultState(ctx).tld).toBe('de');
    expect(defaultState({ tlds: ['com', 'io'] }).tld).toBe('com');
  });

  it('invalid values fall back to the defaults and never throw', () => {
    const s = parse('?tld=nope&sort=__proto__&dir=up&cols=x,y&vat=both', ctx);
    expect(s).toEqual(defaultState(ctx));
  });

  it('writes parameters in a fixed order and leaves defaults out', () => {
    const s = parse('?vat=net&dir=desc&tld=.IO&sort=year1', ctx);
    expect(serialize(s, ctx)).toBe('?tld=io&sort=year1&dir=desc&vat=net');
  });

  it('cols: deduplicated, known ids only, display order, provider implicit', () => {
    expect(canonicalCols(['sum_5y', 'year1', 'year1', 'bogus', 'provider'])).toEqual([
      'provider',
      'year1',
      'sum_5y',
    ]);
    const s = parse('?cols=sum_5y,year1,bogus', ctx);
    expect(serialize(s, ctx)).toBe('?cols=year1,sum_5y');
  });

  it('cols equal to the desktop default are not written', () => {
    const q = `?cols=${DEFAULT_COLUMNS.filter((c) => c !== 'provider').join(',')}`;
    expect(parse(q, ctx).cols).toBeNull();
  });

  it('serialize(parse(x)) is a fixed point', () => {
    for (const q of ['?sort=notice_days&dir=desc', '?tld=com&vat=net', '?cols=api,year2']) {
      const once = serialize(parse(q, ctx), ctx);
      expect(serialize(parse(once, ctx), ctx)).toBe(once);
    }
  });
});
