// Archiv-Issue 76 column filters (design system FilterRow): every filter kind, URL round trip, k. A. never
// hidden silently, chips and reset, hidden columns clear their filter, phone panel, a11y, privacy,
// operator neutrality, and tc-best per owner decision B.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PORT_B } from '../../playwright.config';
import { open, providerOrder } from './helpers';

const B = `http://127.0.0.1:${PORT_B}`;
const f = (page: Page) => new URL(page.url()).searchParams.get('f');
const head = (page: Page, col: string) => page.locator(`thead th[data-col="${col}"] .tc-filter`);
const cell = (page: Page, id: string, col: string) =>
  page.locator(`tr[data-provider-id="${id}"] td[data-col="${col}"]`);

test('Land = DE hides the US provider; tc-best moves and the wording changes; reset restores', async ({
  page,
}) => {
  await open(page, '/?tld=com');
  await expect(cell(page, 'echo', 'year1')).toHaveClass(/\btc-best\b/);
  await expect(page.locator('.tc-status')).toContainText('niedrigster Wert je Spalte');
  const all = await providerOrder(page);

  await head(page, 'country').locator('summary').click();
  await head(page, 'country').getByRole('checkbox', { name: /^US/ }).uncheck();
  expect(f(page)).toBe('country:DE,na');
  expect(await providerOrder(page)).toEqual(all.filter((id) => id !== 'echo'));
  await expect(cell(page, 'bravo', 'year1')).toHaveClass(/\btc-best\b/);
  await expect(cell(page, 'bravo', 'year1').locator('.tc-best-sr')).toHaveText(
    ', niedrigster Wert unter den gefilterten Anbietern',
  );
  await expect(page.locator('.tc-status')).toContainText(
    'gefiltert nach Land · sortiert nach Summe 3 J. aufsteigend',
  );
  await expect(page.locator('.tc-status')).toContainText(
    `${all.length - 1} von ${all.length} Anbietern`,
  );
  await expect(page.locator('.tc-legend')).toContainText('unter den gefilterten Anbietern');
  await expect(page.locator('.tc-fchip')).toHaveText(['Land: DE, k. A.×']);

  await page.locator('.tc-freset').click();
  expect(f(page)).toBeNull();
  expect(await providerOrder(page)).toEqual(all);
  await expect(cell(page, 'echo', 'year1')).toHaveClass(/\btc-best\b/);
  await expect(page.locator('.tc-status')).toContainText('niedrigster Wert je Spalte');
  await expect(page.locator('.tc-fchip')).toHaveCount(0);
});

test('price range: German decimals, debounced, inclusive, k. A. kept until unticked', async ({
  page,
}) => {
  await open(page, '/?tld=io');
  const all = await providerOrder(page);
  expect(all).toContain('charlie'); // charlie/io has no year-1 price (k. A.)
  const bis = head(page, 'year1').getByLabel('Filter Jahr 1: bis (€)');
  await bis.fill('30,00');
  expect(f(page)).toBeNull(); // not yet: 300 ms debounce
  await expect.poll(() => f(page)).toBe('year1:..3000');
  const shown = await providerOrder(page);
  expect(shown).toContain('charlie'); // k. A. is never hidden silently
  expect(shown).toContain('alpha'); // 30,00 € is inclusive
  await head(page, 'year1').getByRole('checkbox').uncheck();
  expect(f(page)).toBe('year1:..3000,-na');
  expect(await providerOrder(page)).not.toContain('charlie');
  await expect(page.locator('.tc-fchip')).toContainText('Jahr 1: bis 30,00 €, ohne k. A.');
  // invalid input is marked and does not change the filter
  await bis.fill('3x');
  await expect(bis).toHaveAttribute('aria-invalid', 'true');
  expect(f(page)).toBe('year1:..3000,-na');
});

test('yes/no picker, text filter, Datenstand age', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-31T12:00:00Z'));
  await open(page, '/?tld=de&cols=ssl_free,payment,fetched_at');
  const all = await providerOrder(page);
  await head(page, 'ssl_free').locator('summary').click();
  await head(page, 'ssl_free').getByRole('checkbox', { name: 'nein' }).uncheck();
  // payable feature (Archiv-Issue 124): the picker also offers kostenpflichtig, between ja and nein
  expect(f(page)).toBe('ssl_free:ja,paid,na');
  await head(page, 'ssl_free').getByRole('checkbox', { name: 'kostenpflichtig' }).uncheck();
  expect(f(page)).toBe('ssl_free:ja,na');
  await head(page, 'ssl_free').locator('summary').click();

  await head(page, 'payment').getByRole('searchbox').fill('paypal');
  await expect.poll(() => f(page)).toBe('ssl_free:ja,na;payment:paypal');

  // fixtures are from 2026-11-11/12: on 2026-12-31 none is within 30 days
  await head(page, 'fetched_at').locator('summary').click();
  await head(page, 'fetched_at').getByRole('radio', { name: '≤ 30 Tage' }).check();
  expect(f(page)).toBe('ssl_free:ja,na;payment:paypal;fetched_at:30');
  expect(await providerOrder(page)).toEqual([]);
  await expect(page.locator('tbody')).toContainText('Kein Anbieter passt zu den Filtern');
  // nothing is marked, so the status line names no marking
  await expect(page.locator('.tc-status')).not.toContainText('hervorgehoben');
  // an open picker is not clipped by the scrolling table frame, even with no rows
  await head(page, 'ssl_free').locator('summary').click();
  const list = head(page, 'ssl_free').locator('ul');
  await expect(list).toBeVisible();
  const frame = page.locator('.tc-table-frame');
  const [fb, lb] = [await frame.boundingBox(), await list.boundingBox()];
  expect(lb!.y + lb!.height).toBeLessThanOrEqual(fb!.y + fb!.height);
  expect(await frame.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
  await head(page, 'ssl_free').locator('summary').click();
  await expect(page.locator('.tc-fchip')).toHaveCount(3);
  await page.getByRole('button', { name: 'Filter Datenstand entfernen' }).click();
  expect(f(page)).toBe('ssl_free:ja,na;payment:paypal');
  expect((await providerOrder(page)).length).toBeGreaterThan(0);
  expect(all.length).toBeGreaterThan(0);
});

