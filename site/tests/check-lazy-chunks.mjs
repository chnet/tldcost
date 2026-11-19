// Guards for the stubbed Vite preload helper (astro.config.mjs, tldcost:minimal-preload-helper).
// Vite's own helper preloads the dependencies of a lazily imported chunk, loads its CSS and fires
// vite:preloadError; the stub only calls the import. That is safe only while
//   - the stub is in effect: no built script carries Vite's helper (its 'vite:preloadError' event);
//   - every CSS file a dynamic import depends on (Vite's __vite__mapDeps list in the importing
//     script) is already linked as a stylesheet on every page that loads that script, so nothing
//     the stub skips is missing. A lazy chunk with CSS of its own fails here.
// Used by check-build.mjs on the built output; site/tests/unit/lazy-chunks.test.ts covers it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const HELPER_MARKER = 'vite:preloadError';
const FIX = 'remove the preload-helper stub in astro.config.mjs (or link the CSS on these pages)';

function files(dir, ext) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => join(d.parentPath, d.name));
}

/** `_astro/x.js` files a built script imports statically. */
function staticImports(source) {
  return [
    ...source.matchAll(/\bimport\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g),
  ].map((m) => `_astro/${m[1]}`);
}

/** CSS files in the dependency lists of a script's dynamic imports (Vite's __vite__mapDeps). */
function lazyCssDeps(source) {
  return [...source.matchAll(/m\.f=\[([^\]]*)\]/g)].flatMap((m) =>
    [...(m[1] ?? '').matchAll(/["']([^"']+\.css)["']/g)].map((c) => c[1] ?? ''),
  );
}

/** Findings for one build output directory; empty when all is well. */
export function lazyChunkFindings(dist) {
  const out = [];
  const astro = join(dist, '_astro');
  if (!existsSync(astro)) return out;
  const rel = (f) => relative(dist, f).split(sep).join('/');
  const scripts = new Map(files(astro, '.js').map((f) => [rel(f), readFileSync(f, 'utf8')]));

  for (const [name, source] of scripts) {
    if (source.includes(HELPER_MARKER)) {
      out.push(`${name}: Vite's own preload helper is in the build, the stub is not in effect`);
    }
  }

  const closure = (start) => {
    const seen = new Set();
    const queue = [...start];
    while (queue.length) {
      const f = queue.pop();
      if (seen.has(f) || !scripts.has(f)) continue;
      seen.add(f);
      queue.push(...staticImports(scripts.get(f) ?? ''));
    }
    return seen;
  };
  for (const page of files(dist, '.html')) {
    const html = readFileSync(page, 'utf8');
    const entries = [
      ...html.matchAll(/(?:component-url|renderer-url|src)="\/(_astro\/[^"]+\.js)"/g),
    ].map((m) => m[1] ?? '');
    const linked = new Set(
      [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/([^"]+\.css)"/g)].map(
        (m) => m[1],
      ),
    );
    for (const script of closure(entries)) {
      for (const css of lazyCssDeps(scripts.get(script) ?? '')) {
        if (!linked.has(css)) {
          out.push(
            `${rel(page)}: lazy chunk needs CSS ${css} (dynamic import in ${script}), not linked on the page: ${FIX}`,
          );
        }
      }
    }
  }
  return out;
}
