// Row detail, cell footnotes, badges. Expanding rows never changes the order
// (concept Finding 1; same check as operator-neutral.spec.ts).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { orderedRows } from '../../src/lib/view';
import { FIXTURE_PAYLOAD, open, providerOrder } from './helpers';

test('expanding rows shows evidence, terms and the report link, order unchanged', async ({
  page,
}) => {
  await open(page, '/?tld=de');
  const before = await providerOrder(page);
  const toggle = page.locator('tr[data-provider-id="bravo"] .tc-detail-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // collapsed: no aria-controls pointing to an element that is not rendered
  await expect(toggle).not.toHaveAttribute('aria-controls', /.*/);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const id = await toggle.getAttribute('aria-controls');
  const detail = page.locator(`#${id}`);
  await expect(detail).toBeVisible();
  await expect(detail.locator('a', { hasText: 'Preisseite von Bravo' })).toHaveAttribute(
    'href',
    /^https:\/\/bravo\.example\//,
  );
  await expect(detail).toContainText('Domain-AGB Nr. 4 und 5');
  await expect(detail).toContainText('Anbieter-bestätigt');
  // REPORT_VIA 'mail' while the repository is private (src/lib/report.mjs)
  const report = detail.locator('a', { hasText: 'Fehler melden' });
  const href = new URL((await report.getAttribute('href')) ?? '');
  expect(href.protocol + href.pathname).toBe('mailto:hello@chnet.solutions');
  expect(href.searchParams.get('subject')).toBe('tldcost: Fehler bei Bravo Registry .de');
  expect(href.searchParams.get('body')).toMatch(/^Anbieter: bravo\r\nTLD: de\r\n/);
  await expect(detail.locator('a[href*="issues/new"]')).toHaveCount(0);

  // open every row: the order stays the sortRows() order
  const closed = page.locator('.tc-detail-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  const after = await providerOrder(page);
  expect(after).toEqual(before);
  expect(after).toEqual(
    orderedRows(FIXTURE_PAYLOAD, {
      tld: 'de',
      sort: 'sum_3y',
      dir: 'asc',
      vat: 'gross',
      cols: null,
      q: '',
      f: {},
    }).map((v) => v.row.providerId),
  );
  await toggle.click();
  await expect(detail).toHaveCount(0);
});

test('promo and net-price cells carry footnote markers that resolve', async ({ page }) => {
  await open(page, '/?tld=de');
  const promo = page.locator('tr[data-provider-id="alpha"] td[data-col="year1"] a.tc-fn');
  await expect(promo).toHaveCount(1);
  const target = await promo.getAttribute('href');
  await expect(page.locator(target ?? '#none')).toContainText('Aktionspreis im ersten Jahr');
  await expect(page.locator('tr[data-provider-id="alpha"] .tc-badge--promo')).toHaveText(
    'Aktionspreis',
  );
  // net offer: marker in gross mode, gone in net mode
  const net = page.locator('tr[data-provider-id="foxtrot"] td[data-col="setup"] a.tc-fn');
  await expect(net).toHaveCount(1);
  await open(page, '/?tld=de&vat=net');
  await expect(net).toHaveCount(0);
});

test('contract cells: no minimum term as text, provider terms note as footnote', async ({
  page,
}) => {
  await open(page, '/?tld=de');
  await expect(
    page.locator('tr[data-provider-id="delta"] td[data-col="min_term_months"]'),
  ).toHaveText('keine Mindestlaufzeit');
  const mark = page.locator('tr[data-provider-id="foxtrot"] td[data-col="notice_days"] a.tc-fn');
  await expect(mark).toHaveCount(1);
  await expect(page.locator((await mark.getAttribute('href')) ?? '#none')).toContainText('AGB § 3');
});

test('provider terms note: also in the row detail under the contract value (DE and EN)', async ({
  page,
}) => {
  // notice_days is hidden by default, so without the detail the note is not visible at all
  await open(page, '/?tld=de');
  await page.locator('tr[data-provider-id="foxtrot"] .tc-detail-toggle').click();
  const detail = page.locator('tr.tc-detail-row');
  await expect(detail).toContainText('AGB § 3: 14 Tage zum Ende der Laufzeit; FAQ: 7 Tage.');
  // German data text on the English page: quoted as is, marked lang="de"
  await open(page, '/en/?tld=de');
  await page.locator('tr[data-provider-id="foxtrot"] .tc-detail-toggle').click();
  const note = page.locator('tr.tc-detail-row [lang="de"]', {
    hasText: 'AGB § 3: 14 Tage zum Ende der Laufzeit; FAQ: 7 Tage.',
  });
  await expect(note).toHaveCount(1);
});

test('country note: footnote on the "Land" cell and next to the country in the detail', async ({
  page,
}) => {
  await open(page, '/?tld=de');
  const mark = page.locator('tr[data-provider-id="echo"] td[data-col="country"] a.tc-fn');
  await expect(mark).toHaveCount(1);
  await expect(page.locator((await mark.getAttribute('href')) ?? '#none')).toContainText(
    'Rechnung über Echo Names Europe (IE) mit USt.',
  );
  await expect(
    page.locator('tr[data-provider-id="bravo"] td[data-col="country"] a.tc-fn'),
  ).toHaveCount(0);
  const toggle = page.locator('tr[data-provider-id="echo"] .tc-detail-toggle');
  await toggle.click();
  const detail = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(detail).toContainText('Vereinigte Staaten');
  await expect(detail).toContainText('Rechnung über Echo Names Europe (IE) mit USt.');
});

test('badge legend explains the badges in view', async ({ page }) => {
  await open(page, '/?tld=de');
  const legend = page.locator('.tc-legend');
  await expect(legend).toContainText('Angebot des Portalbetreibers');
  await expect(legend).toContainText('Anbieter-bestätigt');
  await expect(legend).toContainText('Aktionspreis');
});

test('axe: no serious or critical violations with every row expanded', async ({ page }) => {
  await open(page, '/?tld=de');
  const closed = page.locator('.tc-detail-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  const result = await new AxeBuilder({ page }).analyze();
  const bad = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(bad).toEqual([]);
});

test('375 px: the expanded detail stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, '/?tld=de');
  await page.locator('tr[data-provider-id="bravo"] .tc-detail-toggle').click();
  const detail = page.locator('tr.tc-detail-row');
  for (const el of [
    detail.getByRole('heading', { name: 'Vertrag', exact: true }),
    detail.getByRole('link', { name: 'Fehler melden' }),
  ]) {
    const box = await el.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  // the detail itself ends inside the visible part of the scrolling table frame
  const overflow = await page.evaluate(() => {
    const frame = document.querySelector('.tc-table-frame')!;
    const inner = frame.getBoundingClientRect().left + frame.clientLeft + frame.clientWidth;
    return document.querySelector('.tc-detail')!.getBoundingClientRect().right - inner;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  // and the page itself never scrolls sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('kostenpflichtig (Archiv-Issue 124): plain text cell, legend sentence, price and source in the detail', async ({
  page,
}) => {
  await open(page, '/?tld=de&cols=sum_3y,email_fwd,api');
  const cell = page.locator('tr[data-provider-id="bravo"] td[data-col="email_fwd"]');
  await expect(cell).toHaveText('kostenpflichtig');
  await expect(cell).toHaveClass(/tc-paid/);
  await expect(cell.locator('.tc-badge')).toHaveCount(0);
  const legend = page.locator('.tc-legend');
  await expect(legend).toContainText('Inklusive, ohne Aufpreis.');
  await expect(legend).toContainText('Nur gegen Aufpreis. Preis und Quelle stehen in den Details.');

  const toggle = page.locator('tr[data-provider-id="bravo"] .tc-detail-toggle');
  await toggle.click();
  const detail = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(detail).toContainText('Kostenpflichtige Leistungen');
  await expect(detail).toContainText('1,00 €/Jahr brutto');
  await expect(detail).toContainText('je Domain, bis zu 10 Weiterleitungen');
  await expect(detail).toContainText('„E-Mail-Weiterleitung: 1,00 € pro Jahr“');
  await expect(detail.locator('a', { hasText: 'Quelle' }).first()).toHaveAttribute(
    'href',
    'https://bravo.example/zusatzleistungen',
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include(`#${await toggle.getAttribute('aria-controls')}`)
        .analyze()
    ).violations,
  ).toEqual([]);

  // an English provider quote on the German page is marked lang="en"
  const charlie = page.locator('tr[data-provider-id="charlie"] .tc-detail-toggle');
  await charlie.click();
  const charlieDetail = page.locator(`#${await charlie.getAttribute('aria-controls')}`);
  await expect(charlieDetail.locator('span[lang="en"]')).toHaveText(
    'API access is only available in the Pro plan.',
  );

  // without a paid cell in view: no legend entry
  await open(page, '/?tld=de&cols=sum_3y,email_fwd&f=email_fwd:ja,nein,na');
  await expect(page.locator('tbody tr[data-provider-id]').first()).toBeVisible();
  await expect(page.getByText('Nur gegen Aufpreis')).toHaveCount(0);
});
