#!/usr/bin/env node
// Trims a saved one.com price list (https://www.one.com/de/domains/preise, 400 kB) to a test fixture:
// the inline country and VAT settings (onecomConfig), the table head, the rows of the given TLDs
// (bytes unchanged) and the two notices under the table.
// Usage: node scripts/trim-onecom-fixture.mjs <saved page> <out file> <tld> [<tld> ...]
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out, ...tlds] = process.argv.slice(2);
if (!src || !out || tlds.length === 0) {
  console.error('usage: trim-onecom-fixture.mjs <saved page> <out file> <tld> [<tld> ...]');
  process.exit(2);
}
const html = readFileSync(src, 'utf8');
const head = /<thead>[\s\S]*?<\/thead>/.exec(html)?.[0];
const notes = [/<p class="one-year-info">[\s\S]*?<\/p>/, /<p class="notices">[\s\S]*?<\/p>/].map(
  (re) => re.exec(html)?.[0],
);
const config = html.match(
  /^[ \t]*onecomConfig\.(?:showVAT|vatPercentage|country|countryCode) = .*$/gm,
);
if (!head || notes.some((n) => !n) || config?.length !== 4)
  throw new Error('page layout changed: table head, notices or onecomConfig settings missing');
const rows = [...html.matchAll(/<tr data-pub-price-row>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
const tldOf = (row) => /<th scope="row"[^>]*>\s*\.([a-z0-9.-]+)\s/.exec(row)?.[1] ?? '';
const keep = rows.filter((r) => tlds.includes(tldOf(r)));
const missing = tlds.filter((t) => !keep.some((r) => tldOf(r) === t));
if (missing.length) throw new Error(`TLDs not in the page: ${missing.join(', ')}`);
writeFileSync(
  out,
  [
    '<!doctype html>',
    '<!-- trimmed from https://www.one.com/de/domains/preise by scraper/scripts/trim-onecom-fixture.mjs -->',
    '<html lang="de"><head><script>',
    ...config,
    '</script></head><body>',
    '<table class="pubPriceList-table prices-table" data-pub-price-table>',
    head,
    '<tbody>',
    ...keep,
    '</tbody></table>',
    ...notes,
    '</body></html>',
    '',
  ].join('\n'),
);
console.log(`${keep.length} rows -> ${out}`);
