#!/usr/bin/env node
// check-main-identity.mjs — commit identities of every push to main (tldcost addition, not part of
// the shared identity guard). Same allowlist as
// check-commit-identity.mjs, with ONE exception for the public contribution workflow: a
// squash/merge of a fork PR has an outside author and the committer noreply@github.com. Order per
// commit (the committer must be on the allowlist in every case; noreply@github.com is):
//   1. author on the allowlist -> pass (own squash merges included, no secret needed)
//   2. author not on it, committer GitHub, and the GitHub API confirms the commit is the merge
//      commit of a merged PR -> hard author-domain denylist from the Actions secret
//      AUTHOR_DOMAIN_DENYLIST (comma-separated; never in the repo, never logged: a hit prints only
//      "denylist match"). FAIL CLOSED: an empty/missing secret fails.
//   3. anything else -> fail.
// Offending e-mails are not printed either.
//
// Env: BEFORE_SHA, HEAD_SHA (github.event.before / github.sha), GITHUB_REPOSITORY, GITHUB_TOKEN,
// AUTHOR_DOMAIN_DENYLIST (optional). Exit 0 = ok, 1 = finding, 2 = usage.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { commitsOf, knownCommit } from './check-commit-identity.mjs';
import { emailAllowed, emailsFile, readList } from './lib/chnet-context.mjs';

const GITHUB_MERGER = 'noreply@github.com';
const ZERO = /^0+$/;
const git = (args) =>
  execFileSync('/usr/bin/git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Denylist domains (lower case) or null when the secret is empty/missing. */
export function parseDenylist(raw) {
  const list = String(raw ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return list.length ? list : null;
}

/** True if the e-mail's domain is a listed domain or a subdomain of one. */
export function domainDenied(email, denylist) {
  const domain = String(email).split('@').at(-1).trim().toLowerCase();
  return denylist.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** rev-list args for the pushed range; a new branch or unknown old tip checks the head only. */
export function pushRevArgs(before, head, known = knownCommit) {
  if (!before || ZERO.test(before) || !known(before)) return [`${head}^!`];
  return [`${before}..${head}`];
}

/** PR number if `sha` is the merge commit of a merged PR of `repo`, else null (GitHub API). */
export async function mergedPrFor(sha, { repo, token, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/commits/${sha}/pulls`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for commit ${sha.slice(0, 10)}`);
  const pr = (await res.json()).find((p) => p.merged_at && p.merge_commit_sha === sha);
  return pr ? pr.number : null;
}

/** Findings for the commits of a push to main (order: see header). */
export async function checkCommits(commits, { patterns, denylist, prFor }) {
  const findings = [];
  for (const c of commits) {
    const id = c.sha.slice(0, 10);
    if (!emailAllowed(c.committer, patterns)) {
      findings.push(`${id}: committer e-mail not on the CHnet allowlist`);
    }
    if (emailAllowed(c.author, patterns)) continue; // 1
    const pr = c.committer === GITHUB_MERGER ? await prFor(c.sha) : null;
    if (pr === null) {
      findings.push(`${id}: author e-mail not on the CHnet allowlist`); // 3
    } else if (denylist === null) {
      findings.push(`${id}: merged PR #${pr}: denylist secret missing — fail closed`); // 2
    } else if (domainDenied(c.author, denylist)) {
      findings.push(`${id}: merged PR #${pr}: author denylist match`); // 2
    }
  }
  return findings;
}

export async function main(env = process.env, { run = git, prFor } = {}) {
  const { BEFORE_SHA, HEAD_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN } = env;
  if (!HEAD_SHA || (!prFor && !(GITHUB_REPOSITORY && GITHUB_TOKEN))) {
    console.error('usage: HEAD_SHA, BEFORE_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN must be set');
    return 2;
  }
  const lookup =
    prFor ?? ((sha) => mergedPrFor(sha, { repo: GITHUB_REPOSITORY, token: GITHUB_TOKEN }));
  const commits = commitsOf(
    pushRevArgs(BEFORE_SHA, HEAD_SHA, (sha) => knownCommit(sha, run)),
    run,
  );
  const findings = await checkCommits(commits, {
    patterns: readList(emailsFile()),
    denylist: parseDenylist(env.AUTHOR_DOMAIN_DENYLIST),
    prFor: lookup,
  });
  if (findings.length) {
    console.error(`CHnet main identity check FAILED:\n  - ${findings.join('\n  - ')}`);
    return 1;
  }
  console.log(`CHnet main identity ok (${commits.length} commit(s) checked)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
