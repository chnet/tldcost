// check-data-protection.test.mjs — rules of scripts/check-data-protection.mjs on small hand-made templates
// (same tests as in the organisation's infrastructure repository, adapted), plus the allowlist of this
// repository and the CLI (report only unless --strict).
//
// Usage: node --test scripts/check-data-protection.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  byCodeUnit,
  checkDataProtection,
  customResourceWrites,
  isSensitiveAction,
  loadAllowlist,
  replaceHash,
  tagsOf,
} from './check-data-protection.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMPTY = {
  DATA_CLASS_ALLOWLIST: [],
  TTL_PINS: [],
  REPLACE_BASELINES: [],
  CUSTOM_RESOURCE_ALLOWLIST: [],
  SECRET_RECOVERY: [],
  PROPERTY_EXEMPTIONS: [],
};
const allow = (over = {}) => ({ ...EMPTY, ...over });
const P = [{ Key: 'chnet:class', Value: 'P' }];
const one = (resources, name = 'default') => [
  { name, stacks: [{ stack: 'S', template: { Resources: resources } }] },
];
const run = (resources, a = allow(), opts = {}) => checkDataProtection(one(resources), a, opts);

const goodTable = (extra = {}) => ({
  Type: 'AWS::DynamoDB::Table',
  DeletionPolicy: 'Retain',
  UpdateReplacePolicy: 'Retain',
  Properties: {
    DeletionProtectionEnabled: true,
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    Tags: P,
    ...extra,
  },
});

test('DDB: a fully protected P table has no finding; every missing piece is a gap', () => {
  assert.deepEqual(run({ T: goodTable() }), {
    gaps: [],
    integrity: [],
    summary: { synths: ['default'], stacks: 1, resources: 1, gapResources: 0 },
  });
  const r = run({ T: { Type: 'AWS::DynamoDB::Table', Properties: {} } });
  assert.equal(r.integrity.length, 0);
  assert.equal(r.gaps.length, 1);
  for (const want of [
    'DeletionPolicy Delete',
    'UpdateReplacePolicy Delete',
    'DeletionProtectionEnabled',
    'PITR off',
    'chnet:class=P',
  ])
    assert.match(r.gaps[0], new RegExp(want));
  assert.equal(
    run({ T: { ...goodTable(), DeletionPolicy: 'RetainExceptOnCreate' } }).gaps.length,
    0,
  );
});

test('TTL: an unpinned or changed TTL fails (integrity), a matching pin passes, a pin on a TTL-less table fails', () => {
  const ttl = (a) => goodTable({ TimeToLiveSpecification: { AttributeName: a, Enabled: true } });
  const pin = (a) =>
    allow({
      TTL_PINS: [{ stack: 'S', logicalId: 'T', attribute: a, reason: 'retention by design xyz' }],
    });
  assert.match(run({ T: ttl('expiresAt') }).integrity[0], /not pinned/);
  assert.deepEqual(run({ T: ttl('expiresAt') }, pin('expiresAt')).integrity, []);
  assert.match(
    run({ T: ttl('createdAt') }, pin('expiresAt')).integrity[0],
    /TTL on 'createdAt', pinned 'expiresAt'/,
  );
  assert.match(run({ T: goodTable() }, pin('expiresAt')).integrity[0], /TTL off, pinned/);
  // also on an allowlisted E table
  const e = allow({
    DATA_CLASS_ALLOWLIST: [
      { stack: 'S', logicalId: 'T', class: 'E', reason: 'rate-limit counters only' },
    ],
  });
  assert.match(run({ T: ttl('expiresAt') }, e).integrity[0], /not pinned/);
});

