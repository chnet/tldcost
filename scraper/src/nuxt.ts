// Reads the Nuxt SSR payload (<script id="__NUXT_DATA__">, devalue format): a flat JSON array where
// objects and arrays hold indexes into that array, and reactive wrappers are ["Reactive", i] etc.

const WRAPPERS = new Set([
  'Reactive',
  'ShallowReactive',
  'Ref',
  'ShallowRef',
  'EmptyRef',
  'EmptyShallowRef',
]);

/** The raw devalue array of the page, or throws if the page has no Nuxt payload. */
export function extractNuxtData(html: string): unknown[] {
  const m = /<script\b[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no __NUXT_DATA__ payload in page');
  const data: unknown = JSON.parse(m[1] as string);
  if (!Array.isArray(data)) throw new Error('__NUXT_DATA__ is not a devalue array');
  return data;
}

/** Lazy resolver for one devalue array: `resolve(i)` returns the plain value at index i. */
export function devalueResolver(data: readonly unknown[]): (index: number) => unknown {
  const memo = new Map<number, unknown>();
  const resolve = (index: number): unknown => {
    if (index < 0) return undefined; // -1 undefined, -2 hole, -3.. NaN/Infinity: never prices
    if (memo.has(index)) return memo.get(index);
    const raw = data[index];
    if (Array.isArray(raw)) {
      if (typeof raw[0] === 'string') {
        if (WRAPPERS.has(raw[0])) {
          const inner = resolve(raw[1] as number);
          memo.set(index, inner);
          return inner;
        }
        memo.set(index, raw); // other tags (Date, Set, Map, ...): kept raw, not needed here
        return raw;
      }
      const out: unknown[] = [];
      memo.set(index, out);
      for (const i of raw) out.push(resolve(i as number));
      return out;
    }
    if (raw !== null && typeof raw === 'object') {
      const out: Record<string, unknown> = {};
      memo.set(index, out);
      for (const [k, i] of Object.entries(raw)) out[k] = resolve(i as number);
      return out;
    }
    memo.set(index, raw);
    return raw;
  };
  return resolve;
}
