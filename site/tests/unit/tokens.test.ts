// tokens.css must carry every token of src/styles/design/tokens.json, light and dark.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import tokens from '../../src/styles/design/tokens.json';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

/** Custom properties declared in the first block whose selector matches `selector`. */
function block(selector: RegExp): Map<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`no block for ${selector}`);
  const body = css.slice(m.index + m[0].length, css.indexOf('}', m.index + m[0].length));
  return new Map(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((d) => [
      d[1] ?? '',
      (d[2] ?? '').replace(/\s+/g, ' ').trim(),
    ]),
  );
}

const light = block(/^:root \{/m);
const systemDark = block(/:root:not\(\[data-theme='light'\]\) \{/);
const forcedDark = block(/^:root\[data-theme='dark'\] \{/m);

describe('tokens.css', () => {
  it('has every colour token in light, system-dark and forced-dark', () => {
    for (const t of tokens.color.tokens) {
      expect(light.get(t.name), t.name).toBe(t.value.light);
      expect(systemDark.get(t.name), t.name).toBe(t.value.dark);
      expect(forcedDark.get(t.name), t.name).toBe(t.value.dark);
    }
  });

  it('has the font families, spacing and radii', () => {
    // tokens.json families, with the metric-adjusted fallbacks (fonts.css) after the web font
    const withFallback = (family: string, fallbacks: string[]) =>
      family.replace(
        /^("[^"]+"), /,
        (_, first) => `${first}, ${fallbacks.map((f) => `"${f}"`).join(', ')}, `,
      );
    expect(light.get('font-sans')?.replaceAll("'", '"')).toBe(
      withFallback(tokens.type.families.sans, ['Instrument Sans Fallback']),
    );
    expect(light.get('font-mono')?.replaceAll("'", '"')).toBe(
      withFallback(tokens.type.families.mono, [
        'Spline Sans Mono Fallback',
        'Spline Sans Mono Fallback Consolas',
      ]),
    );
    const fonts = readFileSync(new URL('../../src/styles/fonts.css', import.meta.url), 'utf8');
    for (const f of [
      'Instrument Sans Fallback',
      'Spline Sans Mono Fallback',
      'Spline Sans Mono Fallback Consolas',
    ]) {
      expect(fonts, f).toContain(`font-family: '${f}';`);
    }
    for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens]) {
      expect(light.get(t.name), t.name).toBe(t.value);
    }
  });

  it('loads no font from a foreign origin', () => {
    const fonts = readFileSync(new URL('../../src/styles/fonts.css', import.meta.url), 'utf8');
    const urls = [...fonts.matchAll(/url\(['"]?([^'")]+)/g)].map((m) => m[1]);
    expect(urls.length).toBe(4);
    for (const u of urls) expect(u).toMatch(/^\/fonts\/[a-z-]+\.woff2$/);
    // fallbacks only from local fonts
    for (const m of fonts.matchAll(/src:([^;]+);/g)) expect(m[1]).toMatch(/url\(|local\(/);
    expect(fonts).not.toMatch(/@import|googleapis|gstatic/);
  });
});