test('allowlist: R/E entries switch the P rules off; reason, class, duplicates and dead entries are integrity', () => {
  const bucket = {
    Type: 'AWS::S3::Bucket',
    Properties: { Tags: [{ Key: 'chnet:class', Value: 'R' }] },
  };
  const entry = (o = {}) => ({
    stack: 'S',
    logicalId: 'B',
    class: 'R',
    reason: 'static origin from the repo',
    ...o,
  });
  assert.deepEqual(run({ B: bucket }, allow({ DATA_CLASS_ALLOWLIST: [entry()] })), {
    gaps: [],
    integrity: [],
    summary: { synths: ['default'], stacks: 1, resources: 1, gapResources: 0 },
  });
  assert.match(
    run({ B: bucket }, allow({ DATA_CLASS_ALLOWLIST: [entry({ reason: 'todo' })] })).integrity[0],
    /reason/,
  );
  assert.match(
    run({ B: bucket }, allow({ DATA_CLASS_ALLOWLIST: [entry({ reason: undefined })] }))
      .integrity[0],
    /reason/,
  );
  assert.match(
    run({ B: bucket }, allow({ DATA_CLASS_ALLOWLIST: [entry({ class: 'P' })] })).integrity[0],
    /class must be R or E/,
  );
  assert.match(
    run({ B: bucket }, allow({ DATA_CLASS_ALLOWLIST: [entry(), entry()] })).integrity[0],
    /duplicate/,
  );
  assert.match(
    run({ B: bucket }, allow({ DATA_CLASS_ALLOWLIST: [entry({ logicalId: 'Gone' })] }))
      .integrity[0],
    /dead entry \(resource gone\)/,
  );
  const other = allow({ DATA_CLASS_ALLOWLIST: [entry({ stack: 'Other' })] });
  assert.match(run({ B: bucket }, other).integrity[0], /stack Other in no synth/);
  assert.deepEqual(
    run({ B: bucket }, other, { partial: true }).integrity,
    [],
    '--partial skips absent stacks',
  );
  const role = { Type: 'AWS::IAM::Role', Properties: {} };
  assert.match(
    run({ X: role }, allow({ DATA_CLASS_ALLOWLIST: [entry({ logicalId: 'X' })] })).integrity[0],
    /dead entry/,
    'a non-data resource is not "seen"',
  );
  const tagged = {
    Type: 'AWS::S3::Bucket',
    Properties: { Tags: [{ Key: 'chnet:class', Value: 'P' }] },
  };
  assert.match(
    run({ B: tagged }, allow({ DATA_CLASS_ALLOWLIST: [entry()] })).gaps[0],
    /tag chnet:class=P, allowlist says R/,
  );
});

test('S3: versioning, lifecycle expiration, noncurrent < 30 d and auto-delete are gaps', () => {
  const b = (props, extra = {}) => ({
    Type: 'AWS::S3::Bucket',
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: { VersioningConfiguration: { Status: 'Enabled' }, Tags: P, ...props },
    ...extra,
  });
  assert.deepEqual(run({ B: b({}) }).gaps, []);
  const lc = (rule) =>
    b({ LifecycleConfiguration: { Rules: [{ Id: 'r', Status: 'Enabled', ...rule }] } });
  assert.deepEqual(
    run({ B: lc({ Transitions: [{ StorageClass: 'GLACIER', TransitionInDays: 30 }] }) }).gaps,
    [],
  );
  assert.deepEqual(
    run({ B: lc({ NoncurrentVersionExpiration: { NoncurrentDays: 30 } }) }).gaps,
    [],
  );
  assert.match(run({ B: lc({ ExpirationInDays: 365 }) }).gaps[0], /lifecycle rule r: Expiration/);
  assert.match(
    run({ B: lc({ NoncurrentVersionExpiration: { NoncurrentDays: 1 } }) }).gaps[0],
    /1 d < 30/,
  );
  assert.deepEqual(run({ B: lc({ ExpirationInDays: 1, Status: 'Disabled' }) }).gaps, []);
  assert.match(
    run({ B: b({ VersioningConfiguration: { Status: 'Suspended' } }) }).gaps[0],
    /versioning/,
  );
  const auto = { Type: 'Custom::S3AutoDeleteObjects', Properties: { BucketName: { Ref: 'B' } } };
  assert.match(run({ B: b({}), A: auto }).gaps[0], /Custom::S3AutoDeleteObjects A/);
});

