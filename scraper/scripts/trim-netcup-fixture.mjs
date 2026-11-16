#!/usr/bin/env node
// Builds a small netcup test fixture from a saved product page (the real page is ~700 KB with
// per-request nonces): keeps only the products' price fields as a devalue array and the visible
// text around the contract details and the price, so the adapter's checks still run on real text.
//
// Usage: node scraper/scripts/trim-netcup-fixture.mjs <page.html> <page path> > fixture.html
//   e.g. ... saved.html /de/domain/zusaetzliche-domain-de > scraper/test/fixtures/netcup/de.html
import { readFileSync } from 'node:fs';

const [file, pagePath] = process.argv.slice(2);
if (!file || !pagePath) {
  console.error('usage: trim-netcup-fixture.mjs <page.html> <page path>');
  process.exit(2);
}
const html = readFileSync(file, 'utf8');
const data = JSON.parse(
  /<script\b[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1],
);
const KEYS = [
  'id',
  'domain',
  'availableToOrder',
  'price',
  'netPrice',
  'netSetup_costs',
  'setup_costs',
  'billing_period',
  'minimum_contract_period',
  'free_months',
  'slug',
  'title',
];

// first product per id: the page's product plus one cross-sell, to keep the selection tested
const products = new Map();
for (const raw of data) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('netPrice' in raw)) continue;
  if (!('additionalConfiguration' in raw) || data[raw.domain] !== true) continue;
  const id = data[raw.id];
  if (products.has(id)) continue;
  const config = data[raw.additionalConfiguration];
  const p = Object.fromEntries(KEYS.map((k) => [k, data[raw[k]]]));
  p.additionalConfiguration = { slug: data[config.slug], deal: data[config.deal] };
  products.set(id, p);
}
const main = [...products.values()].find((p) => p.additionalConfiguration.slug === pagePath);
const other = [...products.values()].find((p) => p !== main);

// devalue: a flat array, objects map keys to indexes
const out = [];
const put = (v) => {
  const i = out.length;
  out.push(null);
  if (v && typeof v === 'object') {
    out[i] = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, put(x)]));
  } else out[i] = v;
  return i;
};
out.push(['ShallowReactive', 1]);
out.push(null);
out[1] = { products: put([]) };
out[out[1].products] = [put(main), put(other)];

const text = html
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const around = (needle, before, after) => {
  const i = text.indexOf(needle);
  return i < 0 ? '' : text.slice(Math.max(0, i - before), i + needle.length + after).trim();
};
const snippets = [
  around('Vertragliches', 0, 160),
  around('Zusatzprodukte', 0, 200),
  around('In den Warenkorb', 60, 0),
];
process.stdout.write(
  `<!doctype html>\n<!-- trimmed from ${pagePath} by scraper/scripts/trim-netcup-fixture.mjs -->\n` +
    `<html lang="de"><head><script nonce="fixture" type="application/json" id="__NUXT_DATA__">` +
    `${JSON.stringify(out)}</script></head>\n<body>\n` +
    snippets.map((s) => `<p>${s}</p>\n`).join('') +
    `</body></html>\n`,
);
