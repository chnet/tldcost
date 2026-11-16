// check-main-identity.test.mjs — pushes to main, the three branches: (1) CHnet author passes (own
// squash merges, no secret needed); (2) outside author + committer GitHub + confirmed merged PR meets
// the secret denylist (dummy blocked.example) and fails closed without it; (3) anything else fails.
// Real git in throw-away repos, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCommits,
  domainDenied,
  main,
  mergedPrFor,
  parseDenylist,
  pushRevArgs,
} from './check-main-identity.mjs';

const OK = 'coins4me@users.noreply.github.com';
const GH = 'noreply@github.com';
const OUTSIDE = 'dev@contributor.example';
const BLOCKED = 'someone@mail.blocked.example';

function repoWith(commits) {
  const dir = mkdtempSync(join(tmpdir(), 'chnet-main-'));
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
  const before = g(['rev-parse', 'HEAD']);
  const shas = [];
  for (const [a, c] of commits) {
    commit(a, c);
    shas.push(g(['rev-parse', 'HEAD']));
  }
  const run = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return { before, head: shas.at(-1) ?? before, shas, run };
}

async function runMain(repo, { denylist, merged = [] } = {}) {
  const logs = [];
  const orig = [console.log, console.error];
  console.log = (m) => logs.push(m);
  console.error = (m) => logs.push(m);
  try {
    const code = await main(
      { BEFORE_SHA: repo.before, HEAD_SHA: repo.head, AUTHOR_DOMAIN_DENYLIST: denylist },
      { run: repo.run, prFor: async (sha) => (merged.includes(sha) ? 42 : null) },
    );
    return { code, out: logs.join('\n') };
  } finally {
    [console.log, console.error] = orig;
  }
}

const DENY = 'blocked.example';

test('(1) CHnet author passes whatever the committer; no secret needed', async () => {
  const repo = repoWith([
    [OK, OK],
    [OK, GH], // own squash merge
  ]);
  for (const denylist of [undefined, '', DENY]) {
    const r = await runMain(repo, { denylist });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /2 commit\(s\) checked/);
  }
});

test('(1) the committer is still checked: CHnet author with a foreign committer fails', async () => {
  const r = await runMain(repoWith([[OK, OUTSIDE]]), { denylist: DENY });
  assert.equal(r.code, 1);
  assert.match(r.out, /committer e-mail not on the CHnet allowlist/);
  assert.doesNotMatch(r.out, /contributor\.example/);
});

test('(2) merged fork PR: passes with the denylist, hit fails without naming the domain', async () => {
  const repo = repoWith([[OUTSIDE, GH]]);
  let r = await runMain(repo, { denylist: DENY, merged: repo.shas });
  assert.equal(r.code, 0, r.out);
  const blocked = repoWith([[BLOCKED, GH]]);
  r = await runMain(blocked, {
    denylist: ' Blocked.Example , other.example',
    merged: blocked.shas,
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /merged PR #42: author denylist match/);
  assert.doesNotMatch(r.out, /blocked\.example|other\.example|someone@/i);
});

test('(2) fail closed: empty or missing secret fails a merged fork PR', async () => {
  const repo = repoWith([[OUTSIDE, GH]]);
  for (const denylist of [undefined, '', ' , ']) {
    const r = await runMain(repo, { denylist, merged: repo.shas });
    assert.notEqual(r.code, 0, JSON.stringify(denylist));
    assert.match(r.out, /denylist secret missing — fail closed/);
  }
});

test('(3) outside author without a confirmed merged PR, or not committed by GitHub, fails', async () => {
  let r = await runMain(repoWith([[OUTSIDE, GH]]), { denylist: DENY });
  assert.equal(r.code, 1);
  assert.match(r.out, /author e-mail not on the CHnet allowlist/);
  r = await runMain(repoWith([[OUTSIDE, OUTSIDE]]), { denylist: DENY, merged: [] });
  assert.equal(r.code, 1);
  assert.match(r.out, /committer e-mail not on the CHnet allowlist/);
  assert.match(r.out, /author e-mail not on the CHnet allowlist/);
  assert.doesNotMatch(r.out, /contributor\.example/);
});

test('the PR lookup is only asked for outside authors committed by GitHub', async () => {
  const asked = [];
  const prFor = async (sha) => (asked.push(sha), 7);
  const commits = [
    { sha: 'a'.repeat(40), author: OUTSIDE, committer: OUTSIDE },
    { sha: 'b'.repeat(40), author: OK, committer: GH },
    { sha: 'c'.repeat(40), author: OUTSIDE, committer: GH },
  ];
  const findings = await checkCommits(commits, { patterns: [OK, GH], denylist: [DENY], prFor });
  assert.deepEqual(asked, ['c'.repeat(40)]);
  assert.equal(findings.length, 2); // a: author + committer
});

test('helpers: denylist parsing, domain match, push range', () => {
  assert.equal(parseDenylist(undefined), null);
  assert.deepEqual(parseDenylist('@A.example, b.example,'), ['a.example', 'b.example']);
  assert.ok(domainDenied('x@blocked.example', ['blocked.example']));
  assert.ok(domainDenied('x@eu.Blocked.example', ['blocked.example']));
  assert.ok(!domainDenied('x@notblocked.example', ['blocked.example']));
  const known = (sha) => sha === 'aaa';
  assert.deepEqual(pushRevArgs('aaa', 'bbb', known), ['aaa..bbb']);
  assert.deepEqual(pushRevArgs('0'.repeat(40), 'bbb', known), ['bbb^!']);
  assert.deepEqual(pushRevArgs('ccc', 'bbb', known), ['bbb^!'], 'force push over unknown tip');
});

test('mergedPrFor: only a merged PR whose merge commit is the sha', async () => {
  const sha = 'd'.repeat(40);
  const fake = (status, body) => async (url, opts) => {
    assert.match(url, /\/repos\/chnet\/tldcost\/commits\/d+\/pulls$/);
    assert.equal(opts.headers.authorization, 'Bearer t');
    return { ok: status === 200, status, json: async () => body };
  };
  const o = { repo: 'chnet/tldcost', token: 't' };
  const prs = [
    { number: 1, merged_at: null, merge_commit_sha: sha },
    { number: 2, merged_at: '2026-11-12T10:00:00Z', merge_commit_sha: 'e'.repeat(40) },
    { number: 3, merged_at: '2026-11-12T10:00:00Z', merge_commit_sha: sha },
  ];
  assert.equal(await mergedPrFor(sha, { ...o, fetchImpl: fake(200, prs) }), 3);
  assert.equal(await mergedPrFor(sha, { ...o, fetchImpl: fake(200, prs.slice(0, 2)) }), null);
  await assert.rejects(mergedPrFor(sha, { ...o, fetchImpl: fake(404, {}) }), /GitHub API 404/);
});

test('usage error exits 2', async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    assert.equal(await main({}), 2);
  } finally {
    console.error = orig;
  }
});
