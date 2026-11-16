# CLAUDE.md — tldcost

Transparent, verifiable price comparison for domain registrations (focus on Germany). The concept is in [`docs/concepts/tldcost.md`](docs/concepts/tldcost.md), the decisions are in [`docs/decisions.md`](docs/decisions.md). This file is the guide for contributors and coding agents.

- **Repo:** `chnet/tldcost`, default branch `main`.
- **`main` is protected:** every change goes through a pull request; no direct pushes, no force-push.
- **Commit identity:** commits in this repo are authored as `chnet <coins4me@users.noreply.github.com>`. The pre-push hook (`.husky/pre-push`) and CI check author and committer e-mails of pushes to this repo against `config/chnet-commit-emails.txt`. Outside contributors pushing to their own fork are not checked.
- **Hosting:** Astro (static) on S3 + CloudFront, infrastructure as CDK (TypeScript) in `infra/`, deployed from GitHub Actions via OIDC.
- **Public repo (Open Data, decision Q7).** Write everything — code, comments, commits, issues, PRs — for public readers. No credentials, account IDs, internal hostnames or personal data.

## Checks before a pull request

- `npm run validate` — lint, format, typecheck and data validation (`scripts/validate-data.mjs`).
- `npm test` — unit tests of all workspaces and `scripts/`.
- `npm run check -w site` — Astro/TypeScript check of the site.
- `npm run test:e2e -w site` — Playwright tests of the site (ports 4401 and 4402).
