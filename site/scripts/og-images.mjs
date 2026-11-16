#!/usr/bin/env node
// og-images.mjs — renders the Open Graph images public/og/de.png and public/og/en.png
// (1200 × 630). Offline: Playwright's Chromium (already a dev dependency for the e2e tests), the
// self-hosted fonts from public/fonts/ inlined as data URLs, the colours of the light theme
// (src/styles/tokens.css) and the texts from src/i18n/site-{de,en}.ts. No external service.
// The PNGs are committed; run this again after a change to the tagline or the OG texts and commit
// the result. tests/unit/og-images.test.ts checks format, dimensions and size; the e2e test
// "Open Graph" in tests/e2e/i18n.spec.ts checks the meta tags and the served file.
//
// usage (in site/): node scripts/og-images.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { siteDe } from '../src/i18n/site-de.ts';
import { siteEn } from '../src/i18n/site-en.ts';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const font = (f) =>
  `data:font/woff2;base64,${readFileSync(resolve(SITE, 'public/fonts', f)).toString('base64')}`;

// colours of the light theme (src/styles/tokens.css)
const C = {
  surface: '#f6f8f8',
  line: '#d3dcdc',
  ink: '#132022',
  muted: '#4e6062',
  accent: '#0a6560',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const html = ({ lang, layout }) => `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Instrument Sans'; font-weight: 400 600; src: url(${font('instrument-sans-latin.woff2')}) format('woff2'); }
@font-face { font-family: 'Instrument Sans'; font-weight: 400 600; src: url(${font('instrument-sans-latin-ext.woff2')}) format('woff2'); unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: 'Spline Sans Mono'; font-weight: 400 600; src: url(${font('spline-sans-mono-latin.woff2')}) format('woff2'); }
html, body { margin: 0; }
body { width: 1200px; height: 630px; box-sizing: border-box; background: ${C.surface}; color: ${C.ink};
  font-family: 'Instrument Sans', sans-serif; display: flex; flex-direction: column; justify-content: center;
  padding: 0 96px; border-left: 24px solid ${C.accent}; }
.mark { font-family: 'Spline Sans Mono', monospace; font-weight: 600; font-size: 80px; line-height: 1; letter-spacing: -0.02em; }
.dot { color: ${C.accent}; }
.tagline { margin-top: 48px; font-size: 52px; line-height: 1.2; font-weight: 600; max-width: 960px; }
.principles { margin-top: 40px; padding-top: 32px; border-top: 2px solid ${C.line}; font-size: 32px; line-height: 1.3; color: ${C.muted}; }
</style></head><body>
<div class="mark">tldcost<span class="dot">.</span>io</div>
<div class="tagline">${esc(layout.tagline)}</div>
<div class="principles">${esc(layout.ogPrinciples)}</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  // nothing leaves the machine: every request except the inline document is refused
  await page.route('**/*', (route) => route.abort());
  mkdirSync(resolve(SITE, 'public/og'), { recursive: true });
  for (const [lang, msgs] of [
    ['de', siteDe],
    ['en', siteEn],
  ]) {
    await page.setContent(html({ lang, layout: msgs.layout }));
    // runs in the page: wait until the inline fonts are in use
    await page.waitForFunction('document.fonts.status === "loaded"');
    const out = resolve(SITE, `public/og/${lang}.png`);
    await page.screenshot({ path: out, type: 'png' });
    process.stdout.write(`${out}\n`);
  }
} finally {
  await browser.close();
}
