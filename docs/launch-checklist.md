# Launch checklist

Items before and around the launch of tldcost.io (archive issue 13; risks in
[`concepts/tldcost.md`](concepts/tldcost.md) § 6). Each done item names its evidence: a file, a test
or a CI step. Status as of 2026-11-16.

| Item | Status | Evidence |
|---|---|---|
| Short legal review of Methodik, Impressum and the operator badge | **open** (owner) | Review note below, to be dated when the review is done |
| Methodik page | done | [`docs/pages/methodik.md`](pages/methodik.md), English [`docs/pages/en/methodik.md`](pages/en/methodik.md); rendered at `/methodik/` and `/en/methodik/` |
| Impressum and Datenschutz | done | [`docs/pages/impressum.md`](pages/impressum.md), [`docs/pages/datenschutz.md`](pages/datenschutz.md) and their English translations in `docs/pages/en/` |
| Operator badge: a normal row, never preferred | done | Methodik section „Eigenes Angebot des Betreibers“; tests below |
| Lighthouse with budgets | done | [`site/lighthouserc.json`](../site/lighthouserc.json), step „Lighthouse“ in [`.github/workflows/site.yml`](../.github/workflows/site.yml) on every pull request |
| Open Graph images, German and English | done | `site/public/og/de.png` and `site/public/og/en.png`, rendered offline by [`site/scripts/og-images.mjs`](../site/scripts/og-images.mjs); tests below |
| Announcement (Hacker News, r/webhosting, LinkedIn) | **open** | After the repository is public |

## Evidence in detail

**Mandatory pages.** `site/tests/e2e/pages.spec.ts` checks that `/impressum/`, `/datenschutz/`,
`/methodik/` and `/changelog/` exist and are linked; `site/tests/e2e/design.spec.ts` checks the
footer links (Impressum, Datenschutz, Changelog, Lizenz).

**Privacy as described in Datenschutz.** `site/tests/e2e/privacy.spec.ts` (no cookies, no storage,
only same-origin requests, no console errors), the privacy tests in `filters.spec.ts` and
`portfolio.spec.ts`, and `site/tests/check-no-foreign-assets.mjs` on the build (CI step in
`site.yml`): nothing is loaded from another origin.

**Operator badge.** `site/tests/e2e/operator-neutral.spec.ts` runs against two fixture builds,
with and without the operator flag:

- sorting by every column gives the same order in both builds;
- the cells marked as the lowest value are identical;
- the badge appears only in the build with the flag, and the row otherwise looks like its
  neighbours.

`site/tests/e2e/portfolio.spec.ts` checks the same for the portfolio calculator (order and totals).

**Lighthouse budgets** (mobile, fixture build, median of 5 runs):

- performance score ≥ 0.95;
- accessibility ≥ 0.95 and best practices ≥ 0.95;
- SEO ≥ 0.9 (warning only);
- script size ≤ 42 000 bytes;
- Total Blocking Time ≤ 300 ms;
- Largest Contentful Paint ≤ 2.5 s.

**Open Graph.** Every indexed page names the image of its language, its title, description and
canonical URL (`og:*`, `twitter:card`); the 404 page has none. Tests: `site/tests/e2e/i18n.spec.ts`
(tags and served file) and `site/tests/unit/og-images.test.ts` (PNG, 1200 × 630, under 300 KB).
The images use only the self-hosted fonts and the colours of the light theme; no external service.

## Legal review note

To be filled in by the operator after the review:

- Date:
- Scope: Methodik (`/methodik/`), Impressum (`/impressum/`), operator badge in the table and in the
  portfolio calculator
- Result and changes:

## Before the repository goes public

These items are part of the switch to a public repository and are done by the owner.

| Item | Status | Evidence |
|---|---|---|
| Repository links back on (`REPO_PUBLIC`) | done | [`site/src/lib/report.mjs`](../site/src/lib/report.mjs) (repository public since 19.11.2026); deploy after the change |
| GitHub report links back on (`REPORT_VIA`) | done | [`site/src/lib/report.mjs`](../site/src/lib/report.mjs) (`'github'`, owner decision 19.11.2026); next to every report link and at the top of each issue form: issues are public, no personal data; e-mail without a GitHub account. Deploy after the change |
| Private vulnerability reporting enabled | open | [`SECURITY.md`](../SECURITY.md) names it as the preferred channel; e-mail until then |
| Repository settings: secret scanning with push protection, Dependabot alerts, code scanning, read-only default `GITHUB_TOKEN`, approval for workflow runs of outside contributors, wiki off | open | Repository settings |
| Commit identity allowlist names only the bots in use | done | [`config/chnet-commit-emails.txt`](../config/chnet-commit-emails.txt) (the only bot address is `github-actions[bot]`; the other entries are the project's noreply address, GitHub web merges and the co-author address) |
| Scraper User-Agent points to the Methodik page | done | Default `tldcost-bot/<version> (+https://tldcost.io/methodik/)` in [`scraper/src/cli.ts`](../scraper/src/cli.ts) |
