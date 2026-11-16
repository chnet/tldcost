// /tld/<tld>/, /api/, the /api/v1/ index and 404.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_PAYLOAD, open, providerOrder } from './helpers';

async function axe(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const rowsOf = (tld: string) => FIXTURE_PAYLOAD.rows.filter((r) => r.tld === tld);

for (const tld of FIXTURE_PAYLOAD.tlds) {
  test(`/tld/${tld}/ without JavaScript: table with only the .${tld} offers`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`/tld/${tld}/`);
    await expect(page.locator('h1')).toContainText(`.${tld}-Domains`);
    const keys = await page
      .locator('tbody tr[data-key]')
      .evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).dataset.key ?? ''));
    expect(keys.sort()).toEqual(
      rowsOf(tld)
        .map((r) => r.key)
        .sort(),
    );
    const canonical = `https://tldcost.io/tld/${tld}/`;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveAttribute(
      'href',
      canonical,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      canonical,
    );
    await context.close();
  });
}

test('/tld/<tld>/ hydrates, ignores ?tld= of another TLD and keeps sorting', async ({ page }) => {
  await open(page, '/tld/io/?tld=de&sort=provider');
  const ids = await providerOrder(page);
  expect(ids.sort()).toEqual(
    rowsOf('io')
      .map((r) => r.providerId)
      .sort(),
  );
  await expect(page.locator('thead th[data-col="provider"]')).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
});

test('/tld/<tld>/ links the other TLD pages and its API file', async ({ page }) => {
  await page.goto('/tld/de/');
  for (const t of FIXTURE_PAYLOAD.tlds.filter((t) => t !== 'de')) {
    await expect(page.locator(`.tld-nav a[href="/tld/${t}/"]`)).toHaveCount(1);
  }
  const res = await page.request.get('/api/v1/offers/de.json');
  expect(res.status()).toBe(200);
  expect((await res.json()).tld).toBe('de');
  await expect(page.locator('a[href="/api/v1/offers/de.json"]')).toHaveCount(1);
});

test('/api/: every linked API file exists and is JSON', async ({ page }) => {
  await page.goto('/api/');
  const hrefs = await page
    .locator('a[href^="/api/v1/"]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href') ?? ''))]);
  expect(hrefs.length).toBeGreaterThan(5);
  for (const href of hrefs) {
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toContain('application/json');
    await res.json();
  }
});

test('/api/v1/: bilingual, not indexed, links the docs and every file', async ({ page }) => {
  const res = await page.goto('/api/v1/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('API v1');
  await expect(page.locator('section[lang="en"] h2')).toHaveText('API v1');
  await expect(page.locator('a[href="/api/"]').first()).toBeVisible();
  await expect(page.locator('section[lang="en"] a[href="/en/api/"]')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  const hrefs = await page
    .locator('main a[href^="/api/v1/"][href$=".json"]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href') ?? ''))]);
  for (const f of ['all.json', 'tlds.json', 'openapi.json', 'offers/de.json']) {
    expect(hrefs).toContain(`/api/v1/${f}`);
  }
  for (const href of hrefs) {
    const file = await page.request.get(href);
    expect(file.status(), href).toBe(200);
    expect(file.headers()['content-type'], href).toContain('application/json');
  }
});

for (const url of ['/tld/de/', '/api/', '/api/v1/', '/404.html']) {
  test(`axe: no serious or critical violations on ${url}`, async ({ page }) => {
    await page.goto(url);
    expect(await axe(page)).toEqual([]);
  });
}

test('404 page is not indexed and has no canonical link', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('/api/ names the data license and the attribution', async ({ page }) => {
  await page.goto('/api/');
  const section = page.locator('#lizenz ~ *');
  await expect(page.locator('h2#lizenz')).toHaveText('Lizenz');
  await expect(section.filter({ hasText: 'CC BY 4.0' }).first()).toBeVisible();
  await expect(page.locator('blockquote')).toHaveText(
    'Quelle: tldcost.io (CHnet Solutions Plus UG), CC BY 4.0',
  );
  const json = await (await page.request.get('/api/v1/all.json')).json();
  expect(json.license.spdx).toBe('CC-BY-4.0');
});

test('/api/ explains price.unit and how derived.tco is annualised', async ({ page }) => {
  await page.goto('/api/');
  const doc = page.locator('article.doc');
  await expect(doc).toContainText('stehen in der Einheit von price.unit');
  await expect(doc).toContainText('Monatspreise sind auf das Jahr hochgerechnet (× 12)');
  await expect(doc).toContainText('0,42 € pro Monat inklusive Umsatzsteuer, also 5,04 € pro Jahr');
});
