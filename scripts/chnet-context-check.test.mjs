// chnet-context-check.test.mjs — the CHnet context guard (project rule) refuses foreign gh
// logins, foreign remotes/e-mails and foreign AWS accounts. gh/aws are stubs on PATH; git is real
// (throw-away repos). No network, no credentials.
// tldcost: dummy CHnet account 000000000000 from a temp CHNET_ACCOUNTS_FILE fixture
// (config/chnet-aws-accounts.txt is not part of this repository); the tests use the noreply e-mail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertChnetAwsAccount,
  assertChnetOwner,
  coins4meGhEnv,
  emailAllowed,
  globMatch,
  readList,
  remoteOwner,
} from './lib/chnet-context.mjs';

const require = createRequire(import.meta.url);
const SCRIPT = resolve(import.meta.dirname, 'chnet-context-check.sh');

function stubBin() {
  const dir = mkdtempSync(join(tmpdir(), 'chnet-ctx-bin-'));
  // gh: login from STUB_GH_LOGIN; aws: account from STUB_AWS_ACCOUNT (empty = no credentials)
  writeFileSync(
    join(dir, 'gh'),
    '#!/bin/sh\n[ "$1 $2" = "api user" ] && { [ -n "$STUB_GH_LOGIN" ] && echo "$STUB_GH_LOGIN" && exit 0; exit 1; }\nexit 1\n'
  );
  writeFileSync(
    join(dir, 'aws'),
    '#!/bin/sh\n[ -n "$STUB_AWS_ACCOUNT" ] && echo "$STUB_AWS_ACCOUNT" && exit 0\nexit 255\n'
  );
  chmodSync(join(dir, 'gh'), 0o755);
  chmodSync(join(dir, 'aws'), 0o755);
  return dir;
}

function repo({
  url = 'git@github.com:coins4me/example.git',
  pushUrl,
  email = 'coins4me@users.noreply.github.com',
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'chnet-ctx-repo-'));
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
  g('init', '-q');
  g('remote', 'add', 'origin', url);
  if (pushUrl) g('remote', 'set-url', '--push', 'origin', pushUrl);
  if (email) g('config', 'user.email', email);
  return dir;
}

