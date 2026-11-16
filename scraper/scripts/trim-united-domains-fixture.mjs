#!/usr/bin/env node
// Trims a saved united-domains price list (https://www.united-domains.de/domain-registrieren/preisliste/,
// 2.3 MB) to a test fixture: the intro of the TLD list, the rows of the given TLDs (bytes unchanged,
// page order), the inline UdFrontendConfig reduced to LOCALE/VAT_RATE/VAT_TEXT, the first row of
// the next (product) section, the footnotes those rows reference and
// the VAT note.
// Usage: node scripts/trim-united-domains-fixture.mjs <saved page> <out file> <tld> [<tld> ...]
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out, ...tlds] = process.argv.slice(2);
if (!src || !out || tlds.length === 0) {
  console.error('usage: trim-united-domains-fixture.mjs <saved page> <out file> <tld> [<tld> ...]');
  process.exit(2);
}
const html = readFileSync(src, 'utf8');
const SECTION_START = '<div class="mol-price-list__rows mol-price-list--tlds">';
const NEXT_SECTION = '<div class="mol-price-list__rows';
const ROW_START = /(?=<div\s+class="mol-price-list__row"\s)/;
const start = html.indexOf(SECTION_START);
const end = html.indexOf(NEXT_SECTION, start + SECTION_START.length);
const intro = /<h2 class="h3">Alle Top-Level-Domains<\/h2>\s*<p>[\s\S]*?<\/p>/.exec(html)?.[0];
const vatNote = /<div class="vat-note">[\s\S]*?<\/div>/.exec(html)?.[0];
const configJson = /<script>var UdFrontendConfig = (\{.*?\});\s*(?:var |<\/script>)/.exec(
  html,
)?.[1];
if (start < 0 || end < 0 || !intro || !vatNote || !configJson)
  throw new Error('page layout changed');
// only the keys the adapter checks; the rest holds per-visit tokens (CSRF, AJAX) and tracking ids
const { LOCALE, VAT_RATE, VAT_TEXT } = JSON.parse(configJson);
const config = `<script>var UdFrontendConfig = ${JSON.stringify({ LOCALE, VAT_RATE, VAT_TEXT })};</script>`;

// a row chunk runs to the next row start; cut it after the row's own closing tags
const rowOnly = (chunk) => {
  const close = chunk.lastIndexOf('</a>\n');
  return chunk.slice(0, chunk.indexOf('</div>\n', chunk.indexOf('</div>\n', close) + 1) + 7);
};
const rows = html
  .slice(start + SECTION_START.length, end)
  .split(ROW_START)
  .slice(1)
  .map(rowOnly);
const tldOf = (row) =>
  (/mol-price-list__row-name\s*">\s*([^<]*?)\s*<\/div>/.exec(row)?.[1] ?? '')
    .replaceAll('&#46;', '.')
    .replace(/^\./, '');
const keep = rows.filter((r) => tlds.includes(tldOf(r)));
const missing = tlds.filter((t) => !keep.some((r) => tldOf(r) === t));
if (missing.length) throw new Error(`TLDs not in the page: ${missing.join(', ')}`);
const product = rowOnly(html.slice(end).split(ROW_START)[1] ?? '');
const used = new Set(keep.flatMap((r) => [...r.matchAll(/<sup>(\d+)<\/sup>/g)].map((m) => m[1])));
const footnotes = [...html.matchAll(/<div class="footnote">\s*<sup>(\d+)<\/sup>[\s\S]*?<\/div>/g)]
  .filter((m) => used.has(m[1]))
  .map((m) => m[0]);
writeFileSync(
  out,
  [
    '<!doctype html>',
    '<!-- trimmed from https://www.united-domains.de/domain-registrieren/preisliste/ by scraper/scripts/trim-united-domains-fixture.mjs -->',
    '<html lang="de"><body>',
    config,
    intro,
    SECTION_START,
    ...keep,
    '</div>',
    '<div class="mol-price-list__rows ">',
    product,
    '</div>',
    '<div class="mol-footnotes__content">',
    ...footnotes,
    '</div>',
    vatNote,
    '</body></html>',
    '',
  ].join('\n'),
);
console.log(`${keep.length} rows, ${footnotes.length} footnotes -> ${out}`);
