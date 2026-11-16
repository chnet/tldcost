// check-commit-identity.test.mjs — only CHnet identities (author AND committer) reach CHnet repos;
// GitHub merges and bots stay allowed; the pre-push mode also refuses foreign remotes. Real git in
// throw-away repos, no network.
// tldcost: the tests use the noreply e-mail; the hook test covers the tldcost pre-push hook (scope
// check for fork pushes, identity check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { prePushRevArgs, prePushTags } from './check-commit-identity.mjs';

const SCRIPT = resolve(import.meta.dirname, 'check-commit-identity.mjs');
const OK = 'coins4me@users.noreply.github.com';
const GITHUB_ACTIONS_BOT = '41898282+github-actions[bot]@users.noreply.github.com';

function repoWith(commits) {
  const dir = mkdtempSync(join(tmpdir(), 'chnet-ident-'));
  const g = (args, env = {}) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: tmpdir(),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        ...env,
      },
    }).trim();
  g(['init', '-q', '-b', 'main']);
  const commit = (author, committer) =>
    g(['commit', '-q', '--allow-empty', '-m', 'c'], {
      GIT_AUTHOR_NAME: 'a',
      GIT_AUTHOR_EMAIL: author,
      GIT_COMMITTER_NAME: 'c',
      GIT_COMMITTER_EMAIL: committer,
    });
  commit(OK, OK);
  const base = g(['rev-parse', 'HEAD']);
  for (const [a, c] of commits) commit(a, c);
  return { dir, base, head: g(['rev-parse', 'HEAD']) };
}

function run(dir, args, input = '') {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', input });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('range: CHnet identities, GitHub merges and the data-update bot pass', () => {
  const { dir, base, head } = repoWith([
    [OK, 'noreply@github.com'],
    ['noreply@anthropic.com', 'noreply@anthropic.com'],
    // scheduled data update (update-data.yml): author and committer are github-actions[bot]
    [GITHUB_ACTIONS_BOT, GITHUB_ACTIONS_BOT],
    ['12345+coins4me@users.noreply.github.com', OK],
  ]);
  const r = run(dir, ['--range', `${base}..${head}`]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /4 commit\(s\) checked/);
});

test('range: bots that are not on the allowlist fail (no *[bot] wildcard)', () => {
  for (const bot of [
    '49699333+dependabot[bot]@users.noreply.github.com',
    '12345+someone[bot]@users.noreply.github.com',
  ]) {
    const { dir, base, head } = repoWith([[bot, 'noreply@github.com']]);
    const r = run(dir, ['--range', `${base}..${head}`]);
    assert.equal(r.code, 1, bot);
    assert.match(r.out, /author e-mail not on the CHnet allowlist/);
  }
});

test('range: a foreign author or committer fails, without printing the address', () => {
  const { dir, base, head } = repoWith([
    [OK, OK],
    ['someone@example.com', OK],
    [OK, 'someone@example.com'],
  ]);
  const r = run(dir, ['--range', `${base}..${head}`]);
  assert.equal(r.code, 1);
  assert.match(r.out, /author e-mail not on the CHnet allowlist/);
  assert.match(r.out, /committer e-mail not on the CHnet allowlist/);
  assert.doesNotMatch(r.out, /someone@example\.com/);
});

/**
 * Creates tag `name` on `target` (default HEAD) of `dir`: annotated with `tagger`, lightweight
 * without; returns its object.
 */
function tagIn(dir, name, tagger, target = 'HEAD') {
  const args = tagger ? ['tag', '-a', '-m', 't', name, target] : ['tag', name, target];
  execFileSync('git', ['-C', dir, ...args], {
    env: {
      PATH: process.env.PATH,
      HOME: tmpdir(),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: tagger ?? OK,
    },
  });
  return execFileSync('git', ['-C', dir, 'rev-parse', `refs/tags/${name}`], {
    encoding: 'utf8',
  }).trim();
}

