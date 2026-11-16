// Concept section 4 Finding 1 / section 8: the operator row is never preferred. For every column,
// direction, VAT mode and TLD the row order of build A (operator flag set) equals build B (same
// data without the flag) and equals the pure sortRows() order.
import { expect, test, type Page } from '@playwright/test';
import { COLUMNS } from '../../src/lib/columns';
import { orderedRows } from '../../src/lib/view';
import { PORT_B } from '../../playwright.config';
import { FIXTURE_PAYLOAD, open, providerOrder } from './helpers';

const B = `http://127.0.0.1:${PORT_B}`;

// Land is not sortable (the country is no ranking signal): its ?sort= is ignored
for (const col of COLUMNS.filter((c) => c.sortable !== false).map((c) => c.id)) {
  test(`order with and without operator flag is identical: ${col}`, async ({ page }) => {
    for (const tld of FIXTURE_PAYLOAD.tlds) {
      for (const dir of ['asc', 'desc'] as const) {
        for (const vat of ['gross', 'net'] as const) {
          const q = `/?tld=${tld}&sort=${col}&dir=${dir}&vat=${vat}`;
          await open(page, q);
          const a = await providerOrder(page);
          await open(page, B + q);
          const b = await providerOrder(page);
          const expected = orderedRows(FIXTURE_PAYLOAD, {
            tld,
            sort: col,
            dir,
            vat,
            cols: null,
            q: '',
            f: {},
          }).map((v) => v.row.providerId);
          expect(a, `${q} A vs B`).toEqual(b);
          expect(a, `${q} A vs sortRows`).toEqual(expected);
        }
      }
    }
  });
}

// Everything that could make one row stand out visually: row and every cell are compared.
const STYLE_PROPS = [
  'backgroundColor',
  'backgroundImage',
  'borderTopColor',
  'borderTopStyle',
  'borderTopWidth',
  'borderBottomColor',
  'borderBottomStyle',
  'borderBottomWidth',
  'borderLeftColor',
  'borderLeftStyle',
  'borderLeftWidth',
  'borderRightColor',
  'borderRightStyle',
  'borderRightWidth',
  'boxShadow',
  'outlineColor',
  'outlineStyle',
  'outlineWidth',
  'opacity',
  'filter',
  'transform',
  'color',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'textDecorationLine',
] as const;

function isBest(page: Page, selector: string): Promise<boolean[]> {
  return page
    .locator(selector)
    .evaluateAll((els) => els.map((el) => el.classList.contains('tc-best')));
}

function computed(page: Page, selector: string): Promise<string[][]> {
  return page.locator(selector).evaluateAll(
    (els, props) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return props.map(
          (p) => `${p}=${s.getPropertyValue(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))}`,
        );
      }),
    [...STYLE_PROPS],
  );
}

test('tc-best cells are identical with and without the operator flag', async ({ page }) => {
  const bestKeys = () =>
    page
      .locator('td.tc-best')
      .evaluateAll((tds) =>
        tds
          .map(
            (td) => `${td.closest('tr')?.getAttribute('data-key')}|${td.getAttribute('data-col')}`,
          )
          .sort(),
      );
  for (const tld of FIXTURE_PAYLOAD.tlds) {
    for (const vat of ['gross', 'net'] as const) {
      const q = `/?tld=${tld}&vat=${vat}&cols=setup,year1,year2,year3,sum_2y,sum_3y,sum_5y,renewal,transfer_in,transfer_out`;
      await open(page, q);
      const a = await bestKeys();
      await open(page, B + q);
      expect(a, `${q} A vs B`).toEqual(await bestKeys());
      expect(a.length, q).toBeGreaterThan(0);
    }
  }
});

test('operator badge only in build A, and the row looks like its neighbours', async ({ page }) => {
  await open(page, '/');
  const op = page.locator('tr[data-provider-id="charlie"]');
  await expect(op.locator('.tc-badge--operator')).toHaveText('Angebot des Portalbetreibers');
  await expect(page.locator('tbody .tc-badge--operator')).toHaveCount(1);
  // the row, every cell and the provider link: identical to the non-operator row "bravo"
  const parts = [
    (id: string) => `tr[data-provider-id="${id}"]`,
    (id: string) => `tr[data-provider-id="${id}"] > th, tr[data-provider-id="${id}"] > td`,
    (id: string) => `tr[data-provider-id="${id}"] th[data-col="provider"] > a`,
  ];
  // tc-best (lowest value per column) is data-driven and may differ between two rows; cells are
  // compared where both rows have the same tc-best state (tc-best itself: table-logic.test.ts)
  for (const sel of parts) {
    const a = await computed(page, sel('charlie'));
    const b = await computed(page, sel('bravo'));
    const bestA = await isBest(page, sel('charlie'));
    const bestB = await isBest(page, sel('bravo'));
    expect(a.length, sel('charlie')).toBeGreaterThan(0);
    expect(a.length, sel('charlie')).toBe(b.length);
    const same = a.map((_, i) => i).filter((i) => bestA[i] === bestB[i]);
    expect(same.length, sel('charlie')).toBeGreaterThan(0);
    expect(
      same.map((i) => a[i]),
      sel('charlie'),
    ).toEqual(same.map((i) => b[i]));
  }
  await open(page, `${B}/`);
  await expect(page.locator('tbody .tc-badge--operator')).toHaveCount(0);
});

test('ties: the cheaper row wins before an early provider id (yes/no column)', async ({ page }) => {
  // .com: every provider offers free SSL; "alpha" has the earliest id but the highest sum_3y
  await open(page, '/?tld=com&sort=ssl_free');
  expect(await providerOrder(page)).toEqual(['echo', 'bravo', 'charlie', 'alpha']);
  await open(page, '/?tld=com&sort=ssl_free&dir=desc');
  expect(await providerOrder(page)).toEqual(['echo', 'bravo', 'charlie', 'alpha']);
});

test('missing values stay last when sorting descending', async ({ page }) => {
  await open(page, '/?sort=sum_3y&dir=desc');
  const order = await providerOrder(page);
  expect(order.at(-1)).toBe('delta'); // delta/de has no renewal price -> no sum
  await expect(page.locator('tr[data-provider-id="delta"] td[data-col="sum_3y"]')).toHaveText(
    'k. A.',
  );
});
