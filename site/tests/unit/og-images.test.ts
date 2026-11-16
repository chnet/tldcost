// The Open Graph images (public/og/, rendered by scripts/og-images.mjs): one PNG per language,
// 1200 × 630, small enough for link previews.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe.each(['de', 'en'])('public/og/%s.png', (lang) => {
  const png = readFileSync(new URL(`../../public/og/${lang}.png`, import.meta.url));
  it('is a PNG of 1200 × 630', () => {
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
  it('stays under 300 KB', () => {
    expect(png.length).toBeLessThan(300 * 1024);
  });
});