test('range --tag: the tagger of an annotated tag is checked, a lightweight tag has none', () => {
  const { dir, base, head } = repoWith([[OK, OK]]);
  const range = `${base}..${head}`;
  const ok = run(dir, ['--range', range, '--tag', tagIn(dir, 'v1', OK)]);
  assert.equal(ok.code, 0, ok.out);
  const light = run(dir, ['--range', range, '--tag', tagIn(dir, 'v2')]);
  assert.equal(light.code, 0, light.out);
  const foreign = run(dir, ['--range', range, '--tag', tagIn(dir, 'v3', 'someone@example.com')]);
  assert.equal(foreign.code, 1);
  assert.match(foreign.out, /tagger e-mail not on the CHnet allowlist/);
  assert.doesNotMatch(foreign.out, /someone@example\.com/);
  // an unreadable tag object fails instead of passing
  const missing = run(dir, ['--range', range, '--tag', '0123456789abcdef0123456789abcdef01234567']);
  assert.equal(missing.code, 1);
  assert.match(missing.out, /cannot read the tag object/);
});

test('pre-push: the tagger of a pushed annotated tag is checked', () => {
  const { dir, head } = repoWith([[OK, OK]]);
  const object = tagIn(dir, 'v1', 'someone@example.com');
  const r = run(
    dir,
    ['--pre-push', 'origin', 'git@github.com:chnet/tldcost.git'],
    `refs/tags/v1 ${object} refs/tags/v1 ${'0'.repeat(40)}\n`,
  );
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /tagger e-mail not on the CHnet allowlist/);
  assert.doesNotMatch(r.out, /someone@example\.com/);
  // every pushed object is checked (a commit yields no tagger finding); deletions are skipped
  const z = '0'.repeat(40);
  assert.deepEqual(
    prePushTags(
      `refs/heads/x ${head} refs/heads/x ${z}\n(delete) ${z} refs/tags/old ${head}\nrefs/tags/v1 ${object} refs/tags/v1 ${z}\n`,
    ),
    [head, object],
  );
});

test('range --tag: a nested tag is followed, every tagger in the chain is checked', () => {
  const { dir, base, head } = repoWith([[OK, OK]]);
  const range = `${base}..${head}`;
  // outer tag (CHnet tagger) wraps an inner tag with a foreign tagger
  const inner = tagIn(dir, 'inner', 'someone@example.com');
  const outer = tagIn(dir, 'outer', OK, inner);
  const r = run(dir, ['--range', range, '--tag', outer]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, new RegExp(`tag ${inner.slice(0, 10)}: tagger e-mail not on the CHnet allowlist`));
  assert.doesNotMatch(r.out, /someone@example\.com/);
  // both taggers CHnet: passes
  const ok = tagIn(dir, 'outer-ok', OK, tagIn(dir, 'inner-ok', OK));
  assert.equal(run(dir, ['--range', range, '--tag', ok]).code, 0);
});

test('pre-push: a tag object pushed by raw SHA is checked (git push origin <sha>:refs/tags/x)', () => {
  const { dir } = repoWith([[OK, OK]]);
  const object = tagIn(dir, 'v1', 'someone@example.com');
  const r = run(
    dir,
    ['--pre-push', 'origin', 'git@github.com:chnet/tldcost.git'],
    `${object} ${object} refs/tags/x ${'0'.repeat(40)}\n`,
  );
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /tagger e-mail not on the CHnet allowlist/);
});

test('range --tag: the commits of the range are still checked', () => {
  const { dir, base, head } = repoWith([['someone@example.com', OK]]);
  const r = run(dir, ['--range', `${base}..${head}`, '--tag', tagIn(dir, 'v1', OK)]);
  assert.equal(r.code, 1);
  assert.match(r.out, /author e-mail not on the CHnet allowlist/);
});