test('RDS: policies incl. Snapshot, protection, retention >= 7, CMK or snapshot restore, CopyTagsToSnapshot, baseline', () => {
  const db = (props, dp = 'Snapshot', urp = 'Snapshot') => ({
    Type: 'AWS::RDS::DBInstance',
    DeletionPolicy: dp,
    UpdateReplacePolicy: urp,
    Properties: {
      DeletionProtection: true,
      BackupRetentionPeriod: 7,
      KmsKeyId: 'k',
      CopyTagsToSnapshot: true,
      Tags: P,
      ...props,
    },
  });
  assert.deepEqual(run({ D: db({}) }).gaps, []);
  assert.deepEqual(run({ D: db({ KmsKeyId: undefined, DBSnapshotIdentifier: 'snap' }) }).gaps, []);
  assert.match(
    run({ D: db({ KmsKeyId: undefined }) }).gaps[0],
    /no KmsKeyId and no snapshot restore/,
  );
  assert.match(run({ D: db({ BackupRetentionPeriod: 3 }) }).gaps[0], /BackupRetentionPeriod 3 < 7/);
  assert.match(run({ D: db({ BackupRetentionPeriod: undefined }) }).gaps[0], /default \(1\) < 7/);
  assert.match(run({ D: db({ CopyTagsToSnapshot: false }) }).gaps[0], /CopyTagsToSnapshot/);
  assert.match(
    run({ D: db({ DeletionProtection: false }) }).gaps[0],
    /DeletionProtection not true/,
  );
  assert.match(run({ D: db({}, 'Delete') }).gaps[0], /DeletionPolicy Delete/);
  assert.match(
    run({ D: db({}, 'Snapshot', 'Delete') }).gaps[0],
    /UpdateReplacePolicy Delete \(want Retain\|Snapshot\)/,
  );
  assert.deepEqual(run({ D: db({}, 'Retain', 'Retain') }).gaps, []);
  // a new snapshot ID (e.g. -c sharedDbSnapshotId) replaces the instance → the baseline catches it
  const pin = (d) =>
    allow({
      REPLACE_BASELINES: [
        { stack: 'S', logicalId: 'D', sha256: replaceHash(d), reason: 'restore from snapshot A' },
      ],
    });
  const a = db({ KmsKeyId: undefined, DBSnapshotIdentifier: 'snap-a' });
  assert.match(run({ D: a }).integrity[0], /not pinned/);
  assert.deepEqual(run({ D: a }, pin(a)).integrity, []);
  assert.match(
    run({ D: db({ KmsKeyId: undefined, DBSnapshotIdentifier: 'snap-b' }) }, pin(a)).integrity[0],
    /replace properties changed/,
  );
  assert.equal(
    replaceHash(db({ BackupRetentionPeriod: 14 })),
    replaceHash(db({})),
    'in-place props do not move it',
  );
});

test('Cognito / Secret: Retain, ACTIVE, tag (Cognito tags are a map); every P secret has a SECRET_RECOVERY entry', () => {
  const pool = (dp) => ({
    Type: 'AWS::Cognito::UserPool',
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: { DeletionProtection: dp, UserPoolTags: { 'chnet:class': 'P' } },
  });
  assert.deepEqual(run({ U: pool('ACTIVE') }).gaps, []);
  assert.match(run({ U: pool('INACTIVE') }).gaps[0], /DeletionProtection not ACTIVE/);
  assert.match(
    run({ S: { Type: 'AWS::SecretsManager::Secret', Properties: {} } }).gaps[0],
    /DeletionPolicy Delete.*chnet:class=P/,
  );
  const sec = { Type: 'AWS::SecretsManager::Secret', Properties: {} };
  const rec = (o = {}) => ({
    stack: 'S',
    logicalId: 'S',
    recovery: 'reissue at the source, put-secret-value',
    ...o,
  });
  assert.match(run({ S: sec }).integrity[0], /class-P secret without a SECRET_RECOVERY entry/);
  assert.deepEqual(run({ S: sec }, allow({ SECRET_RECOVERY: [rec()] })).integrity, []);
  assert.match(
    run({ S: sec }, allow({ SECRET_RECOVERY: [rec({ recovery: 'tbd' })] })).integrity[0],
    /recovery missing/,
  );
  const e = allow({
    DATA_CLASS_ALLOWLIST: [
      { stack: 'S', logicalId: 'S', class: 'E', reason: 'generated header token' },
    ],
    SECRET_RECOVERY: [rec()],
  });
  assert.match(
    run({ S: sec }, e).integrity[0],
    /SECRET_RECOVERY S\/S: entry has no effect \(not a class-P secret\)/,
  );
});

