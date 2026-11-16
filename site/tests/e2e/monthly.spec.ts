// Monthly prices: the annualised value with the provider's monthly price as a muted second line
// (fixture foxtrot/de: 35 ct per month net, so 5,00 € per year gross and 0,42 € per month gross).
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const cell = (col: string) => `tr[data-provider-id="foxtrot"] td[data-col="${col}"]`;

test('/tld/de/: monthly price under the year value, gross and net', async ({ page }) => {
  await open(page, '/tld/de/');
  for (const col of ['year1', 'year2', 'year3']) {
    await expect(page.locator(cell(col))).toContainText('5,00 €');
    await expect(page.locator(cell(col))).toHaveClass(/\btc-num\b/);
    await expect(page.locator(`${cell(col)} .tc-avg`)).toHaveText('0,42 €/Monat');
  }
  await open(page, '/tld/de/?vat=net');
  await expect(page.locator(cell('year1'))).toContainText('4,20 €');
  await expect(page.locator(`${cell('year1')} .tc-avg`)).toHaveText('0,35 €/Monat');
  // yearly offers have no second line
  await expect(
    page.locator('tr[data-provider-id="bravo"] td[data-col="year1"] .tc-avg'),
  ).toHaveCount(0);
});

test('screen readers hear "pro Jahr, entspricht … pro Monat", not the short form', async ({
  page,
}) => {
  await open(page, '/tld/de/');
  const td = page.locator(cell('year1'));
  await expect(td.locator('.tc-avg')).toHaveAttribute('aria-hidden', 'true');
  const spoken = await td.evaluate((el) =>
    [...el.childNodes]
      .filter(
        (n) =>
          !(n instanceof HTMLElement) ||
          (n.getAttribute('aria-hidden') !== 'true' && !n.classList.contains('tc-fn')),
      )
      .map((n) => n.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  expect(spoken).toBe('5,00 € pro Jahr, entspricht 0,42 € pro Monat');
});

test('without JavaScript the second line is in the server-rendered table', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/tld/de/');
  await expect(page.locator(`${cell('year1')} .tc-avg`)).toHaveText('0,42 €/Monat');
  await context.close();
});

test('375 px: the second line does not make the page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, '/tld/de/?cols=year1,year2,renewal');
  await expect(page.locator(`${cell('year1')} .tc-avg`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
