// Report routes (REPORT_VIA 'github', src/lib/report.mjs): every report or suggestion link opens a
// GitHub issue form, and next to it the site says that issues are public (no personal data) and
// names the e-mail route without a GitHub account, in the page language (REPORT_NOTES).
// Impressum and Datenschutz are owner-approved texts and not checked here.
import { expect, test, type Page } from '@playwright/test';
import { REPORT_NOTES } from '../../src/lib/report.mjs';

const FORM = {
  anbieter: 'https://github.com/chnet/tldcost/issues/new?template=anbieter-vorschlagen.yml',
  preis: 'https://github.com/chnet/tldcost/issues/new?template=preis-falsch.yml',
};

const href = async (page: Page, selector: string) =>
  (await page.locator(selector).first().getAttribute('href')) ?? '';

for (const [path, lang, question, link] of [
  ['/', 'de', 'Anbieter fehlt?', 'Vorschlagen'],
  ['/tld/de/', 'de', 'Anbieter fehlt?', 'Vorschlagen'],
  ['/en/', 'en', 'Provider missing?', 'Suggest one'],
] as const) {
  test(`${path}: "${question}" opens the issue form, with the public-issue note`, async ({
    page,
  }) => {
    await page.goto(path);
    const p = page.locator('p.suggest-provider');
    await expect(p).toContainText(question);
    await expect(p.getByRole('link', { name: link })).toHaveAttribute('href', FORM.anbieter);
    await expect(p).toContainText(REPORT_NOTES[lang].privacy);
    await expect(p).toContainText(REPORT_NOTES[lang].noGithub);
  });
}

for (const [path, lang, suggest, report, other] of [
  ['/methodik/', 'de', 'Anbieter vorschlagen', 'Fehler melden', 'en'],
  ['/en/methodik/', 'en', 'Suggest a provider', 'Report an error', 'de'],
] as const) {
  test(`${path}: suggest and report links open the issue forms, notes in the page language`, async ({
    page,
  }) => {
    await page.goto(path);
    const main = page.locator('main');
    expect(await href(page, `main a:text-is("${suggest}")`)).toBe(FORM.anbieter);
    expect(await href(page, `main a:text-is("${report}")`)).toBe(FORM.preis);
    await expect(main).toContainText(REPORT_NOTES[lang].privacy);
    await expect(main).toContainText(REPORT_NOTES[lang].noGithub);
    await expect(main).not.toContainText(REPORT_NOTES[other].privacy);
  });
}

test('/api/: the report link opens the correction form, with the public-issue note', async ({
  page,
}) => {
  await page.goto('/api/');
  const item = page.locator('main li', { has: page.locator(`a[href="${FORM.preis}"]`) });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(REPORT_NOTES.de.privacy);
  await expect(item).toContainText(REPORT_NOTES.de.noGithub);
});

for (const path of ['/', '/tld/de/', '/methodik/', '/changelog/', '/lizenz/', '/api/']) {
  test(`${path}: no mailto report link in GitHub mode`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main a[href^="mailto:"][href*="subject=tldcost"]')).toHaveCount(0);
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
