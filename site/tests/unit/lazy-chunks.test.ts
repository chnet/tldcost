// Guards of the stubbed Vite preload helper (astro.config.mjs): check-build.mjs fails when Vite's
// own helper is back in the build, or when a lazy chunk needs CSS that a page loading it does not
// link (the stub loads no CSS).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lazyChunkFindings } from '../check-lazy-chunks.mjs';

/** A build output with the given files (paths relative to dist). */
function dist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tldcost-dist-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const page = (css: string[]) =>
  '<!doctype html><html><head>' +
  css.map((c) => `<link rel="stylesheet" href="/_astro/${c}">`).join('') +
  '</head><body><astro-island component-url="/_astro/Table.a1.js" renderer-url="/_astro/client.b2.js"></astro-island></body></html>';

// as Vite writes it: the importer lists the lazy chunk's dependencies in __vite__mapDeps
const table = (deps: string[]) =>
  'import{k as e}from"./shared.c3.js";' +
  `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=[${deps.map((d) => `"_astro/${d}"`).join(',')}])))=>i.map(i=>d[i]);` +
  'e(()=>import(`./History.d4.js`),__vite__mapDeps([0,1]));';

const build = (over: Record<string, string> = {}) =>
  dist({
    'index.html': page(['shared.e5.css']),
    'api/index.html': '<!doctype html><p>no scripts</p>',
    '_astro/Table.a1.js': table(['History.d4.js', 'shared.c3.js', 'shared.e5.css']),
    '_astro/client.b2.js': 'export default 1;',
    '_astro/shared.c3.js': 'export const k=1;',
    '_astro/History.d4.js': 'import{k}from"./shared.c3.js";export default k;',
    '_astro/preload-helper.f6.js': 'export const __vitePreload = (load) => load();',
    ...over,
  });

describe('lazyChunkFindings', () => {
  it('stub in effect, the lazy CSS is linked on the page: no findings', () => {
    expect(lazyChunkFindings(build())).toEqual([]);
  });

  it("Vite's own preload helper in any script: the stub is not in effect", () => {
    const helper =
      'export const __vitePreload=function(e,t){window.dispatchEvent(new Event("vite:preloadError"))}';
    expect(lazyChunkFindings(build({ '_astro/preload-helper.f6.js': helper }))).toEqual([
      "_astro/preload-helper.f6.js: Vite's own preload helper is in the build, the stub is not in effect",
    ]);
  });

  it('a lazy chunk with CSS of its own: fails with the fix in the message', () => {
    const f = lazyChunkFindings(
      build({
        '_astro/Table.a1.js': table(['History.d4.js', 'shared.c3.js', 'History.g7.css']),
      }),
    );
    expect(f).toEqual([
      'index.html: lazy chunk needs CSS _astro/History.g7.css (dynamic import in _astro/Table.a1.js), not linked on the page: remove the preload-helper stub in astro.config.mjs (or link the CSS on these pages)',
    ]);
  });

  it('also through static imports, and only on pages that load the importer', () => {
    const f = lazyChunkFindings(
      build({
        'index.html': page([]),
        // the island entry imports the script with the dynamic import
        '_astro/Table.a1.js': 'import"./Inner.h8.js";',
        '_astro/Inner.h8.js': table(['History.d4.js', 'shared.e5.css']),
      }),
    );
    expect(f).toEqual([
      expect.stringMatching(/^index\.html: lazy chunk needs CSS _astro\/shared\.e5\.css /),
    ]);
  });

  it('a dependency list in another form: fails closed instead of finding nothing', () => {
    const other = {
      // dynamic import, the list written differently (no m.f=[...])
      dynamic:
        'const deps=["_astro/History.d4.js","_astro/History.g7.css"];e(()=>import(`./History.d4.js`),deps);',
      // __vite__mapDeps without a readable list
      mapDeps:
        'const __vite__mapDeps=(i)=>i.map((i)=>LIST[i]);e(()=>load("History"),__vite__mapDeps([0]));',
    };
    for (const [kind, source] of Object.entries(other)) {
      expect(lazyChunkFindings(build({ '_astro/Table.a1.js': source })), kind).toEqual([
        '_astro/Table.a1.js: cannot parse mapDeps: Vite codegen changed? (dynamic import without a readable dependency list)',
      ]);
    }
  });

  it('no _astro directory: nothing to check', () => {
    expect(lazyChunkFindings(dist({ 'index.html': '<p>x</p>' }))).toEqual([]);
  });
});
