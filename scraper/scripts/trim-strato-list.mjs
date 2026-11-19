#!/usr/bin/env node
// Trims a saved copy of the STRATO domain list (https://www.strato.de/domains/, about 2.6 MB) to a
// test fixture: every entry (data-domain-infoBox, all contract terms and sections, bytes unchanged)
// of the given TLDs, each up to the start of the next entry.
// Usage: node scripts/trim-strato-list.mjs <saved page> <out file> <source url> <fetch date> <tld,...>
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out, url, fetched, tldList] = process.argv.slice(2);
if (!src || !out || !url || !fetched || !tldList) {
  console.error(
    'usage: trim-strato-list.mjs <saved page> <out file> <source url> <fetch date> <tld,...>',
  );
  process.exit(2);
}
const html = readFileSync(src, 'utf8');
const names = new Set(tldList.split(',').map((t) => `.${t.trim().replace(/^\./, '')}`));
const starts = [...html.matchAll(/<div\b[^>]*\bdata-domain-infoBox\b/g)].map((m) => m.index);
const boxes = starts
  .map((start, i) => html.slice(start, starts[i + 1] ?? html.length))
  .filter((box) => names.has(/data-domain-name="([^"]+)"/.exec(box)?.[1] ?? ''));
if (boxes.some((box) => box.length > 10_000))
  throw new Error('entry longer than 10 kB: page layout changed');
writeFileSync(
  out,
  [
    '<!doctype html>',
    `<!-- trimmed from ${url} (fetched ${fetched}) by scraper/scripts/trim-strato-list.mjs -->`,
    '<html lang="de"><body>',
    ...boxes,
    '</body></html>',
    '',
  ].join('\n'),
);
console.log(`${boxes.length} entries -> ${out}`);
