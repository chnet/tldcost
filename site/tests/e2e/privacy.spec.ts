// Datenschutz: no cookies, no local/session storage, no request to another origin.
import { expect, test } from '@playwright/test';
import { open } from './helpers';

for (const start of ['/', '/?theme=dark', '/en/']) {
  test(`no cookies, no storage, only same-origin requests (${start})`, async ({
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

    await open(page, start);
    await page.locator('th[data-col="year1"] button').click();
    await page.locator('#tld').selectOption('com');
    await page.locator('input[name="vat"][value="net"]').check();
    await page.locator('#q').fill('bra');
    await page.locator('details.cols summary').click();
    await page.locator('input[name="cols"][value="dnssec"]').check();
    await page.reload();
    await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });

    expect(foreign).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
}

test('no console errors or warnings', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') messages.push(m.text());
  });
  page.on('pageerror', (e) => messages.push(e.message));
  await open(page, '/?tld=io&sort=provider&dir=desc&theme=dark');
  await page.locator('th[data-col="sum_5y"] button').click();
  expect(messages).toEqual([]);
});