test('EC2 (P): CMK volumes, backup tag, replace baseline missing / changed / matching', () => {
  const inst = (ud) => ({
    Type: 'AWS::EC2::Instance',
    Properties: {
      ImageId: 'ami-1',
      UserData: ud,
      InstanceType: 't4g.small',
      BlockDeviceMappings: [{ DeviceName: '/dev/xvda', Ebs: { Encrypted: true, KmsKeyId: 'k' } }],
      PropagateTagsToVolumeOnCreation: true,
      Tags: [...P, { Key: 'chnet:backup', Value: 'daily' }],
    },
  });
  const h = replaceHash(inst('a'));
  const base = (sha) =>
    allow({
      REPLACE_BASELINES: [
        { stack: 'S', logicalId: 'I', sha256: sha, reason: 'fresh state backup taken' },
      ],
    });
  assert.match(run({ I: inst('a') }).integrity[0], new RegExp(`not pinned .*sha256 ${h}`));
  assert.deepEqual(run({ I: inst('a') }, base(h)), {
    gaps: [],
    integrity: [],
    summary: { synths: ['default'], stacks: 1, resources: 1, gapResources: 0 },
  });
  assert.match(run({ I: inst('b') }, base(h)).integrity[0], /replace properties changed/);
  // a non-replace property (InstanceType) does not move the hash
  const resized = inst('a');
  resized.Properties.InstanceType = 't4g.large';
  assert.equal(replaceHash(resized), h);
  const plain = { Type: 'AWS::EC2::Instance', Properties: { ImageId: 'ami-1' } };
  const g = run({ I: plain }, base(replaceHash(plain))).gaps[0];
  assert.match(g, /no BlockDeviceMappings/);
  assert.match(g, /chnet:backup=daily missing/);
  assert.match(g, /PropagateTagsToVolumeOnCreation not true/);
  // a baseline on an allowlisted E instance has no effect → integrity
  const e = allow({
    DATA_CLASS_ALLOWLIST: [
      { stack: 'S', logicalId: 'I', class: 'E', reason: 'stateless redirector box' },
    ],
    REPLACE_BASELINES: [
      { stack: 'S', logicalId: 'I', sha256: h, reason: 'fresh state backup taken' },
    ],
  });
  assert.match(run({ I: inst('a') }, e).integrity[0], /entry has no effect/);
});

test('Route53 HostedZone: Retain + tag (HostedZoneTags) + Name pinned', () => {
  const z = (name, dp) => ({
    Type: 'AWS::Route53::HostedZone',
    DeletionPolicy: dp,
    UpdateReplacePolicy: dp,
    Properties: { Name: name, HostedZoneTags: P },
  });
  const pin = allow({
    REPLACE_BASELINES: [
      {
        stack: 'S',
        logicalId: 'Z',
        sha256: replaceHash(z('a.de.')),
        reason: 'zone delegation at registrar',
      },
    ],
  });
  assert.deepEqual(run({ Z: z('a.de.', 'Retain') }, pin).gaps, []);
  assert.match(run({ Z: z('a.de.') }, pin).gaps[0], /DeletionPolicy Delete/);
  assert.match(run({ Z: z('b.de.', 'Retain') }, pin).integrity[0], /replace properties changed/);
});

