// Report routes while the repository is private (REPORT_VIA 'mail', src/lib/report.mjs): every
// report or suggestion link is a mailto with a subject, and no GitHub issue link is visible.
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

// REPO_PUBLIC false (src/lib/report.mjs): while github.com/chnet/tldcost is private, no page links
// into it. Impressum and Datenschutz are owner texts: only their text (main) may still link there.
test('no link into the private repository on any built page', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const paths = [...sitemap.matchAll(/<loc>https:\/\/tldcost\.io(\/[^<]*)<\/loc>/g)].map(
    (m) => m[1] ?? '/',
  );
  expect(paths.length).toBeGreaterThan(5);
  const repoLinks = /<a\b[^>]*\bhref="https:\/\/github\.com\/chnet\/tldcost[^"]*"/gi;
  const found: string[] = [];
  for (const path of [...paths, '/404.html']) {
    let html = await (await request.get(path)).text();
    if (path === '/impressum/' || path === '/datenschutz/') {
      html = html.replace(/<main\b[\s\S]*?<\/main>/i, '');
    }
    for (const m of html.matchAll(repoLinks)) found.push(`${path}: ${m[0]}`);
  }
  expect(found).toEqual([]);
});

test('footer names the open data and the pending source code instead of a repo link', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('Der Quellcode wird in Kürze veröffentlicht.');
});

// :::nur-privat text while the repository is private (repo-blocks.mjs); the public variants and the
// directive markers never show.
test('text pages show the private-repo wording, not the public one', async ({ page }) => {
  await page.goto('/methodik/');
  const methodik = page.locator('main');
  await expect(methodik).toContainText('Alle Daten liegen offen als JSON unter /api/');
  await expect(methodik).not.toContainText('Alle Daten liegen offen im GitHub-Repository');
  await page.goto('/changelog/');
  const changelog = page.locator('main');
  await expect(changelog).toContainText(
    'jede Änderung an den Daten ein Commit im öffentlichen Repository',
  );
  await expect(changelog).not.toContainText('Nach Anbieter oder TLD filtern');
  for (const path of ['/methodik/', '/changelog/']) {
    await page.goto(path);
    await expect(page.locator('main')).not.toContainText(':::');
  }
});
