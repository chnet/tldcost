#!/usr/bin/env node
// check-commit-identity.mjs — CHnet repos accept only CHnet commit identities (commit identity
// rule). Author AND committer e-mail of every new commit must
// be on config/chnet-commit-emails.txt (allowlist only — no foreign addresses live in this repo);
// on push the remote must be owned by coins4me or chnet. Offending e-mails are NOT printed (they
// would end up in CHnet CI logs) — only the commit and the field.
//
// One narrow exception (owner decision 2026-11-15): Dependabot's own, GitHub-signed commits on its
// dependabot/** branch that only touch dependency manifests or action pins
// (scripts/lib/dependabot-exemption.mjs). It applies only with --branch and --actor (CI) and checks
// the commits via the GitHub API (GITHUB_REPOSITORY, GITHUB_TOKEN; the token is never printed).
//
// Usage:
//   node scripts/check-commit-identity.mjs --range <base>..<head> [--branch <name> --actor <login>]
//                                          (Validate on PRs, Identity on branch pushes)
//   node scripts/check-commit-identity.mjs --range <base>..<head> --tag <object>
//                                          (Identity on tag pushes: also the tagger e-mail of an
//                                          annotated tag; a lightweight tag has none)
//   node scripts/check-commit-identity.mjs --pre-push <remote> <url>  (.husky/pre-push, refs on stdin)
// Exit 0 = ok, 1 = foreign identity or remote, 2 = usage.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  CHNET_OWNERS,
  emailAllowed,
  emailsFile,
  readList,
  remoteOwner,
} from './lib/chnet-context.mjs';
import { rangeExemption } from './lib/dependabot-exemption.mjs';

const ZERO = /^0+$/;
// a plain remote name (origin, upstream); a URL or anything with glob characters is not one
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// absolute path (Sonar S4036): same location on macOS and the Ubuntu runners
const git = (args) =>
  execFileSync('/usr/bin/git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Commits of a rev-list spec as {sha, author, committer}. */
export function commitsOf(revArgs, run = git) {
  const out = run(['log', '--format=%H%x09%ae%x09%ce', ...revArgs]);
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, author, committer] = l.split('\t');
      return { sha, author, committer };
    });
}

/** Findings for commits whose author or committer e-mail is not allowed. */
export function identityFindings(commits, patterns) {
  const findings = [];
  for (const c of commits) {
    if (!emailAllowed(c.author, patterns))
      findings.push(`${c.sha.slice(0, 10)}: author e-mail not on the CHnet allowlist`);
    if (!emailAllowed(c.committer, patterns))
      findings.push(`${c.sha.slice(0, 10)}: committer e-mail not on the CHnet allowlist`);
  }
  return findings;
}

