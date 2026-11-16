#!/usr/bin/env node
// Datenschutz: the build must not load anything from another origin (fonts, scripts,
// styles, images, frames). Plain links (<a href>) and rel="canonical" are fine: they load nothing.
// Usage: node tests/check-no-foreign-assets.mjs <dir> [dir ...]   Exit 0 = ok, 1 = findings.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const FOREIGN = String.raw`(?:https?:)?//`;
const RULES = [
  // src= on anything that fetches
  new RegExp(
    String.raw`<(?:script|img|iframe|source|video|audio|embed|track|input)\b[^>]*\bsrc\s*=\s*["']?${FOREIGN}`,
    'gi',
  ),
  // <link> that fetches (anything except canonical/alternate), attribute order independent
  new RegExp(
    String.raw`<link\b(?![^>]*\brel\s*=\s*["']?(?:canonical|alternate)\b)[^>]*\bhref\s*=\s*["']?${FOREIGN}`,
    'gi',
  ),
  // CSS url(...) and @import
  new RegExp(String.raw`url\(\s*["']?${FOREIGN}`, 'gi'),
  new RegExp(String.raw`@import\s+(?:url\()?\s*["']?${FOREIGN}`, 'gi'),
  // srcset / poster / object data
  new RegExp(String.raw`\b(?:srcset|poster|data)\s*=\s*["']?${FOREIGN}`, 'gi'),
];

function* files(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (['.html', '.css', '.js', '.mjs', '.svg'].includes(extname(p))) yield p;
  }
}

const findings = [];
for (const dir of process.argv.slice(2)) {
  for (const file of files(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const re of RULES) {
      for (const m of text.matchAll(re)) findings.push(`${file}: ${m[0].slice(0, 120)}`);
    }
  }
}
if (findings.length) {
  console.error(`Foreign-origin assets found:\n  - ${findings.join('\n  - ')}`);
  process.exit(1);
}
console.log(`No foreign-origin assets (${process.argv.slice(2).join(', ')})`);