const BIN = stubBin();
const ACCOUNTS_FILE = join(mkdtempSync(join(tmpdir(), 'chnet-accounts-')), 'accounts.txt');
writeFileSync(ACCOUNTS_FILE, '# test fixture\n000000000000\n');
function run(args, env = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${BIN}:/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin`,
      HOME: tmpdir(),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      CHNET_ACCOUNTS_FILE: ACCOUNTS_FILE,
      ...env,
    },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('all checks pass in a CHnet context', () => {
  const r = run(['--gh', '--repo', '--email', '--aws', 'CHnet', '--dir', repo()], {
    GH_TOKEN: 't',
    STUB_GH_LOGIN: 'coins4me',
    STUB_AWS_ACCOUNT: '000000000000',
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /CHnet context ok: gh=coins4me repo=coins4me email=ok aws=000000000000/);
});

test('--gh: refuses without GH_TOKEN/GH_CONFIG_DIR and with a foreign login', () => {
  let r = run(['--gh'], { STUB_GH_LOGIN: 'coins4me' });
  assert.equal(r.code, 3);
  assert.match(r.out, /neither GH_TOKEN nor GH_CONFIG_DIR/);
  r = run(['--gh'], { GH_TOKEN: '', STUB_GH_LOGIN: 'coins4me' });
  assert.equal(r.code, 3, 'an empty GH_TOKEN counts as missing');
  r = run(['--gh'], { GH_TOKEN: 't', STUB_GH_LOGIN: 'someone-else' });
  assert.equal(r.code, 3);
  assert.match(r.out, /gh acts as 'someone-else', expected coins4me/);
  r = run(['--gh'], { GH_CONFIG_DIR: '/x', STUB_GH_LOGIN: 'coins4me' });
  assert.equal(r.code, 0, r.out);
});

test('--repo: coins4me and chnet (org, after the transfers) pass; any other owner fails', () => {
  for (const url of [
    'git@github.com:chnet/tldcost.git',
    'https://github.com/coins4me/example.git',
    'ssh://git@github.com/chnet/x.git',
  ]) {
    assert.equal(run(['--repo', '--dir', repo({ url })]).code, 0, url);
  }
  let r = run(['--repo', '--dir', repo({ url: 'git@github.com:someone-else/x.git' })]);
  assert.equal(r.code, 3);
  assert.match(r.out, /owner 'someone-else'/);
  r = run(['--repo', '--dir', repo({ pushUrl: 'git@github.com:someone-else/x.git' })]);
  assert.equal(r.code, 3, 'the push URL is checked too');
  r = run(['--repo', '--dir', repo({ url: 'git@gitlab.example:a/b.git' })]);
  assert.equal(r.code, 3);
  for (const url of [
    'git@github.com.evil.example:coins4me/x.git',
    'https://github.com/coins4me.evil/x.git',
    'https://evil.example/github.com/coins4me/x.git',
    'git@github-alias:coins4me/x.git', // SSH host alias: refused on purpose (documented)
  ]) {
    assert.equal(run(['--repo', '--dir', repo({ url })]).code, 3, url);
  }
});

test('--email: allowlist only, foreign or missing e-mail fails', () => {
  assert.equal(run(['--email', '--dir', repo({ email: 'coins4me@users.noreply.github.com' })]).code, 0);
  assert.equal(
    run(['--email', '--dir', repo({ email: '123+coins4me@users.noreply.github.com' })]).code,
    0
  );
  assert.equal(run(['--email', '--dir', repo({ email: 'someone@example.com' })]).code, 3);
  assert.equal(run(['--email', '--dir', repo({ email: '' })]).code, 3);
});

test('--email: shell and Node allowlist match agree (`*` never spans @, [bot] is literal)', () => {
  const cases = [
    ['coins4me@users.noreply.github.com', true],
    ['123+coins4me@users.noreply.github.com', true],
    ['41898282+github-actions[bot]@users.noreply.github.com', true],
    ['noreply@anthropic.com', true],
    ['49699333+dependabot[bot]@users.noreply.github.com', false], // only the bot in use
    ['evil@x.com+coins4me@users.noreply.github.com', false], // `*` spanning @
    ['a b+coins4me@users.noreply.github.com', false], // `*` spanning whitespace
    ['41898282+github-actionsb@users.noreply.github.com', false], // [bot] read as a bracket class
    ['41898282+github-actionst@users.noreply.github.com', false],
    ['noreply@anthropicXcom', false], // `.` is literal
    ['xnoreply@anthropic.com', false],
    ['noreply@anthropic.com.evil.com', false],
  ];
  for (const [email, want] of cases) {
    assert.equal(emailAllowed(email), want, `node: ${email}`);
    const code = run(['--email', '--dir', repo({ email })]).code;
    assert.equal(code, want ? 0 : 3, `shell: ${email}`);
  }
  // regex metacharacters in a pattern are literal on the shell side too
  const list = join(mkdtempSync(join(tmpdir(), 'chnet-ctx-list-')), 'emails.txt');
  writeFileSync(list, 'a.b+*@x(y)|[q]{2}.io\n');
  for (const [email, want] of [
    ['a.b+1@x(y)|[q]{2}.io', true],
    ['aXb+1@x(y)|[q]{2}.io', false],
    ['a.b+1@x(y)|qq.io', false],
  ]) {
    assert.equal(emailAllowed(email, readList(list)), want, `node: ${email}`);
    const code = run(['--email', '--dir', repo({ email })], { CHNET_EMAILS_FILE: list }).code;
    assert.equal(code, want ? 0 : 3, `shell: ${email}`);
  }
});

test('--aws: account must be on the CHnet list; missing credentials fail', () => {
  assert.equal(run(['--aws', 'CHnet'], { STUB_AWS_ACCOUNT: '000000000000' }).code, 0);
  let r = run(['--aws', 'CHnet'], { STUB_AWS_ACCOUNT: '111111111111' });
  assert.equal(r.code, 3);
  assert.match(r.out, /account 111111111111, not a CHnet account/);
  r = run(['--aws', 'CHnet'], { STUB_AWS_ACCOUNT: '' });
  assert.equal(r.code, 3);
  assert.equal(run(['--aws']).code, 2, 'profile is mandatory');
});

test('--aws and lib: a missing account list fails closed (the list is local, not in this repo)', async () => {
  const missing = join(mkdtempSync(join(tmpdir(), 'chnet-accounts-')), 'missing.txt');
  const r = run(['--aws', 'CHnet'], { STUB_AWS_ACCOUNT: '000000000000', CHNET_ACCOUNTS_FILE: missing });
  assert.equal(r.code, 3);
  assert.match(r.out, /not readable/);
  const before = process.env.CHNET_ACCOUNTS_FILE;
  process.env.CHNET_ACCOUNTS_FILE = missing;
  try {
    // the list is read before any STS call: no account is ever accepted without it
    await assert.rejects(assertChnetAwsAccount({ config: { credentials: {} } }), /ENOENT/);
  } finally {
    if (before === undefined) delete process.env.CHNET_ACCOUNTS_FILE;
    else process.env.CHNET_ACCOUNTS_FILE = before;
  }
});

test('lib: lists, glob, remote owner, owner assertion', () => {
  assert.ok(
    readList(ACCOUNTS_FILE).includes(
      '000000000000'
    )
  );
  assert.ok(
    globMatch(
      '*[bot]@users.noreply.github.com',
      '49699333+dependabot[bot]@users.noreply.github.com'
    )
  );
  assert.ok(
    !globMatch('coins4me@users.noreply.github.com', 'xcoins4me@users.noreply.github.com')
  );
  // `*` never spans `@` or whitespace
  assert.ok(
    !globMatch(
      '*+coins4me@users.noreply.github.com',
      'evil@x.com+coins4me@users.noreply.github.com'
    )
  );
  assert.ok(!globMatch('*[bot]@users.noreply.github.com', 'a b[bot]@users.noreply.github.com'));
  assert.ok(
    globMatch('*+coins4me@users.noreply.github.com', '12345+coins4me@users.noreply.github.com')
  );
  assert.ok(emailAllowed('noreply@github.com'));
  assert.ok(!emailAllowed('someone@example.com'));
  // only the bots in use, no *[bot] wildcard
  assert.ok(emailAllowed('41898282+github-actions[bot]@users.noreply.github.com'));
  assert.ok(!emailAllowed('49699333+dependabot[bot]@users.noreply.github.com'));
  assert.ok(!emailAllowed('12345+someone[bot]@users.noreply.github.com'));
  assert.equal(remoteOwner('git@github.com:chnet/a.git'), 'chnet');
  assert.equal(remoteOwner('https://x-access-token@github.com/coins4me/a.git'), 'coins4me');
  assert.equal(remoteOwner('git@gitlab.example:a/b.git'), undefined);
  assert.equal(assertChnetOwner('chnet/tldcost'), 'chnet/tldcost');
  assert.throws(() => assertChnetOwner('someone-else/x'), /not owned by coins4me or chnet/);
});

test('lib: coins4meGhEnv never falls back to the active gh account', () => {
  const exec =
    (login, token = 'tok') =>
    (cmd, args) => {
      if (args[0] === 'auth') return token;
      if (args[0] === 'api') return login;
      throw new Error('unexpected');
    };
  assert.equal(coins4meGhEnv({ exec: exec('coins4me'), baseEnv: {} }).GH_TOKEN, 'tok');
  assert.throws(() => coins4meGhEnv({ exec: exec('coins4me', ''), baseEnv: {} }), /no gh token/);
  assert.throws(
    () => coins4meGhEnv({ exec: exec('someone-else'), baseEnv: {} }),
    /acts as 'someone-else'/
  );
  const failing = () => {
    throw new Error('gh: no account');
  };
  assert.throws(() => coins4meGhEnv({ exec: failing, baseEnv: {} }), /no gh token/);
});

// STS answers from a local request handler (no network): the account is derived from the access key
// the SIGNED request carries, i.e. from the credentials the SDK really resolved.
const ACCOUNT_BY_KEY = {
  AKIACHNETTEST0000000: '000000000000',
  AKIAFOREIGNTEST00000: '111111111111',
};
function stsHandler(seen) {
  return {
    async handle(request) {
      const key = /Credential=([A-Z0-9]+)\//.exec(request.headers.authorization ?? '')?.[1];
      seen.push(key);
      const account = ACCOUNT_BY_KEY[key] ?? '999999999999';
      const body = `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Arn>arn:aws:iam::${account}:user/t</Arn><UserId>T</UserId><Account>${account}</Account></GetCallerIdentityResult><ResponseMetadata><RequestId>r</RequestId></ResponseMetadata></GetCallerIdentityResponse>`;
      // Plain response object, no `@smithy/protocol-http` HttpResponse: that package is only a
      // transitive dependency, and newer SDKs (seen with 3.1167) no longer install it — the
      // require threw inside the handler and surfaced as "STS GetCallerIdentity failed". The SDK
      // deserializer reads statusCode / headers / body only.
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'text/xml' },
          body: Readable.from([Buffer.from(body)]),
        },
      };
    },
  };
}

async function withEnv(vars, fn) {
  const keys = Object.keys(vars);
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) {
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('lib: assertChnetAwsAccount checks the credentials of the SDK client itself (real chain)', async () => {
  const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
  const dir = mkdtempSync(join(tmpdir(), 'chnet-aws-'));
  writeFileSync(
    join(dir, 'credentials'),
    '[foreign]\naws_access_key_id = AKIAFOREIGNTEST00000\naws_secret_access_key = x\n'
  );
  writeFileSync(join(dir, 'config'), '');
  const base = {
    AWS_SHARED_CREDENTIALS_FILE: join(dir, 'credentials'),
    AWS_CONFIG_FILE: join(dir, 'config'),
    AWS_SESSION_TOKEN: undefined,
    AWS_REGION: 'eu-west-1',
  };
  const accounts = ['000000000000'];

  // only CHnet env keys: passes
  await withEnv(
    {
      ...base,
      AWS_PROFILE: undefined,
      AWS_ACCESS_KEY_ID: 'AKIACHNETTEST0000000',
      AWS_SECRET_ACCESS_KEY: 'x',
    },
    async () => {
      const seen = [];
      const sm = new SecretsManagerClient({ region: 'eu-west-1' });
      assert.equal(
        await assertChnetAwsAccount(sm, {
          accounts,
          stsOptions: { requestHandler: stsHandler(seen) },
        }),
        '000000000000'
      );
      assert.deepEqual(seen, ['AKIACHNETTEST0000000']);
    }
  );

  // review case: AWS_PROFILE=<foreign> plus exported CHnet env keys — the check must judge the
  // credentials the CLIENT resolves (whatever the SDK precedence is), never a different chain
  await withEnv(
    {
      ...base,
      AWS_PROFILE: 'foreign',
      AWS_ACCESS_KEY_ID: 'AKIACHNETTEST0000000',
      AWS_SECRET_ACCESS_KEY: 'x',
    },
    async () => {
      const seen = [];
      const sm = new SecretsManagerClient({ region: 'eu-west-1' });
      const clientKey = (await sm.config.credentials()).accessKeyId;
      const run = assertChnetAwsAccount(sm, {
        accounts,
        stsOptions: { requestHandler: stsHandler(seen) },
      });
      if (clientKey === 'AKIACHNETTEST0000000') await run;
      else await assert.rejects(run, /AWS account 111111111111 is not a CHnet account/);
      assert.deepEqual(seen, [clientKey], 'STS was signed with the client credentials');
    }
  );

  await assert.rejects(assertChnetAwsAccount({}, { accounts }), /no AWS SDK client given/);
});
