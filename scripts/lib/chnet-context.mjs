// chnet-context.mjs — Node side of scripts/chnet-context-check.sh (project rule: only CHnet accounts,
// remotes and commit identities). Same lists: config/chnet-aws-accounts.txt (local, not in this
// repo: without it assertChnetAwsAccount fails) and config/chnet-commit-emails.txt. Shared by CHnet
// repos — keep identical to the reference copy.
//
//   coins4meGhEnv()          env for gh child processes: GH_TOKEN of coins4me (never the active gh
//                            account), verified via `gh api user`; throws otherwise.
//   assertChnetOwner(repo)   `owner/name` must be owned by coins4me or chnet.
//   assertChnetAwsAccount(client)  STS GetCallerIdentity with the CREDENTIALS OF THAT SDK CLIENT
//                            (client.config.credentials, its region) must be a CHnet account — the
//                            check and the write use the same credentials, whatever the env holds.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const CHNET_OWNERS = ['coins4me', 'chnet'];
export const CHNET_GH_LOGIN = 'coins4me';

/** Non-comment, non-empty first words of a list file. */
export function readList(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => {
      const hash = l.indexOf('#');
      return (hash >= 0 ? l.slice(0, hash) : l).trim().split(/\s+/)[0];
    })
    .filter(Boolean);
}

export const accountsFile = () =>
  process.env.CHNET_ACCOUNTS_FILE ?? resolve(here, '../../config/chnet-aws-accounts.txt');
export const emailsFile = () =>
  process.env.CHNET_EMAILS_FILE ?? resolve(here, '../../config/chnet-commit-emails.txt');

/** Glob match with `*` only (allowlist syntax). */
export function globMatch(pattern, value) {
  const parts = pattern.split('*');
  if (parts.length === 1) return pattern === value;
  const first = parts[0];
  const last = parts.at(-1);
  if (value.length < first.length + last.length) return false;
  if (!value.startsWith(first) || !value.endsWith(last)) return false;
  // middle parts in order, between the fixed prefix and suffix (no regex, no backtracking);
  // a `*` never spans `@` or whitespace (else 'evil@x.com+coins4me@…' would match '*+coins4me@…')
  const covered = [];
  let pos = first.length;
  const end = value.length - last.length;
  for (const part of parts.slice(1, -1)) {
    const i = value.indexOf(part, pos);
    if (i < 0 || i + part.length > end) return false;
    covered.push(value.slice(pos, i));
    pos = i + part.length;
  }
  covered.push(value.slice(pos, end));
  return covered.every((c) => !c.includes('@') && !/\s/.test(c));
}

export function emailAllowed(email, patterns = readList(emailsFile())) {
  return typeof email === 'string' && patterns.some((p) => globMatch(p, email.trim()));
}

/** GitHub owner of a github.com remote URL, or undefined (SSH host aliases are refused on purpose). */
export function remoteOwner(url) {
  const m =
    /^git@github\.com:([^/]+)\//.exec(url) ??
    /^ssh:\/\/git@github\.com\/([^/]+)\//.exec(url) ??
    /^https:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\//.exec(url);
  return m?.[1];
}

export class ChnetContextError extends Error {
  constructor(message) {
    super(`CHnet context ERROR: ${message}`);
    this.name = 'ChnetContextError';
  }
}

export function assertChnetOwner(repoFullName) {
  const owner = String(repoFullName).split('/')[0];
  if (!CHNET_OWNERS.includes(owner)) {
    throw new ChnetContextError(
      `repo ${repoFullName} is not owned by ${CHNET_OWNERS.join(' or ')}`
    );
  }
  return repoFullName;
}

/**
 * Env for gh child processes acting as coins4me. Throws if the token is missing/empty or gh answers
 * with another login — never falls back to the active gh account.
 */
export function coins4meGhEnv({ exec = execFileSync, baseEnv = process.env } = {}) {
  let token = '';
  try {
    token = String(
      exec('gh', ['auth', 'token', '--user', CHNET_GH_LOGIN], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    ).trim();
  } catch {
    token = '';
  }
  if (!token) throw new ChnetContextError(`no gh token for ${CHNET_GH_LOGIN}`);
  const env = { ...baseEnv, GH_TOKEN: token };
  let login = '';
  try {
    login = String(
      exec('gh', ['api', 'user', '--jq', '.login'], {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    ).trim();
  } catch {
    login = '';
  }
  if (login !== CHNET_GH_LOGIN) {
    throw new ChnetContextError(`gh acts as '${login || '<none>'}', expected ${CHNET_GH_LOGIN}`);
  }
  return env;
}

/**
 * The account behind an AWS SDK v3 client's OWN credentials must be a CHnet account. Uses STS with
 * `client.config.credentials` and `client.config.region`, so the check sees exactly what the client
 * will write with (an env with AWS_PROFILE=<other> plus exported keys cannot split the two).
 * `stsOptions` is for tests (e.g. a requestHandler); production passes nothing.
 */
export async function assertChnetAwsAccount(
  client,
  { accounts = readList(accountsFile()), stsOptions = {} } = {}
) {
  const require = createRequire(import.meta.url);
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
  if (!client?.config?.credentials) throw new ChnetContextError('no AWS SDK client given');
  const sts = new STSClient({
    region: client.config.region,
    credentials: client.config.credentials,
    ...stsOptions,
  });
  let account = '';
  try {
    account = String((await sts.send(new GetCallerIdentityCommand({}))).Account ?? '');
  } catch (err) {
    throw new ChnetContextError(`STS GetCallerIdentity failed: ${err?.name ?? err}`);
  }
  if (!accounts.includes(account)) {
    throw new ChnetContextError(`AWS account ${account || '<none>'} is not a CHnet account`);
  }
  return account;
}