test('pre-push: foreign remote fails; new branch checks only commits not on any remote', () => {
  const { dir, head } = repoWith([[OK, OK]]);
  const zero = '0'.repeat(40);
  const line = `refs/heads/x ${head} refs/heads/x ${zero}\n`;
  assert.equal(
    run(dir, ['--pre-push', 'origin', 'git@github.com:coins4me/example.git'], line).code,
    0
  );
  assert.equal(
    run(dir, ['--pre-push', 'origin', 'git@github.com:chnet/example.git'], line).code,
    0
  );
  const r = run(dir, ['--pre-push', 'origin', 'git@github.com:someone-else/x.git'], line);
  assert.equal(r.code, 1);
  assert.match(r.out, /not owned by coins4me or chnet/);
});

test('pre-push stdin parsing: deletions skipped, new commits only, unknown old tip dropped', () => {
  const zero = '0'.repeat(40);
  const known = (sha) => sha === 'aaa';
  assert.deepEqual(prePushRevArgs(`(delete) ${zero} refs/heads/x abc\n`, known, 'origin'), []);
  assert.deepEqual(prePushRevArgs(`refs/heads/x bbb refs/heads/x aaa\n`, known, 'origin'), [
    ['bbb', '--not', 'aaa', '--remotes=origin'],
  ]);
  assert.deepEqual(prePushRevArgs(`refs/heads/x bbb refs/heads/x ccc\n`, known, 'origin'), [
    ['bbb', '--not', '--remotes=origin'],
  ]);
  assert.deepEqual(prePushRevArgs(`refs/heads/x bbb refs/heads/x ${zero}\n`, known, 'origin'), [
    ['bbb', '--not', '--remotes=origin'],
  ]);
});

test('pre-push stdin parsing: only the tracking refs of the push remote are excluded', () => {
  const zero = '0'.repeat(40);
  const line = `refs/heads/x bbb refs/heads/x ${zero}\n`;
  assert.deepEqual(
    prePushRevArgs(line, () => false, 'upstream'),
    [['bbb', '--not', '--remotes=upstream']]
  );
  // a bare URL or a glob-like name excludes no tracking refs at all (everything new is checked)
  for (const remote of ['git@github.com:coins4me/x.git', 'https://github.com/chnet/x', 'o*', '']) {
    assert.deepEqual(
      prePushRevArgs(line, () => false, remote),
      [['bbb', '--not']],
      remote
    );
  }
});

test('pre-push: a foreign commit on a tracking ref of ANOTHER remote is still checked', () => {
  const { dir, head } = repoWith([['someone@example.com', OK]]);
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
  g('update-ref', 'refs/remotes/pr/x', head); // e.g. a fetched fork PR
  const line = `refs/heads/x ${head} refs/heads/x ${'0'.repeat(40)}\n`;
  const r = run(dir, ['--pre-push', 'origin', 'git@github.com:coins4me/x.git'], line);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAILED/);
  // on the push remote's own tracking ref the commit is already there: not this push's business
  g('update-ref', 'refs/remotes/origin/x', head);
  assert.equal(run(dir, ['--pre-push', 'origin', 'git@github.com:coins4me/x.git'], line).code, 0);
});

test('pre-push: unknown old remote tip (force push over unfetched commits) → clean check, no stacktrace', () => {
  const { dir, head } = repoWith([[OK, OK]]);
  const unknown = 'f'.repeat(40);
  const r = run(
    dir,
    ['--pre-push', 'origin', 'git@github.com:coins4me/x.git'],
    `refs/heads/x ${head} refs/heads/x ${unknown}\n`
  );
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Invalid revision range|at .*\.mjs/);
});