/** True if the object is a commit known locally (`git cat-file -e <sha>^{commit}`). */
export function knownCommit(sha, run = git) {
  try {
    run(['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * rev-list args for the refs git passes to pre-push on stdin: the new commits only, i.e. everything
 * reachable from the local tip that neither the old remote tip nor a remote-tracking ref OF THE PUSH
 * REMOTE has (a rebase onto a newer main does not re-check main). Only that remote's refs count:
 * commits on another remote's tracking refs (e.g. an ad-hoc refs/remotes/pr/*) are checked like any
 * other. A push to a bare URL (no remote name) excludes no tracking refs at all. An old remote tip
 * unknown locally (force push over unfetched commits) is left out instead of failing.
 */
export function prePushRevArgs(stdin, known = knownCommit, remote = '') {
  const tracking = REMOTE_NAME.test(remote) ? [`--remotes=${remote}`] : [];
  const specs = [];
  for (const line of stdin.split('\n').filter(Boolean)) {
    const [, localSha, , remoteSha = ''] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue; // branch deletion
    const oldTip = !ZERO.test(remoteSha) && remoteSha && known(remoteSha) ? [remoteSha] : [];
    specs.push([localSha, '--not', ...oldTip, ...tracking]);
  }
  return specs;
}

/** Nested tags (a tag object pointing at another tag object) followed at most this deep. */
const MAX_TAG_DEPTH = 10;

/**
 * Findings for the tagger e-mails of an annotated tag object and of every tag object it points at
 * (a tag can wrap another tag); none for a commit or a lightweight tag (the object is the commit
 * itself). An unreadable object, a tagger line without an e-mail or a chain deeper than
 * MAX_TAG_DEPTH is a finding, never a pass.
 */
export function taggerFindings(object, patterns, run = git) {
  const findings = [];
  let current = object;
  for (let depth = 0; depth <= MAX_TAG_DEPTH; depth++) {
    let type;
    try {
      type = run(['cat-file', '-t', current]).trim();
    } catch {
      return [...findings, `cannot read the tag object ${current.slice(0, 10)}`];
    }
    if (type !== 'tag') return findings;
    const header = run(['cat-file', 'tag', current]).split('\n\n')[0] ?? '';
    const lines = header.split('\n');
    const line = lines.find((l) => l.startsWith('tagger '));
    // a tag object without a tagger line (possible with old or hand-made tags) has no identity
    if (line !== undefined) {
      const email = /<([^<>]*)>/.exec(line)?.[1];
      if (email === undefined || !emailAllowed(email, patterns)) {
        findings.push(`tag ${current.slice(0, 10)}: tagger e-mail not on the CHnet allowlist`);
      }
    }
    const next = lines.find((l) => l.startsWith('object '))?.slice('object '.length).trim();
    if (!next) return [...findings, `tag ${current.slice(0, 10)}: no object line`];
    current = next;
  }
  return [...findings, `tag ${object.slice(0, 10)}: nested deeper than ${MAX_TAG_DEPTH} tags`];
}

/**
 * Objects pushed (pre-push stdin), deletions left out: every one goes through taggerFindings, so a
 * tag object pushed by raw SHA (`git push origin <tag object>:refs/tags/x`) is checked too; a commit
 * yields no finding there.
 */
export function prePushTags(stdin) {
  return stdin
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/)[1] ?? '')
    .filter((localSha) => localSha && !ZERO.test(localSha));
}

/** Value of `--name <value>` in argv, or ''. */
const flag = (argv, name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : '';
};

export async function main(
  argv,
  {
    stdin = '',
    run = git,
    known = (sha) => knownCommit(sha, run),
    env = process.env,
    fetchFn = fetch,
  } = {},
) {
  const patterns = readList(emailsFile());
  const out = [];
  let specs = [];
  let ctx = null;
  if (argv[0] === '--range' && argv[1]) {
    specs = [[argv[1]]];
    const tag = flag(argv, '--tag');
    if (tag) {
      // a tag push: no branch context, so the Dependabot exception never applies
      out.push(...taggerFindings(tag, patterns, run));
    } else {
      ctx = { branch: flag(argv, '--branch'), actor: flag(argv, '--actor') };
    }
  } else if (argv[0] === '--pre-push' && argv[2]) {
    const owner = remoteOwner(argv[2]);
    if (!CHNET_OWNERS.includes(owner)) {
      out.push(`remote ${argv[1]} is not owned by ${CHNET_OWNERS.join(' or ')}`);
    }
    specs = prePushRevArgs(stdin, known, argv[1]);
    out.push(...prePushTags(stdin).flatMap((object) => taggerFindings(object, patterns, run)));
  } else {
    console.error(
      'usage: check-commit-identity.mjs --range <base>..<head> [--branch <name> --actor <login> | --tag <object>] | --pre-push <remote> <url>'
    );
    return 2;
  }
  let count = 0;
  for (const spec of specs) {
    let commits;
    try {
      commits = commitsOf(spec, run);
    } catch (err) {
      const why =
        String(err?.stderr ?? err?.message ?? err)
          .split('\n')
          .find(Boolean) ?? 'git failed';
      out.push(`cannot list the commits of ${spec.join(' ')}: ${why}`);
      continue;
    }
    count += commits.length;
    const findings = identityFindings(commits, patterns);
    if (findings.length && ctx) {
      // the Dependabot exception: null = does not apply (findings stay as they are)
      const exemption = await rangeExemption(commits, ctx, {
        run,
        repo: env.GITHUB_REPOSITORY,
        token: env.GITHUB_TOKEN,
        env,
        fetchFn,
      });
      if (exemption && exemption.length === 0) {
        console.log(
          `Dependabot exception: ${commits.length} commit(s) on ${ctx.branch} verified by GitHub, version bumps/pins only`,
        );
        continue;
      }
      if (exemption) out.push(...exemption);
    }
    out.push(...findings);
  }
  if (out.length) {
    console.error(`CHnet commit identity check FAILED:\n  - ${out.join('\n  - ')}`);
    console.error(
      'Allowed identities: config/chnet-commit-emails.txt. Own commits: git commit --amend --reset-author.\n' +
        'Commits that are not yours (e.g. a branch on an old base reaching into history from before the\n' +
        'allowlist): update the branch onto current main (rebase) so the range holds only your commits.'
    );
    return 1;
  }
  console.log(`CHnet commit identity ok (${count} commit(s) checked)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stdin = process.argv[2] === '--pre-push' ? readFileSync(0, 'utf8') : '';
  main(process.argv.slice(2), { stdin }).then((code) => process.exit(code));
}
