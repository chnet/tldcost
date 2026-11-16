#!/usr/bin/env node
// Trims a saved STRATO page (200-300 kB) to a test fixture: every price card (from its header to the
// order button, bytes unchanged), the "Preise inkl. MwSt." notes and the FAQ paragraph on the
// Aktionspreis (price overview https://www.strato.de/domains/domain-kosten/ only).
// Usage: node scripts/trim-strato-fixture.mjs <saved page> <out file> <source url>
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out, url] = process.argv.slice(2);
if (!src || !out || !url) {
  console.error('usage: trim-strato-fixture.mjs <saved page> <out file> <source url>');
  process.exit(2);
}
const html = readFileSync(src, 'utf8');
const cards = [
  ...html.matchAll(/<div class="pricecard__header">[\s\S]*?data-buy="[^"]*"[\s\S]*?<\/button>/g),
].map((m) => m[0]);
const notes = [...html.matchAll(/<div class="text-end">\s*Preise inkl\. MwSt\.\s*<\/div>/g)].map(
  (m) => m[0],
);
const faq = /<p class="bluelinks">Der Aktionspreis ist[\s\S]*?<\/p>/.exec(html)?.[0];
if (notes.length === 0 && !faq) throw new Error('page layout changed: no MwSt. note and no FAQ');
writeFileSync(
  out,
  [
    '<!doctype html>',
    `<!-- trimmed from ${url} by scraper/scripts/trim-strato-fixture.mjs -->`,
    '<html lang="de"><body>',
    ...cards,
    ...notes,
    ...(faq ? [faq] : []),
    '</body></html>',
    '',
  ].join('\n'),
);
console.log(`${cards.length} cards${faq ? ' + FAQ' : ''} -> ${out}`);