test('pre-push after a rebase: main commits between old and new base are not re-checked', () => {
  // main gets a foreign commit; the feature branch was rebased onto it; the remote still has the old branch
  const { dir, base } = repoWith([]);
  const g = (args, env = {}) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: tmpdir(),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        ...env,
      },
    }).trim();
  const commit = (email) =>
    g(['commit', '-q', '--allow-empty', '-m', 'c'], {
      GIT_AUTHOR_NAME: 'a',
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: 'c',
      GIT_COMMITTER_EMAIL: email,
    });
  g(['checkout', '-q', '-b', 'feat']);
  commit(OK);
  const oldTip = g(['rev-parse', 'HEAD']);
  g(['checkout', '-q', 'main']);
  commit('someone@example.com'); // already on origin/main (not this push's business)
  g(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  g(['update-ref', 'refs/remotes/origin/feat', oldTip]);
  g(['checkout', '-q', '-B', 'feat', 'main']);
  commit(OK);
  const newTip = g(['rev-parse', 'HEAD']);
  assert.ok(base);
  const r = run(
    dir,
    ['--pre-push', 'origin', 'git@github.com:coins4me/x.git'],
    `refs/heads/feat ${newTip} refs/heads/feat ${oldTip}\n`
  );
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 commit\(s\) checked/);
});

test('.husky/pre-push: CHnet remote or CHnet identity is checked; outside fork pushes pass', () => {
  const root = resolve(import.meta.dirname, '..');
  const work = mkdtempSync(join(tmpdir(), 'chnet-hook-'));
  for (const f of [
    'scripts/check-commit-identity.mjs',
    'scripts/pre-push-scope.mjs',
    'scripts/lib/chnet-context.mjs',
    'scripts/lib/dependabot-exemption.mjs',
    'config/chnet-commit-emails.txt',
    '.husky/pre-push',
  ]) {
    mkdirSync(dirname(join(work, f)), { recursive: true });
    copyFileSync(join(root, f), join(work, f));
  }
  const hook = (repo, url, userEmail) => {
    if (userEmail) execFileSync('git', ['-C', repo.dir, 'config', 'user.email', userEmail]);
    return spawnSync('sh', [join(work, '.husky/pre-push'), 'origin', url], {
      cwd: work,
      encoding: 'utf8',
      input: `refs/heads/x ${repo.head} refs/heads/x ${'0'.repeat(40)}\n`,
      env: {
        PATH: process.env.PATH,
        GIT_DIR: join(repo.dir, '.git'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      },
    });
  };
  // owner identity pushing to a foreign remote: blocked
  let r = hook(repoWith([[OK, OK]]), 'git@github.com:someone-else/x.git', OK);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /not owned by coins4me or chnet/);
  // foreign author pushing to a CHnet remote: blocked
  r = hook(repoWith([['someone@example.com', OK]]), 'git@github.com:chnet/x.git', 'someone@example.com');
  assert.equal(r.status, 1, 'foreign author blocks');
  assert.match(r.stderr, /author e-mail not on the CHnet allowlist/);
  // outside contributor pushing to their own fork: skipped
  r = hook(
    repoWith([['someone@example.com', 'someone@example.com']]),
    'git@github.com:someone-else/tldcost.git',
    'someone@example.com'
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /identity check skipped/);
  // CHnet push: passes
  r = hook(repoWith([[OK, OK]]), 'git@github.com:chnet/x.git', OK);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /CHnet commit identity ok/);
});

test('pre-push-scope: skip only for a foreign remote AND a foreign e-mail', async () => {
  const { scope, SKIP } = await import('./pre-push-scope.mjs');
  assert.equal(scope('git@github.com:chnet/tldcost.git', 'someone@example.com'), 0);
  assert.equal(scope('git@github.com:someone-else/tldcost.git', OK), 0);
  assert.equal(scope('git@github.com:someone-else/tldcost.git', 'someone@example.com'), SKIP);
  assert.equal(scope('git@github.com:someone-else/tldcost.git', ''), SKIP);
  assert.equal(scope(undefined, ''), SKIP);
});

test('usage error exits 2', () => {
  assert.equal(run(tmpdir(), []).code, 2);
});
