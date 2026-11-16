// Text pages: every docs/pages/*.md is rendered under /<slug>/; Impressum, Datenschutz,
// Methodik and Changelog are mandatory. Editorial notes (HTML comments, OWNER/TODO markers) must
// never reach the build, the pages load nothing from other origins and run no script except the
// site's own theme-init.js, and every page links to all text pages and the API in its header
// (Methodik, API) or footer.
import { readdirSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const DOCS = new URL('../../../docs/pages/', import.meta.url);
const field = (text: string, key: string) =>
  new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text.split(/^---$/m)[1] ?? '')?.[1]?.trim() ?? '';
const PAGES = readdirSync(DOCS)
  .filter((f) => f.endsWith('.md'))
  .map((f) => readFileSync(new URL(f, DOCS), 'utf8'))
  .map((text) => ({ path: `/${field(text, 'slug')}/`, title: field(text, 'title') }));
const MANDATORY = ['/impressum/', '/datenschutz/', '/methodik/', '/changelog/'];

test('docs/pages has the mandatory pages', () => {
  expect(PAGES.map((p) => p.path)).toEqual(expect.arrayContaining(MANDATORY));
  for (const p of PAGES) expect(p.title, p.path).not.toBe('');
});

const FOOTER_LINKS = [...PAGES.map((p) => p.path), '/api/'];

const frameHrefs = (html: string): string[] =>
  ['header', 'footer'].flatMap((tag) => {
    const part = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'i').exec(html)?.[0] ?? '';
    return [...part.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)].map((m) => m[1] ?? '');
  });

for (const { path, title } of PAGES) {
  test(`${path} is built from docs/pages without editorial notes or scripts`, async ({
    request,
  }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<title>${title} · tldcost</title>`);
    expect(html).toMatch(/<h1\b/);
    for (const marker of ['<!--', 'OWNER', 'TODO']) expect(html).not.toContain(marker);
    // the only script: the theme switch, as a file from this origin (no inline script)
    expect([...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0])).toEqual([
      '<script src="/theme-init.js">',
    ]);
  });
}

for (const path of ['/', ...PAGES.map((p) => p.path)]) {
  test(`header and footer of ${path} link to the text pages and the API`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    expect(frameHrefs(html)).toEqual(expect.arrayContaining(FOOTER_LINKS));
  });
}

test('text pages: no cookies, no storage, only same-origin requests', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('data:') && new URL(u).origin !== origin) foreign.push(u);
  });
  for (const { path } of PAGES) await page.goto(path);
  expect(foreign).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

// desktop and 375 px: on narrow screens tables scroll inside a focusable region (table-regions.mjs)
for (const width of [1280, 375]) {
  for (const { path } of PAGES) {
    test(`axe at ${width} px: no serious or critical violations on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      const result = await new AxeBuilder({ page }).analyze();
      const bad = result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(bad).toEqual([]);
    });
  }
}

test('tables are named, keyboard-reachable scroll regions with unique names', async ({
  request,
}) => {
  const html = await (await request.get('/methodik/')).text();
  const tables = html.match(/<table\b/g)?.length ?? 0;
  const regions = [
    ...html.matchAll(/<div class="table-scroll" role="region" tabindex="0" aria-label="([^"]+)">/g),
  ].map((m) => m[1]);
  expect(tables).toBeGreaterThan(0);
  expect(regions).toHaveLength(tables);
  expect(new Set(regions).size).toBe(regions.length);
});

test('changelog: a date at the start of a list item stays text, not a numbered list', async ({
  page,
}) => {
  await page.goto('/changelog/');
  await expect(page.locator('main ol')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('14. November 2026');
});

test('375 px: the text pages do not overflow sideways (wide tables scroll inside)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const { path } of PAGES) {
    await page.goto(path);
    const [scroll, client] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scroll, path).toBeLessThanOrEqual(client);
  }
});
