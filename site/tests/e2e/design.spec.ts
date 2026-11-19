// Design system foundation: theme via ?theme= only (theme-init.js), fonts from this origin, header
// and footer, footnote tooltips (footnote-tips.js), axe in both themes, keyboard access.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { REPO_PENDING, REPO_PUBLIC } from '../../src/lib/report.mjs';

const tokens = JSON.parse(
  readFileSync(new URL('../../src/styles/design/tokens.json', import.meta.url), 'utf8'),
) as { color: { tokens: { name: string; value: { light: string; dark: string } }[] } };

const color = (name: string) => {
  const t = tokens.color.tokens.find((c) => c.name === name);
  if (!t) throw new Error(name);
  return t.value;
};
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test.describe('theme', () => {
  test('without ?theme= the page follows the system setting', async ({ browser }) => {
    for (const scheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await page.goto('/methodik/');
      expect(await themeAttr(page)).toBeNull();
      expect(await bodyBg(page)).toBe(rgb(color('surface')[scheme]));
      await expect(page.locator('[data-theme-choice="system"]')).toHaveAttribute(
        'aria-current',
        'true',
      );
      await context.close();
    }
  });

  test('?theme= overrides the system setting, before first paint', async ({ browser }) => {
    for (const [scheme, theme] of [
      ['light', 'dark'],
      ['dark', 'light'],
    ] as const) {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      // record the theme at the first point scripts can observe the document after <head>
      await page.addInitScript(() => {
        document.addEventListener('readystatechange', () => {
          if (document.readyState === 'interactive') {
            (window as unknown as { early: string | null }).early =
              document.documentElement.getAttribute('data-theme');
          }
        });
      });
      await page.goto(`/methodik/?theme=${theme}`);
      expect(await page.evaluate(() => (window as unknown as { early: string }).early)).toBe(theme);
      expect(await bodyBg(page)).toBe(rgb(color('surface')[theme]));
      await expect(page.locator(`[data-theme-choice="${theme}"]`)).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(page.locator('[data-theme-choice][aria-current]')).toHaveCount(1);
      await context.close();
    }
  });

  test('invalid ?theme= values fall back to the system setting', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    for (const value of ['sepia', 'DARK', '', 'light,dark', '%3Cscript%3E']) {
      await page.goto(`/methodik/?theme=${value}`);
      expect(await themeAttr(page), value).toBeNull();
      expect(await bodyBg(page), value).toBe(rgb(color('surface').dark));
      await expect(page.locator('[data-theme-choice="system"]')).toHaveAttribute(
        'aria-current',
        'true',
      );
    }
    await context.close();
  });

  test('theme-init.js is an external, blocking script in <head>; no inline theme code', async ({
    request,
  }) => {
    const html = await (await request.get('/')).text();
    const head = /<head>[\s\S]*?<\/head>/.exec(html)?.[0] ?? '';
    expect(head).toContain('<script src="/theme-init.js"></script>');
    expect(html).not.toMatch(/<script>[^<]*theme/);
  });

  test('internal links carry ?theme=, files and anchors do not', async ({ page }) => {
    await page.goto('/api/?theme=dark');
    await expect(page.locator('footer a', { hasText: 'Lizenz' }).first()).toHaveAttribute(
      'href',
      '/lizenz/?theme=dark',
    );
    await expect(page.locator('header .tc-nav a', { hasText: 'Methodik' })).toHaveAttribute(
      'href',
      '/methodik/?theme=dark',
    );
    await expect(page.locator('a[href="/api/v1/all.json"]').first()).toHaveCount(1);
    await expect(page.locator('a[href="#lizenz"]').first()).toHaveCount(1);
    await page.locator('header .tc-nav a', { hasText: 'Methodik' }).click();
    await expect(page).toHaveURL(/\/methodik\/\?theme=dark$/);
    expect(await themeAttr(page)).toBe('dark');
  });

  test('the switch keeps the other parameters and changes only the theme', async ({ page }) => {
    await page.goto('/?tld=com&vat=net&theme=dark');
    await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
    await page.locator('[data-theme-choice="light"]').click();
    await expect(page).toHaveURL(/\?tld=com&vat=net&theme=light$/);
    expect(await themeAttr(page)).toBe('light');
    await page.locator('[data-theme-choice="system"]').click();
    await expect(page).toHaveURL(/\?tld=com&vat=net$/);
    expect(await themeAttr(page)).toBeNull();
  });

  test('the theme survives table changes and a reload', async ({ page }) => {
    await page.goto('/?theme=dark');
    await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
    await page.locator('th[data-col="setup"] button').click();
    await page.locator('input[name="vat"][value="net"]').check();
    await expect(page).toHaveURL(/\?sort=setup&vat=net&theme=dark$/);
    await page.reload();
    await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
    expect(await themeAttr(page)).toBe('dark');
    await expect(page.locator('th[data-col="setup"]')).toHaveAttribute('aria-sort', 'ascending');
  });

  test('the table drops an invalid theme value from the URL', async ({ page }) => {
    await page.goto('/?theme=sepia');
    await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
    await page.locator('th[data-col="setup"] button').click();
    await expect(page).toHaveURL(/\?sort=setup$/);
  });

  test('without JavaScript the switch is hidden and the page follows the system', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/methodik/?theme=light');
    await expect(page.locator('.tc-switch:not([data-lang-switch])')).toBeHidden();
    // the LanguageSwitch is plain links and stays (Archiv-Issue 33)
    await expect(page.locator('.tc-switch[data-lang-switch]')).toBeVisible();
    expect(await bodyBg(page)).toBe(rgb(color('surface').dark));
    await context.close();
  });

  test('switching themes stores nothing and loads fonts only from this origin', async ({
    page,
    context,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? '').origin;
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/methodik/');
    await page.locator('[data-theme-choice="dark"]').click();
    await page.locator('header .tc-nav a', { hasText: 'API' }).click();
    await page.waitForLoadState('networkidle');
    const foreign = requests.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin);
    expect(foreign).toEqual([]);
    expect(requests.some((u) => /\/fonts\/[a-z-]+\.woff2$/.test(u))).toBe(true);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(await page.evaluate(() => document.fonts.check('600 20px "Spline Sans Mono"'))).toBe(
      true,
    );
  });
});

