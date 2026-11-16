import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { open } from './helpers';

for (const url of [
  '/',
  '/?tld=com&vat=net&cols=year1,api,payment,fetched_at',
  '/en/',
  '/en/?tld=com&vat=net',
]) {
  test(`axe: no serious or critical violations on ${url}`, async ({ page }) => {
    await open(page, url);
    await page.locator('details.cols summary').click();
    const result = await new AxeBuilder({ page }).analyze();
    const bad = result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(bad).toEqual([]);
  });
}

test('table semantics: column headers with scope, row headers for providers', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('thead th:not([scope="col"])')).toHaveCount(0);
  const rows = await page.locator('tbody tr').count();
  await expect(page.locator('tbody th[scope="row"]')).toHaveCount(rows);
  await expect(page.locator('th[aria-sort]')).toHaveCount(1);
});
