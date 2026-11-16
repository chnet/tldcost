// Archiv-Issue 74 portfolio calculator: URL state round trip, totals equal computeBasket, missing TLD and
// transfer price shown (never skipped), cheapest mix, footnotes, operator neutrality, a11y,
// phones, privacy.
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { computeBasket, type BasketItem, type BasketMode } from '@tldcost/core';
import { loadData } from '@tldcost/core/load';
import { PORT_B } from '../../playwright.config';
import { buildBasketPayload } from '../../src/lib/basket-payload';

const PAYLOAD = buildBasketPayload(
  loadData(fileURLToPath(new URL('../fixtures/data', import.meta.url))),
);
const B = `http://127.0.0.1:${PORT_B}`;

async function openBasket(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator('.basket[data-hydrated]').waitFor({ state: 'attached' });
}
const search = (page: Page) => new URL(page.url()).search;
const order = (page: Page) =>
  page
    .locator('tbody tr[data-provider-id]')
    .evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).dataset.providerId ?? ''));
/** Header label of a column (the sort button's text, without the arrow and the filter). */
const head = (page: Page, col: string) =>
  page.locator(`thead th[data-col="${col}"] button > span:first-child`);
const cell = (page: Page, provider: string, col: string) =>
  page.locator(`tbody tr[data-provider-id="${provider}"] td[data-col="${col}"]`);
const expected = (basket: BasketItem[], years: number, mode: BasketMode, vat = 'gross' as const) =>
  computeBasket(PAYLOAD.offers, basket, years, mode, {
    price: vat,
    providers: PAYLOAD.providers,
    fx: PAYLOAD.fx,
  });
