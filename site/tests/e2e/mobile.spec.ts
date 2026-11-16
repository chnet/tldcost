import { expect, test } from '@playwright/test';
import { MOBILE_COLUMNS } from '../../src/lib/columns';
import { open } from './helpers';

test.use({ viewport: { width: 375, height: 812 } });

test('375 px: no page overflow, mobile default columns, sticky provider column', async ({
  page,
}) => {
  await open(page, '/');
  expect(await page.evaluate(() => document.scrollingElement?.scrollWidth)).toBeLessThanOrEqual(
    375,
  );
  const visible = await page
    .locator('thead th')
    .evaluateAll((ths) =>
      ths
        .filter((th) => getComputedStyle(th).display !== 'none')
        .map((th) => (th as HTMLElement).dataset.col),
    );
  expect(visible).toEqual([...MOBILE_COLUMNS]);

  // explicit columns: wider than the screen, the wrapper scrolls, the provider column stays
  await open(page, '/?cols=setup,year1,year2,year3,sum_2y,sum_3y,sum_5y,notice_days');
  const scroller = page.locator('.tc-table-frame');
  const box0 = await scroller.boundingBox();
  await scroller.evaluate((el) => el.scrollBy(400, 0));
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const cell = await page
    .locator('tbody tr')
    .first()
    .locator('th[data-col="provider"]')
    .boundingBox();
  expect(Math.abs((cell?.x ?? -1) - (box0?.x ?? 0))).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.scrollingElement?.scrollWidth)).toBeLessThanOrEqual(
    375,
  );
});