test('a link with f reproduces the view; controls and chips show it', async ({ page }) => {
  await open(page, '/?tld=com&f=country:DE;year1:..1000');
  expect(await providerOrder(page)).not.toContain('echo');
  await expect(head(page, 'country').locator('summary')).toHaveText('DE');
  await expect(head(page, 'year1').getByLabel('Filter Jahr 1: bis (€)')).toHaveValue('10,00');
  await expect(page.locator('.tc-fchip')).toHaveCount(2);
  await page.reload();
  await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
  expect(f(page)).toBe('country:DE;year1:..1000');
});

test('hiding a column clears its filter and its chip', async ({ page }) => {
  await open(page, '/?f=year3:..600');
  await expect(page.locator('.tc-fchip')).toHaveCount(1);
  await page.locator('details.tc-colpicker summary').click();
  await page.locator('input[name="cols"][value="year3"]').uncheck();
  expect(f(page)).toBeNull();
  await expect(page.locator('.tc-fchip')).toHaveCount(0);
});

test('the provider column filter is the search q', async ({ page }) => {
  await open(page, '/');
  await head(page, 'provider').getByRole('searchbox').fill('char');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('char');
  expect(await providerOrder(page)).toEqual(['charlie']);
  await expect(page.locator('#q')).toHaveValue('char');
  await expect(page.locator('.tc-fchip')).toHaveText(['Anbieter: enthält „char“×']);
});

test('phones: header filters hidden, "Filter (n aktiv)" panel with the same controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, '/?tld=com&f=country:DE');
  await expect(page.locator('thead .tc-filter').first()).toBeHidden();
  const panel = page.locator('details.tc-fpanel');
  await expect(panel.locator(':scope > summary')).toHaveText('Filter (1 aktiv)');
  await panel.locator(':scope > summary').click();
  await panel.getByLabel('Filter Jahr 1: bis (€)').fill('10');
  await expect.poll(() => f(page)).toBe('country:DE;year1:..1000');
  await expect(panel.locator(':scope > summary')).toHaveText('Filter (2 aktiv)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  // adding a column keeps the active filters, also on a column outside the mobile default (Land)
  await page.locator('details.tc-colpicker summary').click();
  await page.locator('input[name="cols"][value="year3"]').check();
  expect(f(page)).toBe('country:DE;year1:..1000');
  await expect(panel.locator(':scope > summary')).toHaveText('Filter (2 aktiv)');
});

test('every visible header filter has an aria-label with its column; axe clean with a picker open', async ({
  page,
}) => {
  await open(page, '/?tld=de&f=country:DE');
  const labels = await page
    .locator('thead .tc-filter')
    .evaluateAll((els) =>
      els.map((el) => el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? ''),
    );
  const headers = await page.locator('thead th').count();
  expect(labels).toHaveLength(headers);
  for (const l of labels) expect(l).toMatch(/^Filter \S/);
  await head(page, 'country').locator('summary').click();
  const result = await new AxeBuilder({ page }).analyze();
  const bad = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(bad).toEqual([]);
});

test('neutrality: with a filter, order and tc-best are identical in build A and B', async ({
  page,
}) => {
  const best = () =>
    page
      .locator('td.tc-best')
      .evaluateAll((tds) =>
        tds
          .map(
            (td) => `${td.closest('tr')?.getAttribute('data-key')}|${td.getAttribute('data-col')}`,
          )
          .sort(),
      );
  for (const q of ['/?tld=com&f=country:DE', '/?tld=de&f=year1:..600', '/?tld=de&q=a']) {
    await open(page, q);
    const orderA = await providerOrder(page);
    const bestA = await best();
    await open(page, B + q);
    expect(await providerOrder(page), q).toEqual(orderA);
    expect(await best(), q).toEqual(bestA);
  }
});

test('privacy: filtering stores nothing and requests nothing from other origins', async ({
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
  await open(page, '/?tld=com');
  await head(page, 'year1').getByLabel('Filter Jahr 1: von (€)').fill('5');
  await expect.poll(() => f(page)).toBe('year1:500..');
  await page.reload();
  await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
  expect(foreign).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