test.describe('header and footer', () => {
  test('wordmark, navigation with aria-current and the operator line', async ({ page }) => {
    await page.goto('/methodik/');
    await expect(page.locator('.tc-wordmark')).toHaveText('tldcost.io');
    await expect(page.locator('.tc-nav a[aria-current="page"]')).toHaveText('Methodik');
    await expect(page.locator('footer')).toContainText(
      'Ein Projekt der CHnet Solutions Plus UG · Daten CC BY 4.0',
    );
    for (const label of ['Impressum', 'Datenschutz', 'Changelog', 'Lizenz']) {
      await expect(page.locator('footer a', { hasText: label })).toHaveCount(1);
    }
    // GitHub only once the repository is public (src/lib/report.mjs), otherwise the notice
    await expect(page.locator('footer a', { hasText: 'GitHub' })).toHaveCount(REPO_PUBLIC ? 1 : 0);
    if (!REPO_PUBLIC) await expect(page.locator('footer')).toContainText(REPO_PENDING);
    // GitHub Sponsors: a plain link, nothing loaded from GitHub
    await expect(page.locator('footer a', { hasText: 'Unterstützen' })).toHaveAttribute(
      'href',
      'https://github.com/sponsors/chnet',
    );
    await page.goto('/tld/de/');
    await expect(page.locator('.tc-nav a[aria-current="page"]')).toHaveText('Vergleich');
  });

  test('keyboard: skip link first, then the frame; focus ring in accent', async ({ page }) => {
    await page.goto('/methodik/');
    await page.keyboard.press('Tab');
    const skip = page.locator('.tc-skip');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.locator('.tc-wordmark')).toBeFocused();
    // the main navigation (Vergleich, Portfolio, Methodik, API), then the theme switch
    const navLinks = await page.locator('header .tc-nav a').count();
    for (let i = 0; i < navLinks + 1; i++) await page.keyboard.press('Tab');
    const focused = page.locator('[data-theme-choice="system"]');
    await expect(focused).toBeFocused();
    const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
    // back to the skip link (nav links, wordmark, skip link), which jumps to main
    for (let i = 0; i < navLinks + 2; i++) await page.keyboard.press('Shift+Tab');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('footnote tooltips', () => {
  // the markup contract of the table (class tc-fn, href to the note); set here so the test does
  // not depend on the table version
  async function markers(page: Page) {
    await page.goto('/');
    await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      for (const a of document.querySelectorAll('a[href^="#fn-"]')) a.classList.add('tc-fn');
    });
    return page.locator('a.tc-fn').first();
  }

  test('focus and hover show the note text; Esc and blur close it', async ({ page }) => {
    const marker = await markers(page);
    const href = (await marker.getAttribute('href')) ?? '';
    const note = (await page.locator(href).textContent())?.trim() ?? '';
    expect(note).not.toBe('');
    const tip = page.locator('#tc-tip');
    await marker.focus();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(note);
    await expect(tip).toHaveAttribute('aria-hidden', 'true');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await marker.hover();
    await expect(tip).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
  });

  test('the tooltip stays inside the viewport', async ({ page }) => {
    const marker = await markers(page);
    await marker.focus();
    const box = await page.locator('#tc-tip').boundingBox();
    const vp = page.viewportSize();
    expect(box && vp).toBeTruthy();
    if (!box || !vp) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  });

  test('text pages load no footnote script', async ({ request }) => {
    const html = await (await request.get('/methodik/')).text();
    expect(html).not.toContain('footnote-tips.js');
    expect(html).not.toContain('id="tc-tip"');
  });
});

for (const theme of ['light', 'dark'] as const) {
  for (const path of ['/', '/methodik/', '/api/', '/tld/de/', '/lizenz/']) {
    test(`axe (${theme}): no serious or critical violations on ${path}`, async ({ page }) => {
      await page.goto(`${path}?theme=${theme}`);
      expect(await themeAttr(page)).toBe(theme);
      const result = await new AxeBuilder({ page }).analyze();
      const bad = result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(bad).toEqual([]);
    });
  }
}