const eur = (c: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(c / 100);

test('empty basket: hint with an example link; the link fills the calculator', async ({ page }) => {
  await openBasket(page, '/portfolio/');
  await expect(page.locator('h1')).toHaveText('Portfolio-Rechner');
  // nav label „Portfolio-Rechner“ (Archiv-Issue 123); the short form only below 640 px
  await expect(page.locator('header .tc-nav a[aria-current="page"]')).toHaveAccessibleName(
    'Portfolio-Rechner',
  );
  await expect(page.locator('table')).toHaveCount(0);
  await page.locator('.tc-basket-empty a').click();
  await page.locator('.basket[data-hydrated]').waitFor({ state: 'attached' });
  expect(search(page)).toBe('?basket=de:10,com:3,io:5');
  await expect(page.locator('tbody tr')).not.toHaveCount(0);
});

test('totals per provider equal computeBasket, cheapest first; missing TLD shows "fehlt"', async ({
  page,
}) => {
  const basket = [
    { tld: 'de', count: 2 },
    { tld: 'com', count: 1 },
  ];
  await openBasket(page, '/portfolio/?basket=de:2,com:1');
  const r = expected(basket, 3, 'new');
  expect(await order(page)).toEqual(r.providers.map((p) => p.provider));
  // alpha .de has a promo without a stated limit: ONE promo domain at the provider,
  // 99 + 600 + 600 = 12,99 €, the second at the list price 3 × 6,00 € = 18,00 €;
  // com (no promo) 1200 + 1400 + 1400 = 40,00 €
  await expect(cell(page, 'alpha', 'total')).toHaveText('70,99 €');
  await expect(cell(page, 'alpha', 'tld-de')).toContainText('30,99 €');
  await expect(cell(page, 'alpha', 'tld-de')).toContainText('1 × 12,99 € (Aktion), 1 × 18,00 €');
  await expect(cell(page, 'alpha', 'tld-de').locator('.tc-fn')).toHaveCount(1);
  await expect(page.locator('.tc-notes')).toContainText(
    'Jahr 1 von .de ist ein Aktionspreis: „nur für Neukunden“ Gültig bis 31.12.2099.',
  );
  // the pool note (owner wording) sits at the provider
  const pool = page.locator('#fn-promo-pool-alpha');
  await expect(pool).toHaveText(
    'Aktion pro Kunde nur einmal; angerechnet auf .de. Gilt sie für eine andere TLD, kann die Summe niedriger sein.',
  );
  await expect(
    page.locator('tr[data-provider-id="alpha"] th a[href="#fn-promo-pool-alpha"]'),
  ).toHaveCount(1);
  await expect(cell(page, 'bravo', 'tld-de')).toContainText('je Domain 15,00 €');
  // delta has no .com: no total, the line says so
  await expect(cell(page, 'delta', 'tld-com')).toContainText('fehlt');
  await expect(cell(page, 'delta', 'total')).toContainText('unvollständig');
  const last = r.providers.filter((p) => p.total === null).map((p) => p.provider);
  expect((await order(page)).slice(-last.length)).toEqual(last);
  // cheapest mix
  await expect(page.locator('tr.tc-mix td[data-col="total"]')).toHaveText(eur(r.mix.total ?? 0));
  await expect(page.locator('tr.tc-mix')).toContainText('Günstigste Kombination');
  await expect(page.locator('.tc-notes')).toContainText('mehrere Kundenkonten');
  // the USD provider without VAT statement carries its footnotes
  await expect(page.locator('tr[data-provider-id="echo"] th .tc-fn')).toHaveCount(2);
  await expect(page.locator('.tc-notes')).toContainText('keine Angabe zur Umsatzsteuer');
  await expect(page.locator('.tc-notes')).toContainText('EZB-Referenzkurs');
});

test('net mode: gross-stated prices carry the gross-price note, net-stated ones none', async ({
  page,
}) => {
  await openBasket(page, '/portfolio/?basket=de:1&vat=net');
  await expect(page.locator('.tc-notes')).toContainText(
    'Der Anbieter nennt Bruttopreise. Netto = brutto ohne die enthaltenen 19 % Umsatzsteuer.',
  );
  await expect(
    page.locator('tr[data-provider-id="bravo"] th a[href="#fn-vat-gross-1900"]'),
  ).toHaveCount(1);
  await expect(page.locator('.tc-notes')).not.toContainText('Der Anbieter nennt Nettopreise.');
  await expect(
    page.locator('tr[data-provider-id="foxtrot"] th a[href="#fn-vat-gross-1900"]'),
  ).toHaveCount(0);
});

test('transfer mode: "Transfer-Preis fehlt" where transfer_in is null; the methodik rule as footnote', async ({
  page,
}) => {
  await openBasket(page, '/portfolio/?basket=de:1&mode=transfer');
  await expect(page.locator('input[name="mode"][value="transfer"]')).toBeChecked();
  // alpha: transfer 6,00 € plus the renewal from year 1: 6,00 + 3 × 6,00 = 24,00 €
  await expect(cell(page, 'alpha', 'total')).toHaveText('24,00 €');
  await expect(cell(page, 'delta', 'tld-de')).toContainText('Transfer-Preis fehlt');
  await expect(cell(page, 'echo', 'tld-de')).toContainText('Transfer-Preis fehlt');
  const r = expected([{ tld: 'de', count: 1 }], 3, 'transfer');
  expect(await order(page)).toEqual(r.providers.map((p) => p.provider));
  await expect(page.locator('thead th[data-col="total"] .tc-fn')).toHaveCount(1);
  await expect(page.locator('.tc-notes li').first()).toContainText(
    'Beim Transfer rechnen wir die Transfergebühr plus den Verlängerungspreis ab dem ersten Jahr, außer der Anbieter gibt an, dass der Transfer ein Jahr Laufzeit einschließt.',
  );
});

test('URL round trip: controls write the URL in canonical order, a reload reproduces the view', async ({
  page,
}) => {
  await openBasket(page, '/portfolio/?theme=dark');
  await page.locator('#basket-add').selectOption('com');
  expect(search(page)).toBe('?basket=com:1&theme=dark');
  await page.locator('#basket-add').selectOption('de');
  await page.locator('input[name="count-de"]').fill('10');
  await page.locator('input[name="years"][value="5"]').check();
  await page.locator('input[name="vat"][value="net"]').check();
  await page.locator('input[name="mode"][value="transfer"]').check();
  const url = '?basket=com:1,de:10&years=5&vat=net&mode=transfer&theme=dark';
  expect(search(page)).toBe(url);
  // an invalid count is marked and does not change the URL
  await page.locator('input[name="count-de"]').fill('0');
  await expect(page.locator('input[name="count-de"]')).toHaveAttribute('aria-invalid', 'true');
  expect(search(page)).toBe(url);
  await page.reload();
  await page.locator('.basket[data-hydrated]').waitFor({ state: 'attached' });
  await expect(page.locator('input[name="count-de"]')).toHaveValue('10');
  await expect(page.locator('input[name="years"][value="5"]')).toBeChecked();
  await expect(page.locator('input[name="vat"][value="net"]')).toBeChecked();
  await expect(head(page, 'tld-de')).toHaveText('.de × 10');
  await page.getByRole('button', { name: '.com entfernen' }).click();
  expect(search(page)).toBe('?basket=de:10&years=5&vat=net&mode=transfer&theme=dark');
});

test('invalid parameters fall back to the default; unknown TLDs and duplicates are dropped', async ({
  page,
}) => {
  await openBasket(page, '/portfolio/?basket=de:3,xx:2,de:5,com:0,com:abc&years=4&vat=x&mode=y');
  await expect(page.locator('thead th[data-col^="tld-"] button > span:first-child')).toHaveText([
    '.de × 3',
  ]);
  await expect(page.locator('input[name="years"][value="3"]')).toBeChecked();
  await expect(page.locator('input[name="vat"][value="gross"]')).toBeChecked();
  await expect(page.locator('input[name="mode"][value="new"]')).toBeChecked();
});

test('operator neutrality: build A and B (no operator flag) give the same order and totals', async ({
  page,
}) => {
  const q = '/portfolio/?basket=de:2,com:1';
  const totals = () =>
    page
      .locator('tbody td[data-col="total"]')
      .evaluateAll((tds) => tds.map((td) => td.textContent));
  await openBasket(page, q);
  const [orderA, totalsA] = [await order(page), await totals()];
  await expect(page.locator('tr[data-provider-id="charlie"] .tc-badge--operator')).toHaveCount(1);
  await expect(page.locator('.tc-badge--operator')).toHaveCount(2); // row + legend
  await openBasket(page, B + q);
  expect(await order(page)).toEqual(orderA);
  expect(await totals()).toEqual(totalsA);
  await expect(page.locator('.tc-badge--operator')).toHaveCount(0);
});

test('axe: no serious or critical violations; 375 px without horizontal page scroll', async ({
  page,
}) => {
  await openBasket(page, '/portfolio/?basket=de:10,com:3,io:5&mode=transfer');
  const result = await new AxeBuilder({ page }).analyze();
  const bad = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(bad).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('privacy: no cookies, no storage, no request to another origin', async ({
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
  await openBasket(page, '/portfolio/');
  await page.locator('#basket-add').selectOption('de');
  await page.locator('input[name="count-de"]').fill('7');
  await page.locator('input[name="mode"][value="transfer"]').check();
  await page.reload();
  await page.locator('.basket[data-hydrated]').waitFor({ state: 'attached' });
  expect(foreign).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

// ---- Archiv-Issue 123: sort and filter of the result table ----

test('sort by a TLD column: header button, aria-sort, URL; no-total rows stay last', async ({
  page,
}) => {
  const basket = [
    { tld: 'de', count: 2 },
    { tld: 'com', count: 1 },
  ];
  await openBasket(page, '/portfolio/?basket=de:2,com:1&theme=dark');
  const r = expected(basket, 3, 'new');
  const noTotal = r.providers.filter((p) => p.total === null).map((p) => p.provider);
  await page.locator('thead th[data-col="tld-de"] button').click();
  expect(search(page)).toBe('?basket=de:2,com:1&sort=tld-de&theme=dark');
  await expect(page.locator('thead th[data-col="tld-de"]')).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await page.locator('thead th[data-col="tld-de"] button').click();
  expect(search(page)).toBe('?basket=de:2,com:1&sort=tld-de&dir=desc&theme=dark');
  await expect(page.locator('p.tc-status')).toContainText('sortiert nach .de absteigend');
  const desc = await order(page);
  expect(desc.slice(-noTotal.length).sort()).toEqual([...noTotal].sort());
  const subtotals = desc
    .slice(0, -noTotal.length)
    .map((id) => r.providers.find((p) => p.provider === id)?.lines[0]?.subtotal ?? -1);
  expect(subtotals).toEqual([...subtotals].sort((a, b) => b - a));
  // Land is filterable, not sortable (as in the table)
  await expect(page.locator('thead th[data-col="country"] button')).toHaveCount(0);
  // a reload reproduces the view; back to the default sort drops the parameters
  await page.reload();
  await page.locator('.basket[data-hydrated]').waitFor({ state: 'attached' });
  expect(await order(page)).toEqual(desc);
  await page.locator('thead th[data-col="total"] button').click();
  expect(search(page)).toBe('?basket=de:2,com:1&theme=dark');
  expect(await order(page)).toEqual(r.providers.map((p) => p.provider));
});

test('filters: chip, status "N von M", k. A. kept, tc-best on the visible rows, reset', async ({
  page,
}) => {
  await openBasket(page, '/portfolio/?basket=de:2,com:1');
  const r = expected(
    [
      { tld: 'de', count: 2 },
      { tld: 'com', count: 1 },
    ],
    3,
    'new',
  );
  const withTotal = r.providers.filter((p) => p.total !== null);
  const cheapest = withTotal[0]?.provider as string;
  await expect(cell(page, cheapest, 'total')).toHaveClass(/\btc-best\b/);
  // hide the cheapest by a max below its total (k. A. rows stay)
  await page
    .locator('#fh-total-min')
    .fill(eur((withTotal[0]?.total ?? 0) + 1).replace(/[^\d,]/g, ''));
  await expect(page.locator('.tc-fchip')).toHaveCount(1);
  expect(await order(page)).not.toContain(cheapest);
  for (const p of r.providers.filter((x) => x.total === null))
    expect(await order(page)).toContain(p.provider);
  await expect(page.locator('p.tc-status')).toContainText(
    `${(await order(page)).length} von ${r.providers.length} Anbietern`,
  );
  await expect(page.locator('p.tc-status')).toContainText(
    'niedrigster Wert unter den gefilterten Anbietern',
  );
  // the cheapest shown row is marked now (order: total ascending)
  const next = (await order(page))[0] as string;
  await expect(cell(page, next, 'total')).toHaveClass(/\btc-best\b/);
  await expect(page.locator('.tc-legend')).toContainText(
    'Niedrigster Wert in dieser Spalte unter den gefilterten Anbietern.',
  );
  // complete = nein shows only the rows without a total, never silently gone
  await page.locator('.tc-fchip button').click();
  await page.locator('thead th[data-col="complete"] summary').click();
  await page.locator('#fh-complete-ja').uncheck();
  expect(new URL(page.url()).searchParams.get('f')).toBe('complete:nein');
  expect((await order(page)).sort()).toEqual(
    r.providers
      .filter((p) => p.total === null)
      .map((p) => p.provider)
      .sort(),
  );
  await page.locator('.tc-freset').click();
  expect(search(page)).toBe('?basket=de:2,com:1');
  expect(await order(page)).toEqual(r.providers.map((p) => p.provider));
});

test('URL round trip with sort, q and f next to basket, years, vat, mode; back/forward', async ({
  page,
}) => {
  const url =
    '?basket=de:2,com:1&years=5&vat=net&mode=transfer&sort=tld-com&dir=desc&q=a&f=country:DE;assumption:nein&theme=dark';
  await openBasket(page, `/portfolio/${url}`);
  expect(search(page)).toBe(url);
  await expect(page.locator('#fh-provider')).toHaveValue('a');
  await expect(page.locator('.tc-fchip')).toHaveCount(3);
  expect(await order(page)).not.toContain('echo');
  await expect(page.locator('input[name="years"][value="5"]')).toBeChecked();
  // removing .com from the basket drops its sort
  await page.getByRole('button', { name: '.com entfernen' }).click();
  expect(search(page)).toBe(
    '?basket=de:2&years=5&vat=net&mode=transfer&q=a&f=country:DE;assumption:nein&theme=dark',
  );
  // a link with only the filter reproduces it; back/forward follow the URL
  await openBasket(page, '/portfolio/?basket=de:2&f=country:US');
  expect(await order(page)).toEqual(['echo']);
  await openBasket(page, '/portfolio/?basket=de:2');
  await page.goBack();
  await page.locator('.basket[data-hydrated]').waitFor({ state: 'attached' });
  expect(await order(page)).toEqual(['echo']);
});

test('phones: short nav label, header filters hidden, filter panel, Land column hidden', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openBasket(page, '/portfolio/?basket=de:2,com:1');
  await expect(page.locator('header .tc-nav a[aria-current="page"]')).toHaveAccessibleName(
    'Portfolio',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await expect(page.locator('thead th[data-col="total"] .tc-filter')).toBeHidden();
  await expect(page.locator('thead th[data-col="country"]')).toBeHidden();
  await expect(page.locator('tbody tr[data-provider-id="echo"] th .tc-flag')).toBeVisible();
  await page.locator('.tc-fpanel > summary').click();
  await page.locator('.tc-fpanel summary', { hasText: 'alle' }).first().click();
  await page.locator('#fp-country-US').uncheck();
  expect(new URL(page.url()).searchParams.get('f')).toBe('country:DE,na');
  await expect(page.locator('.tc-fpanel > summary')).toHaveText('Filter (1 aktiv)');
  expect(await order(page)).not.toContain('echo');
});

test('axe with sort, filter and an open picker; English labels', async ({ page }) => {
  await openBasket(page, '/portfolio/?basket=de:2,com:1&sort=tld-de&f=complete:ja');
  await page.locator('thead th[data-col="assumption"] summary').click();
  const result = await new AxeBuilder({ page }).analyze();
  const bad = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(bad).toEqual([]);
  await expect(page.locator('#fh-tld-de-min')).toHaveAttribute(
    'aria-label',
    /^Filter \.de × 2: von/,
  );
  await openBasket(page, '/en/portfolio/?basket=de:2&f=complete:ja');
  await expect(page.locator('header .tc-nav a[aria-current="page"]')).toHaveAccessibleName(
    'Portfolio calculator',
  );
  await expect(head(page, 'complete')).toHaveText('Complete');
  await expect(head(page, 'assumption')).toHaveText('Assumption');
  await expect(page.locator('.tc-fchip')).toContainText('Complete: yes');
});
