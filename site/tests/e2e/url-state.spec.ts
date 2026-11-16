import { expect, test } from '@playwright/test';
import { PORT_A } from '../../playwright.config';
import { open, providerOrder } from './helpers';

test('default view: .de, Summe 3 J. ascending, brutto', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('#tld')).toHaveValue('de');
  await expect(page.locator('th[data-col="sum_3y"]')).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('input[name="vat"][value="gross"]')).toBeChecked();
  expect((await providerOrder(page))[0]).toBe('alpha');
});

test('header click sorts, writes the URL, and a reload reproduces the view', async ({ page }) => {
  await open(page, '/');
  await page.locator('th[data-col="year1"] button').click();
  await expect(page).toHaveURL(/\/\?sort=year1$/);
  await page.locator('th[data-col="year1"] button').click();
  await expect(page).toHaveURL(/\/\?sort=year1&dir=desc$/);
  const before = await providerOrder(page);
  await open(page, page.url());
  expect(await providerOrder(page)).toEqual(before);
  await expect(page.locator('th[data-col="year1"]')).toHaveAttribute('aria-sort', 'descending');
});

test('TLD, VAT and columns go into the URL in canonical order', async ({ page }) => {
  await open(page, '/');
  await page.locator('#tld').selectOption('com');
  await page.locator('input[name="vat"][value="net"]').check();
  await page.locator('details.cols summary').click();
  await page.locator('input[name="cols"][value="api"]').check();
  await expect(page).toHaveURL(/\?tld=com&cols=[a-z0-9_,]+&vat=net$/);
  await expect(page.locator('th[data-col="api"]')).toBeVisible();
  await expect(page.locator('.status')).toContainText('.com');
});

test('invalid parameters render the default view', async ({ page }) => {
  await open(page, '/?tld=zzz&sort=nope&dir=sideways&vat=x&cols=,,');
  await expect(page.locator('#tld')).toHaveValue('de');
  await expect(page.locator('th[data-col="sum_3y"]')).toHaveAttribute('aria-sort', 'ascending');
});

test('back/forward is not flooded: state changes replace the history entry', async ({ page }) => {
  await open(page, '/');
  const length = await page.evaluate(() => history.length);
  await page.locator('th[data-col="year2"] button').click();
  await page.locator('#tld').selectOption('io');
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('keyboard: Tab to a header and Enter sorts', async ({ page }) => {
  await open(page, '/');
  await page.locator('th[data-col="setup"] button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('th[data-col="setup"]')).toHaveAttribute('aria-sort', 'ascending');
});

test('without JavaScript the server-rendered default table is there', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT_A}/`);
  expect(await providerOrder(page)).toEqual([
    'alpha',
    'bravo',
    'charlie',
    'foxtrot',
    'echo',
    'delta',
  ]);
  await ctx.close();
});
