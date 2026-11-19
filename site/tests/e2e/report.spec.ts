// Report routes in mail mode (REPORT_VIA 'mail', src/lib/report.mjs): every report or suggestion
// link is a mailto with a subject, and no GitHub issue link is visible. The repository is public
// since 19.11.2026 (REPO_PUBLIC); switching reports to GitHub issues is a separate decision.
// Impressum and Datenschutz are owner-approved texts and not checked here.
import { expect, test, type Page } from '@playwright/test';

const subject = async (page: Page, selector: string) => {
  const href = (await page.locator(selector).first().getAttribute('href')) ?? '';
  const url = new URL(href);
  expect(url.protocol + url.pathname).toBe('mailto:hello@chnet.solutions');
  return url.searchParams.get('subject');
};

for (const path of ['/', '/tld/de/']) {
  test(`${path}: "Anbieter fehlt? Vorschlagen" is a mailto with subject`, async ({ page }) => {
    await page.goto(path);
    const p = page.locator('p.suggest-provider');
    await expect(p).toContainText('Anbieter fehlt?');
    await expect(p.getByRole('link', { name: 'Vorschlagen' })).toBeVisible();
    expect(await subject(page, 'p.suggest-provider a')).toBe('tldcost: Anbieter vorschlagen');
  });
}

test('/methodik/: suggest and report links are mailto links with subjects', async ({ page }) => {
  await page.goto('/methodik/');
  const main = page.locator('main');
  expect(await subject(page, 'main a:text-is("Anbieter vorschlagen")')).toBe(
    'tldcost: Anbieter vorschlagen',
  );
  expect(await subject(page, 'main a:text-is("Fehler melden")')).toBe('tldcost: Fehler melden');
  await expect(main).not.toContainText('Ohne GitHub-Konto');
});

for (const path of ['/', '/tld/de/', '/methodik/', '/changelog/', '/lizenz/', '/api/']) {
  test(`${path}: no GitHub issue link in mail mode`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('a[href*="/issues/new"]')).toHaveCount(0);
  });
}

// REPO_PUBLIC true (src/lib/report.mjs): pages link into github.com/chnet/tldcost. Issue and pull
// request numbers from before 19.11.2026 belong to the private predecessor repository, so no page
// links an issue or pull request by number.
test('repo links on the built pages: present, and never to an issue or PR number', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const paths = [...sitemap.matchAll(/<loc>https:\/\/tldcost\.io(\/[^<]*)<\/loc>/g)].map(
    (m) => m[1] ?? '/',
  );
  expect(paths.length).toBeGreaterThan(5);
  const repoLinks = /<a\b[^>]*\bhref="(https:\/\/github\.com\/chnet\/tldcost[^"]*)"/gi;
  const all: string[] = [];
  const numbered: string[] = [];
  for (const path of [...paths, '/404.html']) {
    const html = await (await request.get(path)).text();
    for (const m of html.matchAll(repoLinks)) {
      all.push(`${path}: ${m[1]}`);
      if (/\/(issues|pull)\/\d/.test(m[1] ?? '')) numbered.push(`${path}: ${m[1]}`);
    }
  }
  expect(all.length).toBeGreaterThan(0);
  expect(numbered).toEqual([]);
});

test('footer links the source code on GitHub instead of the pending notice', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.locator('a', { hasText: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/chnet/tldcost',
  );
  await expect(footer).not.toContainText('Der Quellcode wird in Kürze veröffentlicht.');
});

// :::nur-oeffentlich text now that the repository is public (repo-blocks.mjs); the private variants
// and the directive markers never show.
test('text pages show the public-repo wording, not the private one', async ({ page }) => {
  await page.goto('/methodik/');
  const methodik = page.locator('main');
  await expect(methodik).toContainText('Alle Daten liegen offen im GitHub-Repository');
  await expect(methodik).not.toContainText('Alle Daten liegen offen als JSON unter /api/');
  await page.goto('/changelog/');
  const changelog = page.locator('main');
  await expect(changelog).toContainText('Nach Anbieter oder TLD filtern');
  await expect(changelog).toContainText('Seit der Veröffentlichung des Repositorys am 19.11.2026');
  await expect(changelog).not.toContainText(
    'jede Änderung an den Daten ein Commit im öffentlichen Repository',
  );
  for (const path of ['/methodik/', '/changelog/']) {
    await page.goto(path);
    await expect(page.locator('main')).not.toContainText(':::');
  }
});
