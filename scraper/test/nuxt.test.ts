import { describe, expect, it } from 'vitest';
import { devalueResolver, extractNuxtData } from '../src/nuxt.js';

describe('extractNuxtData', () => {
  it('reads the payload script', () => {
    expect(
      extractNuxtData(
        '<script type="application/json" id="__NUXT_DATA__" nonce="n">[1,"a"]</script>',
      ),
    ).toEqual([1, 'a']);
  });
  it('throws without payload or with a non-array payload', () => {
    expect(() => extractNuxtData('<html></html>')).toThrow(/no __NUXT_DATA__/);
    expect(() => extractNuxtData('<script id="__NUXT_DATA__">{"a":1}</script>')).toThrow(
      /not a devalue array/,
    );
  });
});

describe('devalueResolver', () => {
  it('resolves indexes, reactive wrappers, tags, negatives and cycles', () => {
    const data = [
      ['ShallowReactive', 1], // 0
      { list: 2, when: 5, self: 1, gone: -1 }, // 1
      [3, 4, 3], // 2
      'x', // 3
      ['Ref', 6], // 4
      ['Date', '2026-11-13T00:00:00Z'], // 5
      42, // 6
    ];
    const resolve = devalueResolver(data);
    const root = resolve(0) as Record<string, unknown>;
    expect(root.list).toEqual(['x', 42, 'x']);
    expect(root.when).toEqual(['Date', '2026-11-13T00:00:00Z']);
    expect(root.self).toBe(root);
    expect(root.gone).toBeUndefined();
    expect(resolve(4)).toBe(42);
    expect(resolve(4)).toBe(42); // memoised wrapper
    expect(resolve(5)).toBe(resolve(5));
    expect(resolve(2)).toBe(resolve(2));
  });
});
