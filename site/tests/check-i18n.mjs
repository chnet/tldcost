// Post-build checks of the English version (Archiv-Issue 33), called by check-build.mjs for every dist:
//   - every HTML page has <html lang> of its path (/en/... = en, else de);
//   - every indexed page has a canonical link to itself (never to the other language); noindex
//     pages (404, the /api/v1/ index) have none and no hreflang;
//   - every English page has a German twin (same path without /en); the home page, the portfolio
//     and every TLD page exist in both languages;
//   - a page with a twin carries hreflang de, en and x-default (= German) to both versions, the
//     same on both sides; a page without a twin carries none;
//   - English pages contain no German UI text: a list of German UI words must not occur outside
//     elements marked lang="de" (German data text is quoted there) and outside the island props;
//   - the English header links the English API page /en/api/;
//   - translation drift is shown correctly, in both directions: an English text page whose
//     source_sha256 matches the German file has no drift note (.tc-drift), one whose hash differs has
//     it. A stale translation never fails (owner decision: report only), only a wrong display does.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translationDrift } from '../src/lib/translation.ts';

/** The text pages (docs/pages/*.md, translations in docs/pages/en/), fixed for every build. */
export const DOCS_PAGES = join(dirname(fileURLToPath(import.meta.url)), '../../docs/pages');

const SITE = 'https://tldcost.io';
/** Routes that must exist in both languages (besides every TLD page). */
const BOTH = ['/', '/portfolio/'];
/** Pages that are never indexed: noindex, no canonical, no hreflang (Layout `noindex`). */
const NOINDEX = new Set(['/404.html', '/api/v1/']);
/** German UI words that never belong on an English page (outside lang="de"). */
const GERMAN =
  /\b(Anbieter|Anbietern|Summe|Verlängerung|Kündigungsfrist|Mindestlaufzeit|brutto|netto|Preise|Jahre|Einrichtung|Fußnote|Datenstand|Aktionspreis|Bedingungen|kostenlos|entfällt|angegeben|Vertrag|Beleg|Quelle|melden|zurücksetzen|Spalten|sortiert|aufsteigend|absteigend|hervorgehoben|Inhalt|Hauptnavigation|Farbschema|Dunkel|Endung|Zeitraum|Gesamt|veraltet|enthält|beliebig|keine|ohne|laut|Umgerechnet|Umsatzsteuer|Vergleich|Methodik)\b/g;

const urlOf = (path) => `${SITE}${path}`;

function pathOf(dist, file) {
  const rel = relative(dist, file).split(sep).join('/');
  return `/${rel.replace(/index\.html$/, '')}`;
}

function links(html, rel) {
  return [...html.matchAll(/<link rel="([^"]+)"(?: hreflang="([^"]+)")? href="([^"]+)"/g)]
    .filter((m) => m[1] === rel)
    .map((m) => (m[2] ? `${m[2]} ${m[3]}` : m[3]));
}

