// Price history in the row detail (Archiv-Issue 51). Fixtures: alpha .de has 3 history entries
// (shown), bravo .de 2 (below the threshold, not shown). The sparkline is decorative; the list
// carries the same values. Lines need 3:1 against the detail background in both themes.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const detailOf = async (page: Page, provider: string) => {
  const toggle = page.locator(`tr[data-provider-id="${provider}"] .tc-detail-toggle`);
  await toggle.click();
  return page.locator(`#${await toggle.getAttribute('aria-controls')}`);
};

test('3 entries: sparkline and the same values as a list (gross, then net)', async ({ page }) => {
  await open(page, '/?tld=de');
  const detail = await detailOf(page, 'alpha');
  const section = detail.locator('section.tc-history');
  await expect(section.getByRole('heading', { name: 'Preisverlauf', exact: true })).toBeVisible();
  const svg = section.locator('svg.tc-spark');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('aria-hidden', 'true');
  await expect(svg.locator('path.tc-spark-year1')).toHaveCount(2);
  await expect(svg.locator('path.tc-spark-renewal')).toHaveCount(2);
  await expect(section).toContainText('Je Datenstand, brutto in Euro pro Jahr:');
  const items = section.locator('ol.tc-history-list > li');
  await expect(items).toHaveText([
    /^01\.11\.2026: Jahr 1 0,99\s€, Verlängerung 5,00\s€$/,
    /^06\.11\.2026: Jahr 1 1,99\s€, Verlängerung 5,50\s€$/,
    /^12\.11\.2026: Jahr 1 0,99\s€, Verlängerung 6,00\s€$/,
  ]);
  await expect(items.first().locator('time')).toHaveAttribute('datetime', '2026-11-01');

  await open(page, '/?tld=de&vat=net');
  const net = (await detailOf(page, 'alpha')).locator('section.tc-history');
  await expect(net).toContainText('Je Datenstand, netto in Euro pro Jahr:');
  await expect(net.locator('ol.tc-history-list > li').last()).toHaveText(
    /^12\.11\.2026: Jahr 1 0,83\s€, Verlängerung 5,04\s€$/,
  );
});

test('2 entries: no price history section', async ({ page }) => {
  await open(page, '/?tld=de');
  const detail = await detailOf(page, 'bravo');
  await expect(detail.getByRole('heading', { name: 'Vertrag', exact: true })).toBeVisible();
  await expect(detail.locator('section.tc-history')).toHaveCount(0);
  await expect(detail).not.toContainText('Preisverlauf');
});

test('English page: heading, caption and dates in English', async ({ page }) => {
  await open(page, '/en/?tld=de');
  const section = (await detailOf(page, 'alpha')).locator('section.tc-history');
  await expect(section.getByRole('heading', { name: 'Price history', exact: true })).toBeVisible();
  await expect(section).toContainText('Per data state, gross in euros per year:');
  await expect(section.locator('ol.tc-history-list > li').first()).toContainText('1 Nov 2026');

  await open(page, '/en/?tld=de&vat=net');
  const net = (await detailOf(page, 'alpha')).locator('section.tc-history');
  await expect(net).toContainText('Per data state, net in euros per year:');
  await expect(net.locator('ol.tc-history-list > li').last()).toHaveText(
    /^12 Nov 2026: Year 1 €0\.83, Renewal €5\.04$/,
  );
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: lines reach 3:1 against the detail background, axe clean`, async ({ page }) => {
    await open(page, `/?tld=de&theme=${theme}`);
    const detail = await detailOf(page, 'alpha');
    await expect(detail.locator('svg.tc-spark')).toBeVisible();
    const ratios = await detail.evaluate((el) => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (c: string) => {
        const [r, g, b] = rgb(c).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      };
      // the detail row's cell carries the background (--surface-sunken)
      const bg = getComputedStyle(el.querySelector('td')!).backgroundColor;
      return ['.tc-spark-year1', '.tc-spark-renewal'].map((sel) => {
        const stroke = getComputedStyle(el.querySelector(`svg.tc-spark ${sel}`)!).stroke;
        const [hi, lo] = [lum(stroke), lum(bg)].sort((a, b) => b - a);
        return ((hi as number) + 0.05) / ((lo as number) + 0.05);
      });
    });
    for (const r of ratios) expect(r).toBeGreaterThanOrEqual(3);
    const result = await new AxeBuilder({ page }).include('.tc-detail-row').analyze();
    const bad = result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(bad).toEqual([]);
  });
}

// The history is its own chunk, loaded on opening (astro.config.mjs stubs Vite's preload helper,
// which would also load the chunk's CSS): it arrives styled by the page's stylesheet.
for (const vat of ['gross', 'net'] as const) {
  test(`lazy history chunk (${vat}): loaded on opening, styled`, async ({ page }) => {
    const loaded: string[] = [];
    page.on('request', (r) => {
      if (/\/_astro\/RowHistory\.[\w-]+\.js$/.test(r.url())) loaded.push(r.url());
    });
    await open(page, `/?tld=de&vat=${vat}`);
    expect(loaded).toEqual([]);
    const section = (await detailOf(page, 'alpha')).locator('section.tc-history');
    await expect(section.locator('svg.tc-spark')).toBeVisible();
    expect(loaded).toHaveLength(1);
    const style = await section.evaluate((el) => {
      const year1 = getComputedStyle(el.querySelector('svg.tc-spark .tc-spark-year1')!);
      const key = getComputedStyle(el.querySelector('.tc-spark-key.tc-spark-year1')!);
      const list = getComputedStyle(el.querySelector('ol.tc-history-list')!);
      return {
        fill: year1.fill,
        dash: year1.strokeDasharray,
        key: key.borderTopStyle,
        listPad: list.paddingLeft,
      };
    });
    expect(style).toEqual({ fill: 'none', dash: '5px, 3px', key: 'dashed', listPad: '12px' });
    await expect(section).toContainText(vat === 'gross' ? 'brutto' : 'netto');
  });
}

test('lazy history chunk: open, close, open again: requested once', async ({ page }) => {
  const loaded: string[] = [];
  page.on('request', (r) => {
    if (/\/_astro\/RowHistory\.[\w-]+\.js$/.test(r.url())) loaded.push(r.url());
  });
  await open(page, '/?tld=de');
  const toggle = page.locator('tr[data-provider-id="alpha"] .tc-detail-toggle');
  const detail = await detailOf(page, 'alpha');
  await expect(detail.locator('svg.tc-spark')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('section.tc-history svg.tc-spark')).toBeVisible();
  expect(loaded).toHaveLength(1);
});

test('history chunk fails to load: a short note, the detail stays usable, no uncaught error', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) =>
      document.documentElement.setAttribute('data-rejected', String(e.reason)),
    );
  });
  await page.route(/\/_astro\/RowHistory\.[\w-]+\.js$/, (r) => r.abort());
  await open(page, '/?tld=de');
  const detail = await detailOf(page, 'alpha');
  const section = detail.locator('section.tc-history');
  await expect(section).toContainText('Der Preisverlauf konnte nicht geladen werden.');
  await expect(section.locator('svg')).toHaveCount(0);
  await expect(detail.getByRole('heading', { name: 'Vertrag', exact: true })).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Fehler melden' })).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.locator('html')).not.toHaveAttribute('data-rejected', /.*/);
});
