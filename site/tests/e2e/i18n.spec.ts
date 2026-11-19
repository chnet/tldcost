// English version (Archiv-Issue 33): /en/ pages in English with en-GB formats, the language switch (real links,
// query carried over by script only), German data text quoted with lang="de", the bilingual 404.
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const plain = (s: string | null) =>
  (s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('English table: html lang, headers, units, status and footnotes in English', async ({
  page,
}) => {
  await open(page, '/en/?tld=de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('Domain prices compared');
  await expect(page.locator('th[data-col="sum_3y"]')).toContainText('Total 3 yrs');
  await expect(page.locator('th[data-col="sum_3y"] .tc-unit')).toHaveText('€ gross');
  await expect(page.locator('p.tc-status')).toContainText('sorted by Total 3 yrs ascending');
  await expect(page.locator('p.tc-status')).toContainText('prices gross incl. VAT in €');
  // en-GB money format in the cells: €1.23
  const sum = plain(await page.locator('tbody td[data-col="sum_3y"]').first().textContent());
  expect(sum).toMatch(/^€\d+\.\d{2}/);
  await expect(page.locator('ol.tc-notes')).not.toContainText('Der Anbieter');
});

test('language switch: same page, query carried over; plain links without script', async ({
  page,
  browser,
}) => {
  await open(page, '/tld/de/?sort=sum_5y&vat=net&theme=dark');
  const sw = page.locator('nav[data-lang-switch]');
  await expect(sw.locator('a[aria-current="true"]')).toHaveText('DE');
  await sw.locator('a[hreflang="en"]').click();
  await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
  expect(new URL(page.url()).pathname).toBe('/en/tld/de/');
  expect(new URL(page.url()).search).toBe('?sort=sum_5y&vat=net&theme=dark');
  await expect(page.locator('input[name="vat"][value="net"]')).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(sw.locator('a[aria-current="true"]')).toHaveText('EN');
  // a view changed on the page goes along too
  await page.locator('input[name="vat"][value="gross"]').check();
  await sw.locator('a[hreflang="de"]').click();
  await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
  expect(new URL(page.url()).pathname).toBe('/tld/de/');
  expect(new URL(page.url()).search).toBe('?sort=sum_5y&theme=dark');

  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const nojs = await ctx.newPage();
  await nojs.goto('/portfolio/?basket=de:2');
  const en = nojs.locator('nav[data-lang-switch] a[hreflang="en"]');
  await expect(en).toBeVisible();
  await expect(en).toHaveAttribute('href', '/en/portfolio/');
  await ctx.close();
});

test('row detail in English; German data text marked lang="de"', async ({ page }) => {
  await open(page, '/en/?tld=de');
  const toggle = page.locator('tr[data-provider-id="echo"] .tc-detail-toggle');
  await toggle.click();
  const detail = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(detail.locator('h2')).toHaveText([
    'Prices as stated by the provider',
    'Contract',
    'Evidence',
  ]);
  await expect(detail).toContainText('United States');
  await expect(detail.locator('span[lang="de"]')).toContainText(
    'Rechnung über Echo Names Europe (IE) mit USt.',
  );
  await expect(detail).toContainText('Report an error');
  // the country footnote: English preface, German text marked
  const mark = page.locator('tr[data-provider-id="echo"] td[data-col="country"] a.tc-fn');
  const note = page.locator((await mark.getAttribute('href')) ?? '#none');
  await expect(note).toContainText('Note (German):');
  await expect(note.locator('span[lang="de"]')).toHaveText(
    'Rechnung über Echo Names Europe (IE) mit USt.',
  );
});

test('English filters: dot decimals in money ranges, English chip text', async ({ page }) => {
  await open(page, '/en/?tld=de');
  await page.locator('#fh-year1-max').fill('6.50');
  await expect(page.locator('.tc-fstatus')).toContainText('Year 1: up to €6.50');
  expect(new URL(page.url()).searchParams.get('f')).toBe('year1:..650');
});

test('English portfolio calculator', async ({ page }) => {
  await page.goto('/en/portfolio/?basket=de:2');
  await page.locator('.basket[data-hydrated]').waitFor({ state: 'attached' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('thead th[data-col="total"]')).toContainText('Total 3 yrs');
  await expect(page.locator('p.tc-status')).toContainText('sorted by total, ascending');
  await expect(page.locator('tr.tc-mix th')).toContainText('Cheapest combination');
});

test('English footer: support link to GitHub Sponsors, a plain link', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.locator('footer a', { hasText: 'Support' })).toHaveAttribute(
    'href',
    'https://github.com/sponsors/chnet',
  );
});

test('404 is bilingual', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.locator('h1')).toHaveText('Seite nicht gefunden');
  await expect(page.locator('div[lang="en"] h2')).toHaveText('Page not found');
  await expect(page.locator('div[lang="en"] a[href="/en/"]')).toBeVisible();
});

test('Open Graph: the image of the page language, the page title and URL; none on 404', async ({
  page,
  request,
}) => {
  const og = (p: string) => page.locator(`meta[property="og:${p}"]`);
  for (const [path, lang, locale] of [
    ['/', 'de', 'de_DE'],
    ['/en/methodik/', 'en', 'en_US'],
  ] as const) {
    await page.goto(path);
    await expect(og('image')).toHaveAttribute('content', `https://tldcost.io/og/${lang}.png`);
    await expect(og('url')).toHaveAttribute('content', `https://tldcost.io${path}`);
    await expect(og('locale')).toHaveAttribute('content', locale);
    await expect(og('title')).toHaveAttribute('content', await page.title());
    await expect(og('image:alt')).toHaveAttribute('content', /^tldcost\.io: /);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    // the file is part of the build, served from this origin
    const png = await request.get(`/og/${lang}.png`);
    expect(png.status()).toBe(200);
    expect(png.headers()['content-type']).toContain('image/png');
  }
  await page.goto('/404.html');
  await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
});