/** Text of an English page without lang="de" elements, scripts, styles and island props. */
function englishText(html) {
  let s = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
  s = s.replace(/<astro-island\b[^>]*>/g, '<astro-island>');
  // innermost first, repeated: elements marked lang="de" (not hreflang)
  for (let i = 0; i < 5; i++) {
    s = s.replace(/<(span|a|div|p|li|td)\b[^>]*\slang="de"[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>/g, '');
  }
  const attrs = [...s.matchAll(/\s(?:aria-label|title|placeholder|alt|content)="([^"]*)"/g)].map(
    (m) => m[1],
  );
  return `${s.replace(/<[^>]+>/g, ' ')} ${attrs.join(' ')}`.replace(/&[a-z]+;|&#\d+;/g, ' ');
}

/**
 * @param {string} dist
 * @param {string[]} files HTML files of the dist
 * @param {string[]} tlds TLDs with offers
 * @param {(msg: string) => void} fail
 */
export function checkI18n(dist, files, tlds, fail, docs = DOCS_PAGES) {
  const pages = new Map(files.map((f) => [pathOf(dist, f), readFileSync(f, 'utf8')]));
  for (const p of [...BOTH, ...tlds.map((t) => `/tld/${t}/`)]) {
    for (const path of [p, `/en${p}`]) {
      if (!pages.has(path)) fail(`${path}: missing (needed in both languages)`);
    }
  }
  for (const [path, html] of pages) {
    const en = path.startsWith('/en/');
    const lang = html.match(/<html lang="([^"]+)"/)?.[1];
    if (lang !== (en ? 'en' : 'de')) fail(`${path}: <html lang="${lang}">`);
    const noindex = /<meta name="robots" content="noindex"/.test(html);
    if (noindex !== NOINDEX.has(path)) fail(`${path}: noindex is ${noindex}`);
    if (noindex) continue;
    const canonical = links(html, 'canonical');
    if (canonical.length !== 1 || canonical[0] !== urlOf(path)) {
      fail(`${path}: canonical ${JSON.stringify(canonical)} is not the page itself`);
    }
    const dePath = en ? path.slice(3) : path;
    const enPath = en ? path : `/en${path}`;
    const twin = pages.has(en ? dePath : enPath);
    if (en && !twin) fail(`${path}: no German page ${dePath}`);
    const alternates = links(html, 'alternate').sort();
    const want = twin
      ? [`de ${urlOf(dePath)}`, `en ${urlOf(enPath)}`, `x-default ${urlOf(dePath)}`].sort()
      : [];
    if (JSON.stringify(alternates) !== JSON.stringify(want)) {
      fail(`${path}: hreflang ${JSON.stringify(alternates)}, want ${JSON.stringify(want)}`);
    }
    if (en && !/<nav class="tc-nav"[\s\S]*?<a href="\/en\/api\/"[\s\S]*?<\/nav>/.test(html)) {
      fail(`${path}: header does not link the English API page /en/api/`);
    }
    if (en) checkDrift(path, html, docs, fail);
    if (en) {
      const words = [...new Set(englishText(html).match(GERMAN) ?? [])];
      if (words.length) fail(`${path}: German UI text outside lang="de": ${words.join(', ')}`);
    }
  }
  if (!pages.has('/en/api/')) fail('/en/api/: missing (the API documentation in English)');
  if (!existsSync(join(dist, '404.html'))) return;
  const notFound = readFileSync(join(dist, '404.html'), 'utf8');
  if (!/<div lang="en">/.test(notFound)) fail('404.html: no English part (lang="en")');
}

/**
 * source_sha256 from the frontmatter of a translation: plain, 'single' or "double" quoted (YAML
 * allows all three; the content schema reads them the same), else undefined.
 */
export function frontmatterSha256(markdown) {
  return /^source_sha256:[ \t]*(["']?)([0-9a-f]{64})\1[ \t]*$/m.exec(markdown)?.[2];
}

/**
 * Drift note of an English text page (/en/<slug>/ from docs/pages/en/<slug>.md): shown exactly when
 * the German file no longer matches the translation's source_sha256.
 */
function checkDrift(path, html, docs, fail) {
  const slug = /^\/en\/([a-z]+)\/$/.exec(path)?.[1];
  const translation = slug && join(docs, 'en', `${slug}.md`);
  if (!translation || !existsSync(translation)) return;
  const sha = frontmatterSha256(readFileSync(translation, 'utf8'));
  if (!sha) return fail(`${path}: docs/pages/en/${slug}.md has no source_sha256`);
  const drift = translationDrift(readFileSync(join(docs, `${slug}.md`)), sha);
  const shown = /class="[^"]*\btc-drift\b/.test(html);
  if (drift && !shown)
    fail(`${path}: the German file changed since the translation, no drift note`);
  if (!drift && shown)
    fail(`${path}: drift note shown, but the translation matches the German file`);
}