test('custom resources: data-write verbs via the provider role or Custom::AWS calls need an allowlist entry', () => {
  assert.equal(isSensitiveAction('s3:*'), true);
  assert.equal(isSensitiveAction('*'), true);
  assert.equal(isSensitiveAction('s3:DeleteObject*'), true);
  assert.equal(isSensitiveAction('dynamodb:UpdateTimeToLive'), true);
  assert.equal(isSensitiveAction('rds:Modify*'), true);
  assert.equal(isSensitiveAction('s3:GetObject*'), false);
  assert.equal(isSensitiveAction('ssm:PutParameter'), false);
  const stack = (actions, extra = {}) => ({
    Fn: { Type: 'AWS::Lambda::Function', Properties: { Role: { 'Fn::GetAtt': ['Role', 'Arn'] } } },
    Role: {
      Type: 'AWS::IAM::Role',
      Properties: {
        ManagedPolicyArns: [
          {
            'Fn::Sub':
              'arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          },
        ],
      },
    },
    Pol: {
      Type: 'AWS::IAM::Policy',
      Properties: {
        Roles: [{ Ref: 'Role' }],
        PolicyDocument: { Statement: [{ Effect: 'Allow', Action: actions, Resource: '*' }] },
      },
    },
    CR: {
      Type: 'Custom::Thing',
      Properties: { ServiceToken: { 'Fn::GetAtt': ['Fn', 'Arn'] }, ...extra },
    },
  });
  assert.deepEqual(
    customResourceWrites(stack(['ssm:GetParameter']).CR, stack(['ssm:GetParameter'])),
    [],
  );
  const bad = stack(['dynamodb:DeleteItem']);
  assert.match(customResourceWrites(bad.CR, bad)[0], /dynamodb:DeleteItem/);
  assert.match(run(bad).gaps[0], /custom resource can write data/);
  const ok = allow({
    CUSTOM_RESOURCE_ALLOWLIST: [
      { stack: 'S', logicalId: 'CR', reason: 'known provider, reviewed' },
    ],
  });
  assert.deepEqual(run(bad, ok).gaps, []);
  assert.match(run(stack(['ssm:GetParameter']), ok).integrity[0], /cannot write data/);
  // a non-benign managed policy counts
  const adm = stack(['ssm:GetParameter']);
  adm.Role.Properties.ManagedPolicyArns.push('arn:aws:iam::aws:policy/AdministratorAccess');
  assert.match(customResourceWrites(adm.CR, adm)[0], /AdministratorAccess/);
  // Custom::AWS: the SDK call itself
  const sdk = stack(['ec2:DescribeVpcs']);
  sdk.CR.Type = 'Custom::AWS';
  sdk.CR.Properties.Create = JSON.stringify({
    service: 'DynamoDB',
    action: 'deleteTable',
    parameters: {},
  });
  assert.match(customResourceWrites(sdk.CR, sdk)[0], /Create DynamoDB\.deleteTable/);
  sdk.CR.Properties.Create = JSON.stringify({
    service: 'EC2',
    action: 'modifyVpcPeeringConnectionOptions',
  });
  assert.deepEqual(customResourceWrites(sdk.CR, sdk), []);
  // imported ServiceToken: provider unknown → must be listed
  const imp = {
    CR: { Type: 'Custom::X', Properties: { ServiceToken: { 'Fn::ImportValue': 'x' } } },
  };
  assert.match(customResourceWrites(imp.CR, imp)[0], /not resolvable/);
  // provider framework: one hop via lambda:InvokeFunction
  const fw = stack(['lambda:InvokeFunction']);
  fw.Pol.Properties.PolicyDocument.Statement[0].Resource = [{ 'Fn::GetAtt': ['User', 'Arn'] }];
  fw.User = {
    Type: 'AWS::Lambda::Function',
    Properties: { Role: { 'Fn::GetAtt': ['URole', 'Arn'] } },
  };
  fw.URole = {
    Type: 'AWS::IAM::Role',
    Properties: {
      Policies: [{ PolicyDocument: { Statement: { Effect: 'Allow', Action: 's3:*' } } }],
    },
  };
  assert.match(customResourceWrites(fw.CR, fw).join(), /User: s3:\*/);
  // fail-closed: a provider role that is imported or a literal ARN is unknown, not "no rights"
  const lit = stack(['ssm:GetParameter']);
  lit.Fn.Properties.Role = 'arn:aws:iam::123456789012:role/x';
  assert.match(customResourceWrites(lit.CR, lit)[0], /Fn: role not an in-stack AWS::IAM::Role/);
  const impRole = stack(['ssm:GetParameter']);
  impRole.Fn.Properties.Role = { 'Fn::ImportValue': 'role-arn' };
  assert.match(customResourceWrites(impRole.CR, impRole)[0], /provider permissions unknown/);
  // an Allow with NotAction grants everything else → sensitive
  const na = stack([]);
  na.Pol.Properties.PolicyDocument.Statement = [
    { Effect: 'Allow', NotAction: 'iam:*', Resource: '*' },
  ];
  assert.match(customResourceWrites(na.CR, na)[0], /NotAction:"iam:\*"/);
  // L1 AWS::IAM::RolePolicy and AWS::IAM::ManagedPolicy (Roles) are read too
  const rp = stack(['ssm:GetParameter']);
  rp.RP = {
    Type: 'AWS::IAM::RolePolicy',
    Properties: {
      RoleName: { Ref: 'Role' },
      PolicyDocument: { Statement: [{ Effect: 'Allow', Action: 'rds:ModifyDBSnapshotAttribute' }] },
    },
  };
  assert.match(customResourceWrites(rp.CR, rp)[0], /rds:ModifyDBSnapshotAttribute/);
  const mp = stack(['ssm:GetParameter']);
  mp.MP = {
    Type: 'AWS::IAM::ManagedPolicy',
    Properties: {
      Roles: [{ Ref: 'Role' }],
      PolicyDocument: { Statement: [{ Effect: 'Allow', Action: ['secretsmanager:DeleteSecret'] }] },
    },
  };
  assert.match(customResourceWrites(mp.CR, mp)[0], /secretsmanager:DeleteSecret/);
  // SDK v3 client name
  const v3 = stack(['ec2:DescribeVpcs']);
  v3.CR.Type = 'Custom::AWS';
  v3.CR.Properties.Delete = JSON.stringify({
    service: '@aws-sdk/client-secrets-manager',
    action: 'DeleteSecret',
  });
  assert.match(
    customResourceWrites(v3.CR, v3)[0],
    /Delete @aws-sdk\/client-secrets-manager\.DeleteSecret/,
  );
});

test('findings are merged over synths; a gap only in one synth names it', () => {
  const synths = [
    {
      name: 'default',
      stacks: [{ stack: 'S', template: { Resources: { T: { Type: 'AWS::DynamoDB::Table' } } } }],
    },
    {
      name: 'gated',
      stacks: [
        { stack: 'S', template: { Resources: { T: { Type: 'AWS::DynamoDB::Table' } } } },
        { stack: 'G', template: { Resources: { B: { Type: 'AWS::SecretsManager::Secret' } } } },
      ],
    },
  ];
  const r = checkDataProtection(synths, EMPTY);
  assert.equal(r.gaps.length, 2);
  assert.match(r.gaps[0], /^G\/B .*\[only gated\]/);
  assert.doesNotMatch(r.gaps[1], /only/);
});

test('tagsOf reads Tags arrays, HostedZoneTags and UserPoolTags maps', () => {
  assert.deepEqual(tagsOf({ Properties: { Tags: [{ Key: 'a', Value: '1' }] } }), { a: '1' });
  assert.deepEqual(tagsOf({ Properties: { HostedZoneTags: [{ Key: 'b', Value: '2' }] } }), {
    b: '2',
  });
  assert.deepEqual(tagsOf({ Properties: { UserPoolTags: { c: '3' } } }), { c: '3' });
  assert.deepEqual(tagsOf({}), {});
});

test('an R/E resource carries its class as tag (gap if missing or different)', () => {
  const e = allow({
    DATA_CLASS_ALLOWLIST: [
      { stack: 'S', logicalId: 'B', class: 'E', reason: 'access logs, short lifecycle' },
    ],
  });
  const b = (tags) => ({ Type: 'AWS::S3::Bucket', Properties: tags ? { Tags: tags } : {} });
  assert.deepEqual(run({ B: b([{ Key: 'chnet:class', Value: 'E' }]) }, e).gaps, []);
  assert.match(run({ B: b() }, e).gaps[0], /tag chnet:class=E missing \(allowlist class E\)/);
  assert.match(
    run({ B: b([{ Key: 'chnet:class', Value: 'P' }]) }, e).gaps[0],
    /tag chnet:class=P, allowlist says E/,
  );
  assert.deepEqual(run({ B: b() }, e).integrity, [], 'a gap, never integrity');
});

test('PROPERTY_EXEMPTIONS drop exactly one rule; the resource stays class P', () => {
  const noPitr = goodTable({ PointInTimeRecoverySpecification: undefined });
  const ex = (o = {}) =>
    allow({
      PROPERTY_EXEMPTIONS: [
        {
          stack: 'S',
          logicalId: 'T',
          property: 'pitr',
          reason: 'rebuilt nightly from source',
          ...o,
        },
      ],
    });
  assert.match(run({ T: noPitr }).gaps[0], /PITR off/);
  assert.deepEqual(run({ T: noPitr }, ex()), {
    gaps: [],
    integrity: [],
    summary: { synths: ['default'], stacks: 1, resources: 1, gapResources: 0 },
  });
  // only that rule: deletion protection is still required
  const bare = goodTable({
    PointInTimeRecoverySpecification: undefined,
    DeletionProtectionEnabled: false,
  });
  const g = run({ T: bare }, ex()).gaps[0];
  assert.match(g, /DeletionProtectionEnabled not true/);
  assert.doesNotMatch(g, /PITR/);
  // mutants → INTEGRITY
  assert.match(
    run({ T: goodTable() }, ex()).integrity[0],
    /PROPERTY_EXEMPTIONS S\/T#pitr: entry has no effect/,
    'PITR on after all',
  );
  assert.match(
    run({ T: noPitr }, ex({ logicalId: 'Gone' })).integrity[0],
    /dead entry \(resource gone\)/,
  );
  assert.match(run({ T: noPitr }, ex({ stack: 'Other' })).integrity[0], /stack Other in no synth/);
  assert.match(run({ T: noPitr }, ex({ reason: 'short' })).integrity.join(), /reason missing/);
  assert.match(
    run({ T: noPitr }, ex({ property: 'versioning' })).integrity.join(),
    /property must be one of pitr/,
  );
  const asE = allow({
    DATA_CLASS_ALLOWLIST: [
      { stack: 'S', logicalId: 'T', class: 'E', reason: 'rate-limit counters only' },
    ],
    PROPERTY_EXEMPTIONS: [
      { stack: 'S', logicalId: 'T', property: 'pitr', reason: 'rebuilt nightly from source' },
    ],
  });
  assert.match(
    run({ T: noPitr }, asE).integrity.join(),
    /S\/T#pitr: entry has no effect/,
    'R/E resource: no effect',
  );
  const bucket = { Type: 'AWS::S3::Bucket', Properties: {} };
  assert.match(
    run({ T: bucket }, ex()).integrity.join(),
    /S\/T#pitr: entry has no effect/,
    'wrong resource type: no effect',
  );
  const twice = allow({
    PROPERTY_EXEMPTIONS: [
      { stack: 'S', logicalId: 'T', property: 'pitr', reason: 'rebuilt nightly from source' },
      { stack: 'S', logicalId: 'T', property: 'pitr', reason: 'rebuilt nightly from source' },
    ],
  });
  assert.match(run({ T: noPitr }, twice).integrity.join(), /S\/T#pitr: duplicate entry/);
});

// --- this repository ------------------------------------------------------------------------------------------

test('infra/config/data-protection-allowlist.ts: loads, every entry has a reason, R/E only, no duplicates', async () => {
  const a = await loadAllowlist(root);
  const r = checkDataProtection([], a, { partial: true });
  assert.deepEqual(r.integrity, []);
  for (const list of [
    'DATA_CLASS_ALLOWLIST',
    'TTL_PINS',
    'REPLACE_BASELINES',
    'CUSTOM_RESOURCE_ALLOWLIST',
    'SECRET_RECOVERY',
  ])
    assert.ok(Array.isArray(a[list]), list);
});

/** A cdk.out with one stack template (the manifest layout `cdk synth` writes). */
function assembly(resources, stack = 'S') {
  const dir = mkdtempSync(join(tmpdir(), 'cdp-'));
  writeFileSync(join(dir, 'S.template.json'), JSON.stringify({ Resources: resources }));
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      artifacts: {
        [stack]: {
          type: 'aws:cloudformation:stack',
          properties: { templateFile: 'S.template.json' },
        },
      },
    }),
  );
  return dir;
}
const cli = (...args) =>
  spawnSync(process.execPath, [join(root, 'scripts/check-data-protection.mjs'), ...args], {
    encoding: 'utf8',
  });

