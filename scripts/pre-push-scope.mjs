#!/usr/bin/env node
// pre-push-scope.mjs — does the CHnet identity check apply to this push? (tldcost addition, not part
// of the shared identity guard). The repo is public and takes fork PRs
// (CONTRIBUTING): an outside contributor pushing to their own fork must not be blocked. The check
// is skipped ONLY when both the remote is not coins4me/chnet AND `git config user.email` is not on
// the CHnet allowlist; the owner is still checked on any remote (no CHnet code to foreign remotes
// under a CHnet identity) and anybody pushing to a CHnet remote is checked. Fork PRs are covered
// by CI.
//
// Usage: node scripts/pre-push-scope.mjs <remote-url>
// Exit 0 = enforce, 10 = skip. Any other exit (crash) counts as enforce in .husky/pre-push.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CHNET_OWNERS, emailAllowed, remoteOwner } from './lib/chnet-context.mjs';

export const SKIP = 10;

export function scope(url, email) {
  if (CHNET_OWNERS.includes(remoteOwner(url ?? ''))) return 0;
  if (email && emailAllowed(email)) return 0;
  return SKIP;
}

function gitEmail() {
  try {
    return execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = scope(process.argv[2], gitEmail());
  if (code === SKIP) {
    console.log(
      'Push to a non-CHnet remote by a non-CHnet identity: identity check skipped (CI checks PRs).',
    );
  }
  process.exit(code);
}
