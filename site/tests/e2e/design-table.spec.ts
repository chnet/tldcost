// Design system phase 1, table components: provider search, tc-best, country flags, legend order,
// theme parameter pass-through, axe in both colour schemes, keyboard, 375 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { orderedRows } from '../../src/lib/view';
import { FIXTURE_PAYLOAD, open, providerOrder } from './helpers';

const base = {
  tld: 'de',
  sort: 'sum_3y',
  dir: 'asc' as const,
  vat: 'gross' as const,
  cols: null,
  f: {},
};

async function axeBad(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('provider search filters as you type, keeps the order, writes ?q= and the status', async ({
  page,
}) => {
  await open(page, '/');
  const all = await providerOrder(page);
  await page.locator('#q').fill('a');
  const expected = orderedRows(FIXTURE_PAYLOAD, { ...base, q: 'a' }).map((v) => v.row.providerId);
  expect(await providerOrder(page)).toEqual(expected);
  expect(expected).toEqual(all.filter((id) => expected.includes(id)));
  expect(new URL(page.url()).searchParams.get('q')).toBe('a');
  await expect(page.locator('.tc-status')).toContainText(
    `${expected.length} von ${all.length} Anbietern`,
  );
  await page.locator('#q').fill('keiner');
  await expect(page.locator('tbody')).toContainText('Kein Anbieter passt zu den Filtern');
  await page.locator('#q').fill('');
  expect(new URL(page.url()).search).toBe('');
  expect(await providerOrder(page)).toEqual(all);
  // a link with q reproduces the view
  await open(page, '/?q=char');
  expect(await providerOrder(page)).toEqual(['charlie']);
  await expect(page.locator('#q')).toHaveValue('char');
});

test('tc-best marks the lowest value per price column, with spoken text, never by colour only', async ({
  page,
}) => {
  await open(page, '/');
  const best = page.locator('td.tc-best');
  expect(await best.count()).toBeGreaterThan(0);
  for (const td of await best.all()) {
    await expect(td.locator('.tc-best-sr')).toHaveText(', niedrigster Wert in dieser Spalte');
    expect(
      await td.evaluate((el) => Number(getComputedStyle(el).fontWeight)),
    ).toBeGreaterThanOrEqual(600);
  }
  // only money and sum columns
  const kinds = await best.evaluateAll((els) =>
    els.map((el) => (el.className.match(/\bk-(\w+)/) ?? [])[1]),
  );
  for (const k of kinds) expect(['money', 'tco']).toContain(k);
});

test('tc-best with a search (owner decision B): the lowest value among the shown rows', async ({
  page,
}) => {
  await open(page, '/?tld=de');
  // without a filter: the lowest year-1 value of .de belongs to alpha, charlie is not marked
  const year1 = (id: string) => page.locator(`tr[data-provider-id="${id}"] td[data-col="year1"]`);
  await expect(year1('alpha')).toHaveClass(/\btc-best\b/);
  await expect(year1('charlie')).not.toHaveClass(/\btc-best\b/);
  await expect(page.locator('.tc-status')).toContainText('niedrigster Wert je Spalte');
  // the search hides alpha: charlie is now the lowest among the shown rows, and the wording says so
  await page.locator('#q').fill('charlie');
  expect(await providerOrder(page)).toEqual(['charlie']);
  await expect(year1('charlie')).toHaveClass(/\btc-best\b/);
  await expect(year1('charlie').locator('.tc-best-sr')).toHaveText(
    ', niedrigster Wert unter den gefilterten Anbietern',
  );
  await expect(page.locator('.tc-status')).toContainText(
    'niedrigster Wert unter den gefilterten Anbietern',
  );
  await expect(page.locator('.tc-legend')).toContainText('unter den gefilterten Anbietern');
});

test('country flag: same-origin SVG with the country name, ISO code aria-hidden', async ({
  page,
}) => {
  const responses: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/flags/')) responses.push(r.status());
  });
  await open(page, '/?tld=com');
  const echo = page.locator('tr[data-provider-id="echo"] th.tc-provider .tc-country');
  await expect(echo.locator('img.tc-flag')).toHaveAttribute('src', '/flags/us.svg');
  await expect(echo.locator('img.tc-flag')).toHaveAttribute('alt', 'Vereinigte Staaten');
  await expect(echo.locator('.tc-cc')).toHaveText('US');
  await expect(echo.locator('.tc-cc')).toHaveAttribute('aria-hidden', 'true');
  await expect
    .poll(() =>
      page
        .locator('img.tc-flag')
        .evaluateAll((imgs) =>
          imgs.every(
            (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  expect(responses.length).toBeGreaterThan(0);
  expect(responses.every((s) => s === 200 || s === 304)).toBe(true);
});

test('legend lists the badges in view in the fixed order', async ({ page }) => {
  await open(page, '/?tld=de');
  const dt = await page.locator('.tc-legend dt .tc-badge').allTextContents();
  expect(dt).toEqual(['Aktionspreis', 'Anbieter-bestätigt', 'Angebot des Portalbetreibers']);
  // every view: exactly the badges shown in the rows, same order
  const ORDER = ['Aktionspreis', 'Anbieter-bestätigt', 'Angebot des Portalbetreibers'];
  for (const tld of ['com', 'io']) {
    await open(page, `/?tld=${tld}`);
    const inRows = await page.locator('tbody .tc-badge').allTextContents();
    expect(await page.locator('.tc-legend dt .tc-badge').allTextContents(), tld).toEqual(
      ORDER.filter((t) => inRows.includes(t)),
    );
  }
});

test('foreign URL parameters (theme) survive every table change', async ({ page }) => {
  await open(page, '/?theme=dark');
  await page.locator('input[name="vat"][value="net"]').check({ force: true });
  await page.locator('#q').fill('br');
  await page.locator('th[data-col="year1"] button').click();
  const q = new URL(page.url()).searchParams;
  expect(q.get('theme')).toBe('dark');
  expect(q.get('vat')).toBe('net');
  expect(q.get('q')).toBe('br');
  expect(q.get('sort')).toBe('year1');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe (${scheme}): no serious or critical violations, controls open, a row expanded`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, '/?tld=de');
    await page.locator('details.tc-colpicker summary').click();
    await page.locator('tr[data-provider-id="alpha"] .tc-detail-toggle').click();
    expect(await axeBad(page)).toEqual([]);
  });
}

test('heading order with a row expanded: no skipped level on / and /tld/de/', async ({ page }) => {
  for (const url of ['/?tld=de', '/tld/de/']) {
    await open(page, url);
    await page.locator('tr[data-provider-id="alpha"] .tc-detail-toggle').click();
    const result = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
    expect(
      result.violations.map((v) => v.id),
      url,
    ).toEqual([]);
  }
});

test('keyboard: search, VAT segment, sort and details work without a mouse', async ({ page }) => {
  await open(page, '/');
  await page.locator('#q').focus();
  await page.keyboard.type('bra');
  expect(await providerOrder(page)).toEqual(['bravo']);
  await page.keyboard.press('Tab'); // column picker summary
  await page.keyboard.press('Enter');
  await expect(page.locator('details.tc-colpicker')).toHaveAttribute('open', '');
  await page.locator('input[name="vat"][value="gross"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name="vat"][value="net"]')).toBeChecked();
  const toggle = page.locator('tr[data-provider-id="bravo"] .tc-detail-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('tr.tc-detail-row')).toBeVisible();
});

test('375 px: controls, flags and badges fit, the page never scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, '/?tld=de');
  await expect(page.locator('#q')).toBeVisible();
  await page.locator('tr[data-provider-id="bravo"] .tc-detail-toggle').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
