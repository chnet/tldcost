// The static server sends the site's CSP (infra/lib/content-security-policy.json): scripts and
// styles from 'self' only, no 'unsafe-inline'. Every page type must render, hydrate its island and
// report no CSP violation.
import { expect, test } from '@playwright/test';

const PAGES: Array<[string, string | null]> = [
  ['/', '.price-table[data-hydrated]'],
  ['/en/', '.price-table[data-hydrated]'],
  ['/tld/com/', '.price-table[data-hydrated]'],
  ['/portfolio/', '.basket[data-hydrated]'],
  ['/en/portfolio/', '.basket[data-hydrated]'],
  ['/methodik/', null],
  ['/en/methodik/', null],
  ['/404.html', null],
];

for (const [path, island] of PAGES) {
  test(`no CSP violation on ${path}`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { cspViolations: string[] };
      w.cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        w.cspViolations.push(`${e.effectiveDirective} ${e.blockedURI}`),
      );
    });
    const res = await page.goto(path);
    const csp = (await res?.headerValue('content-security-policy')) ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    if (island) await page.locator(island).waitFor({ state: 'attached' });
    // external stylesheets applied (the body would use the browser default font otherwise)
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).not.toMatch(
      /^"?Times/,
    );
    await page.waitForLoadState('load');
    expect(
      await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations),
    ).toEqual([]);
  });
}