test('CLI: gaps are report only (exit 0); --strict makes them fail', () => {
  const dir = assembly({ B: { Type: 'AWS::S3::Bucket' } });
  const r = cli('--partial', `default=${dir}`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 with gaps/);
  assert.match(
    r.stdout,
    /GAPS \(report only\):\n {2}- S\/B \(AWS::S3::Bucket\): DeletionPolicy Delete/,
  );
  assert.equal(cli('--partial', '--strict', `default=${dir}`).status, 1);
  // a clean assembly passes --strict as well
  assert.equal(cli('--partial', '--strict', `default=${assembly({})}`).status, 0);
});

test('CLI: an integrity finding always fails — a dead allowlist entry exits 1, also without --strict', () => {
  // the repository allowlist names tldcost/SiteBucket…: a full run without stack tldcost is a dead entry
  const noStack = cli(`default=${assembly({})}`);
  assert.equal(noStack.status, 1, noStack.stdout);
  assert.match(
    noStack.stdout,
    /INTEGRITY \(always failing\):\n {2}- DATA_CLASS_ALLOWLIST tldcost\/SiteBucket\w+: dead entry \(stack tldcost in no synth\)/,
  );
  // stack present, resource gone
  const dir = assembly({ B: { Type: 'AWS::S3::Bucket' } }, 'tldcost');
  const gone = cli(`default=${dir}`);
  assert.equal(gone.status, 1, gone.stdout);
  assert.match(gone.stdout, /dead entry \(resource gone\)/);
});

test('CLI: a missing synth directory is a hint + exit 1, not a stack trace', () => {
  const r = cli('default=/nonexistent-cdk-out');
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /manifest\.json missing \(synth default\) — run npm run synth -w infra first/,
  );
  assert.doesNotMatch(r.stderr, /at .*check-data-protection\.mjs:\d+/);
});

test('CLI: a name may be key=value (the pair is split at the last =)', () => {
  const r = cli('site=detached=/nonexistent-out');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/nonexistent-out\/manifest\.json missing \(synth site=detached\)/);
});

test('byCodeUnit: locale-independent code-unit order (upper case before lower case)', () => {
  assert.deepEqual(['b', 'B', 'a', 'A', '_'].sort(byCodeUnit), ['A', 'B', '_', 'a', 'b']);
  assert.equal(byCodeUnit('x', 'x'), 0);
});

test('gaps are listed in code-unit order, not by locale', () => {
  const r = run({
    b: { Type: 'AWS::S3::Bucket' },
    B: { Type: 'AWS::S3::Bucket' },
    a: { Type: 'AWS::S3::Bucket' },
  });
  assert.deepEqual(
    r.gaps.map((g) => g.split(' ')[0]),
    ['S/B', 'S/a', 'S/b'],
  );
});
