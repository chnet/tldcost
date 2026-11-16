#!/usr/bin/env node
// check-data-protection.mjs — data-protection check of the synthesized CDK templates (infra/).
// Same check as in the organisation's infrastructure repository (backup rollout, step B3b), adapted to
// this repository. Adapted copy (public repository, own layout): only rule changes are synced, the rest stays.
// It is an early warning, not a control: the AWS-side controls (backup policy, vault
// lock, scoped SCPs) are primary.
//
// Every data resource of every synthesized template is class P unless
// infra/config/data-protection-allowlist.ts lists it as R or E (with a reason). Class P must meet:
//   DDB    DeletionPolicy Retain|RetainExceptOnCreate, UpdateReplacePolicy Retain, deletion protection, PITR, tag
//   RDS    DeletionPolicy Retain|RetainExceptOnCreate|Snapshot, UpdateReplacePolicy Retain|Snapshot,
//          DeletionProtection, BackupRetentionPeriod >= 7, KmsKeyId or a snapshot restore, tag, CopyTagsToSnapshot,
//          replace properties pinned (baseline)
//   S3     Retain, versioning Enabled, no Custom::S3AutoDeleteObjects, no lifecycle Expiration,
//          no NoncurrentVersionExpiration under 30 days, tag
//   Cognito Retain, DeletionProtection ACTIVE, tag        Secret Retain, tag, SECRET_RECOVERY entry
//   EC2    every EBS volume encrypted with a CMK, PropagateTagsToVolumeOnCreation, tag chnet:backup=daily,
//          replace properties pinned (baseline)
//   Route53 HostedZone / SFN state machine / SQS queue   Retain, tag, replace properties pinned (baseline)
// plus: every Custom Resource whose provider can call a data-service write verb is listed in the allowlist.
// R/E resources (allowlisted) carry their class as tag chnet:class=R|E, so the AWS side sees the same class (GAP).
// PROPERTY_EXEMPTIONS lets one class-P resource skip a single rule (EXEMPTABLE), with a reason.
// Tag convention: chnet:class=P|R|E on every data resource (P = must be backed up, R = rebuildable from the
// repository or a build, E = ephemeral).
//
// Limits: only declarative resources. The custom-resource rule reads IAM role policies of the provider Lambda
// (one provider-framework hop); rights from resource policies and runtime deletes by Lambdas or SDK code are
// invisible here.
//
// Two kinds of finding:
//   GAP        a rule above is not met. REPORT ONLY (exit 0); `--strict` (later rollout step) makes gaps fail.
//   INTEGRITY  always exit 1: an allowlist entry without a reason, a dead entry (its resource is in no synth), a TTL that is
//              not pinned or differs from its pin, a replace baseline that is missing or differs, a class-P
//              secret without a SECRET_RECOVERY entry (AWS Backup does not cover Secrets Manager).
//
// Coverage: infra/test/data-protection.test.ts synthesizes every context variant of the app (SYNTHS there) in
// `npm test` and prints this report. The CLI checks synthesized assemblies on disk:
//   node scripts/check-data-protection.mjs [--strict] [--partial] [<name>=<cdk.out> ...]   (default infra/cdk.out)
// A pair is split at its LAST `=` (a name may be `key=value`), so the cdk.out path itself must not contain `=`.
// Without all variants the dead-entry check cannot tell "gone" from "not synthesized": use --partial then.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Rules a single class-P resource may skip, each with the gap texts it suppresses. The resource stays class P, every
 * other rule applies. A PROPERTY_EXEMPTIONS entry that suppresses nothing (e.g. PITR is on after all) is INTEGRITY.
 */
export const EXEMPTABLE = {
  pitr: { types: ['AWS::DynamoDB::Table', 'AWS::DynamoDB::GlobalTable'], gap: /(^|: )PITR off$/ },
};

export const CLASS_TAG = 'chnet:class';
export const BACKUP_TAG = 'chnet:backup';
const MIN_REASON = 15;

/** Properties whose change replaces the resource (CloudFormation "Update requires: Replacement"). */
export const REPLACE_PROPS = {
  'AWS::EC2::Instance': [
    'AvailabilityZone',
    'BlockDeviceMappings',
    'CpuOptions',
    'ElasticGpuSpecifications',
    'ElasticInferenceAccelerators',
    'EnclaveOptions',
    'HibernationOptions',
    'HostResourceGroupArn',
    'ImageId',
    'Ipv6AddressCount',
    'Ipv6Addresses',
    'KeyName',
    'LaunchTemplate',
    'LicenseSpecifications',
    'NetworkInterfaces',
    'PlacementGroupName',
    'PrivateIpAddress',
    'SecurityGroups',
    'SubnetId',
    'UserData',
  ],
  // a new DBSnapshotIdentifier silently restores a NEW instance and drops the old one
  'AWS::RDS::DBInstance': [
    'AvailabilityZone',
    'CharacterSetName',
    'DBClusterIdentifier',
    'DBInstanceIdentifier',
    'DBName',
    'DBSnapshotIdentifier',
    'KmsKeyId',
    'NcharCharacterSetName',
    'SourceDBInstanceIdentifier',
    'StorageEncrypted',
    'Timezone',
  ],
  'AWS::RDS::DBCluster': [
    'AvailabilityZones',
    'DBClusterIdentifier',
    'DatabaseName',
    'Engine',
    'EngineMode',
    'KmsKeyId',
    'RestoreType',
    'SnapshotIdentifier',
    'SourceDBClusterIdentifier',
    'StorageEncrypted',
  ],
  'AWS::Route53::HostedZone': ['Name', 'VPCs'],
  'AWS::StepFunctions::StateMachine': ['StateMachineName', 'StateMachineType'],
  'AWS::SQS::Queue': ['QueueName', 'FifoQueue'],
};

const DATA_TYPES = new Set([
  'AWS::DynamoDB::Table',
  'AWS::DynamoDB::GlobalTable',
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::S3::Bucket',
  'AWS::Cognito::UserPool',
  'AWS::SecretsManager::Secret',
  'AWS::EC2::Instance',
  'AWS::EC2::Volume',
  ...Object.keys(REPLACE_PROPS),
]);

/** Write verbs on data services plus the delete/disable verbs next to them. */
const SENSITIVE_VERBS = [
  'dynamodb:DeleteTable',
  'dynamodb:DeleteItem',
  'dynamodb:DeleteBackup',
  'dynamodb:BatchWriteItem',
  'dynamodb:UpdateTimeToLive',
  'dynamodb:UpdateContinuousBackups',
  'dynamodb:UpdateTable',
  's3:DeleteObject',
  's3:DeleteObjectVersion',
  's3:DeleteBucket',
  's3:PutLifecycleConfiguration',
  's3:PutBucketVersioning',
  'rds:DeleteDBInstance',
  'rds:DeleteDBCluster',
  'rds:DeleteDBSnapshot',
  'rds:DeleteDBClusterSnapshot',
  'rds:ModifyDBInstance',
  'rds:ModifyDBCluster',
  'rds:ModifyDBSnapshotAttribute',
  'rds:ModifyDBClusterSnapshotAttribute',
  'cognito-idp:DeleteUserPool',
  'cognito-idp:AdminDeleteUser',
  'cognito-idp:UpdateUserPool',
  'secretsmanager:DeleteSecret',
  'kms:ScheduleKeyDeletion',
  'kms:DisableKey',
  'backup:DeleteRecoveryPoint',
  'backup:DeleteBackupVault',
];
const SENSITIVE_SDK =
  /^(dynamodb|s3|rds|cognitoidentityserviceprovider|cognito-identity-provider|secretsmanager|secrets-manager|kms|backup)$/i;
const SENSITIVE_SDK_ACTION =
  /^(delete|batchWrite|updateTimeToLive|updateContinuousBackups|updateTable|putBucketLifecycle|putLifecycle|putBucketVersioning|modify|adminDelete|updateUserPool|scheduleKeyDeletion|disableKey)/i;

/** AWS managed policies without data-service rights (logs / VPC ENIs only). Any other managed policy counts. */
const BENIGN_MANAGED = [
  ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"',
  ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"',
];

function glob(p) {
  const body = p
    .replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return new RegExp(`^${body}$`, 'i');
}
/** true if an IAM action pattern (may contain wildcards) can grant one of the sensitive verbs. */
export function isSensitiveAction(action) {
  if (typeof action !== 'string') return false;
  const re = glob(action);
  return SENSITIVE_VERBS.some((v) => re.test(v));
}

// ---------------------------------------------------------------------------------------------------------------
// cloud assembly

/** Stack templates of one cdk.out (nested assemblies included). */
export function loadAssembly(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const stacks = [];
  for (const [id, a] of Object.entries(manifest.artifacts ?? {})) {
    if (a.type === 'aws:cloudformation:stack') {
      const file = a.properties?.templateFile;
      if (!file) continue;
      stacks.push({
        stack: a.displayName ?? id,
        template: JSON.parse(readFileSync(join(dir, file), 'utf8')),
      });
    } else if (a.type === 'cdk:cloud-assembly') {
      stacks.push(...loadAssembly(join(dir, a.properties.directoryName)));
    }
  }
  return stacks;
}

// ---------------------------------------------------------------------------------------------------------------
// helpers

/**
 * UTF-16 code-unit order (= the default Array#sort order), locale-independent: the same output on every machine and
 * the pinned replace hashes stay stable.
 */
export function byCodeUnit(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.keys(v)
      .sort(byCodeUnit)
      .map((k) => [k, canonical(v[k])]),
  );
}

/** Hash of the replace properties of a resource (16 hex chars of sha256 over canonical JSON). */
export function replaceHash(resource) {
  const props = resource.Properties ?? {};
  const picked = {};
  for (const k of REPLACE_PROPS[resource.Type] ?? []) if (k in props) picked[k] = props[k];
  return createHash('sha256')
    .update(JSON.stringify(canonical(picked)))
    .digest('hex')
    .slice(0, 16);
}

/** Tags of a resource as a plain map (array form, Cognito map form, Route53 HostedZoneTags). */
export function tagsOf(resource) {
  const p = resource.Properties ?? {};
  const raw = p.Tags ?? p.HostedZoneTags ?? p.UserPoolTags;
  if (!raw) return {};
  if (Array.isArray(raw))
    return Object.fromEntries(raw.filter((t) => t && 'Key' in t).map((t) => [t.Key, t.Value]));
  return typeof raw === 'object' ? { ...raw } : {};
}

const RETAIN = new Set(['Retain', 'RetainExceptOnCreate']);
const isTrue = (v) => v === true || v === 'true';
function refId(v) {
  if (!v || typeof v !== 'object') return undefined;
  if (v.Ref !== undefined) return v.Ref;
  return Array.isArray(v['Fn::GetAtt']) ? v['Fn::GetAtt'][0] : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// rules per class-P resource → list of gap texts

function retainBoth(r, accepted = RETAIN) {
  const out = [];
  if (!accepted.has(r.DeletionPolicy))
    out.push(`DeletionPolicy ${r.DeletionPolicy ?? 'Delete'} (want ${[...accepted].join('|')})`);
  if (
    r.UpdateReplacePolicy !== 'Retain' &&
    !(accepted.has('Snapshot') && r.UpdateReplacePolicy === 'Snapshot')
  )
    out.push(`UpdateReplacePolicy ${r.UpdateReplacePolicy ?? 'Delete'} (want Retain)`);
  return out;
}
function classTag(r) {
  const v = tagsOf(r)[CLASS_TAG];
  if (v === 'P') return [];
  const actual = v ? ` (is ${v})` : '';
  return [`tag ${CLASS_TAG}=P missing${actual}`];
}

function ddbGaps(r) {
  const p = r.Properties ?? {};
  const out = retainBoth(r);
  if (r.Type === 'AWS::DynamoDB::GlobalTable') {
    for (const rep of p.Replicas ?? []) {
      const where = `replica ${rep.Region ?? '?'}`;
      if (!isTrue(rep.DeletionProtectionEnabled))
        out.push(`${where}: DeletionProtectionEnabled not true`);
      if (!isTrue(rep.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled))
        out.push(`${where}: PITR off`);
      if ((rep.Tags ?? []).find((t) => t.Key === CLASS_TAG)?.Value !== 'P')
        out.push(`${where}: tag ${CLASS_TAG}=P missing`);
    }
    return out;
  }
  if (!isTrue(p.DeletionProtectionEnabled)) out.push('DeletionProtectionEnabled not true');
  if (!isTrue(p.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled)) out.push('PITR off');
  return [...out, ...classTag(r)];
}

function rdsGaps(r) {
  const p = r.Properties ?? {};
  const out = [];
  const ok = new Set(['Retain', 'RetainExceptOnCreate', 'Snapshot']);
  if (!ok.has(r.DeletionPolicy))
    out.push(
      `DeletionPolicy ${r.DeletionPolicy ?? 'Delete'} (want Retain|RetainExceptOnCreate|Snapshot)`,
    );
  if (!['Retain', 'Snapshot'].includes(r.UpdateReplacePolicy))
    out.push(`UpdateReplacePolicy ${r.UpdateReplacePolicy ?? 'Delete'} (want Retain|Snapshot)`);
  if (!isTrue(p.DeletionProtection)) out.push('DeletionProtection not true');
  const days = Number(p.BackupRetentionPeriod ?? 1);
  if (Number.isNaN(days) || days < 7)
    out.push(`BackupRetentionPeriod ${p.BackupRetentionPeriod ?? 'default (1)'} < 7`);
  const restored = p.DBSnapshotIdentifier ?? p.SnapshotIdentifier;
  if (!p.KmsKeyId && !restored) out.push('no KmsKeyId and no snapshot restore');
  if (!isTrue(p.CopyTagsToSnapshot)) out.push('CopyTagsToSnapshot not true');
  return [...out, ...classTag(r)];
}

function s3Gaps(r, logicalId, resources) {
  const p = r.Properties ?? {};
  const out = retainBoth(r);
  if (p.VersioningConfiguration?.Status !== 'Enabled') out.push('versioning not Enabled');
  for (const rule of p.LifecycleConfiguration?.Rules ?? []) {
    if (rule.Status === 'Disabled') continue;
    const name = rule.Id ?? '(no id)';
    if (rule.ExpirationInDays !== undefined || rule.ExpirationDate !== undefined)
      out.push(`lifecycle rule ${name}: Expiration`);
    const nc =
      rule.NoncurrentVersionExpiration?.NoncurrentDays ?? rule.NoncurrentVersionExpirationInDays;
    if (nc !== undefined && Number(nc) < 30)
      out.push(`lifecycle rule ${name}: NoncurrentVersionExpiration ${nc} d < 30`);
  }
  for (const [id, other] of Object.entries(resources))
    if (
      other.Type === 'Custom::S3AutoDeleteObjects' &&
      refId(other.Properties?.BucketName) === logicalId
    )
      out.push(`Custom::S3AutoDeleteObjects ${id}`);
  return [...out, ...classTag(r)];
}

function cognitoGaps(r) {
  const out = retainBoth(r);
  if (r.Properties?.DeletionProtection !== 'ACTIVE') out.push('DeletionProtection not ACTIVE');
  return [...out, ...classTag(r)];
}

const secretGaps = (r) => [...retainBoth(r), ...classTag(r)];

function ec2Gaps(r) {
  const p = r.Properties ?? {};
  const out = [];
  const bdm = p.BlockDeviceMappings ?? [];
  if (r.Type === 'AWS::EC2::Volume') {
    if (!isTrue(p.Encrypted) || !p.KmsKeyId) out.push('volume not encrypted with a CMK');
  } else {
    if (bdm.length === 0) out.push('no BlockDeviceMappings: root volume encryption not declared');
    for (const m of bdm)
      if (m.Ebs && (!isTrue(m.Ebs.Encrypted) || !m.Ebs.KmsKeyId))
        out.push(`${m.DeviceName ?? 'volume'} not encrypted with a CMK`);
  }
  if (r.Type === 'AWS::EC2::Instance' && !isTrue(p.PropagateTagsToVolumeOnCreation))
    out.push('PropagateTagsToVolumeOnCreation not true (volumes and snapshots miss the class tag)');
  if (tagsOf(r)[BACKUP_TAG] !== 'daily') out.push(`tag ${BACKUP_TAG}=daily missing`);
  return [...out, ...classTag(r)];
}

const retainedGaps = (r) => [...retainBoth(r), ...classTag(r)];

export function gapsFor(r, logicalId, resources) {
  switch (r.Type) {
    case 'AWS::DynamoDB::Table':
    case 'AWS::DynamoDB::GlobalTable':
      return ddbGaps(r);
    case 'AWS::RDS::DBInstance':
    case 'AWS::RDS::DBCluster':
      return rdsGaps(r);
    case 'AWS::S3::Bucket':
      return s3Gaps(r, logicalId, resources);
    case 'AWS::Cognito::UserPool':
      return cognitoGaps(r);
    case 'AWS::SecretsManager::Secret':
      return secretGaps(r);
    case 'AWS::EC2::Instance':
    case 'AWS::EC2::Volume':
      return ec2Gaps(r);
    default:
      return retainedGaps(r);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// custom resources: can the provider call a data-service write verb?

function policyStatements(doc) {
  const s = doc?.Statement;
  if (Array.isArray(s)) return s;
  return s ? [s] : [];
}
/** Allowed actions of a statement; an Allow with NotAction grants everything else and counts as `NotAction:<list>`. */
function actionsOf(stmt) {
  if (stmt.Effect !== 'Allow') return [];
  if (stmt.NotAction !== undefined) return [`NotAction:${JSON.stringify(stmt.NotAction)}`];
  const a = stmt.Action;
  if (Array.isArray(a)) return a;
  return a ? [a] : [];
}
const isSensitiveGrant = (a) =>
  a.startsWith('managed:') || a.startsWith('NotAction:') || isSensitiveAction(a);

/** IAM policy resources attached to an in-stack role (AWS::IAM::Policy / ManagedPolicy via Roles, RolePolicy). */
function attachedPolicies(roleId, resources) {
  return Object.values(resources).filter((r) =>
    r.Type === 'AWS::IAM::RolePolicy'
      ? refId(r.Properties?.RoleName) === roleId
      : (r.Type === 'AWS::IAM::Policy' || r.Type === 'AWS::IAM::ManagedPolicy') &&
        (r.Properties?.Roles ?? []).some((x) => refId(x) === roleId),
  );
}

/** Allowed actions of a role: inline Policies + attached policy resources + non-benign managed policies. */
function roleActions(roleId, resources) {
  const acts = [];
  const role = resources[roleId];
  for (const pol of role?.Properties?.Policies ?? [])
    for (const st of policyStatements(pol.PolicyDocument)) acts.push(...actionsOf(st));
  for (const r of attachedPolicies(roleId, resources))
    for (const st of policyStatements(r.Properties.PolicyDocument)) acts.push(...actionsOf(st));
  for (const m of role?.Properties?.ManagedPolicyArns ?? []) {
    const arn = JSON.stringify(m);
    if (!BENIGN_MANAGED.some((b) => arn.includes(b))) acts.push(`managed:${arn}`);
  }
  return acts;
}

/** In-stack Lambda functions a statement lets the role invoke (provider framework → user handler). */
function invokedFunctionIds(st, resources) {
  if (!actionsOf(st).some((a) => /^lambda:InvokeFunction$/i.test(a))) return [];
  const res = Array.isArray(st.Resource) ? st.Resource : [st.Resource];
  return res
    .map((x) => refId(x) ?? refId(x?.['Fn::Join']?.[1]?.[0]))
    .filter((id) => id && resources[id]?.Type === 'AWS::Lambda::Function');
}

/** Lambda functions behind a ServiceToken, following one provider-framework hop (lambda:InvokeFunction). */
function providerFunctions(token, resources) {
  const first = refId(token);
  if (!first || resources[first]?.Type !== 'AWS::Lambda::Function')
    return { fns: [], unresolved: true };
  const fns = new Set([first]);
  const role = refId(resources[first].Properties?.Role);
  for (const r of attachedPolicies(role, resources))
    for (const st of policyStatements(r.Properties.PolicyDocument))
      for (const id of invokedFunctionIds(st, resources)) fns.add(id);
  return { fns: [...fns], unresolved: false };
}

/** AwsCustomResource: the SDK calls are in Create/Update/Delete (JSON string or Fn::Join). */
function sdkCallWrites(r) {
  if (r.Type !== 'Custom::AWS') return [];
  const why = [];
  for (const phase of ['Create', 'Update', 'Delete']) {
    const s = JSON.stringify(r.Properties?.[phase] ?? '');
    for (const m of s.matchAll(/\\"service\\":\\"([^\\"]+)\\",\\"action\\":\\"([^\\"]+)\\"/g)) {
      const service = m[1].replace(/^@aws-sdk\/client-/, '');
      if (SENSITIVE_SDK.test(service) && SENSITIVE_SDK_ACTION.test(m[2]))
        why.push(`${phase} ${m[1]}.${m[2]}`);
    }
  }
  return why;
}

/** Sensitive grants of one provider function's role; an unknown role is reported, never treated as "no rights". */
function functionWrites(fn, resources) {
  const role = refId(resources[fn].Properties?.Role);
  if (!role || resources[role]?.Type !== 'AWS::IAM::Role')
    return [`${fn}: role not an in-stack AWS::IAM::Role (provider permissions unknown)`];
  const hits = roleActions(role, resources).filter(isSensitiveGrant);
  return hits.length ? [`${fn}: ${[...new Set(hits)].join(', ')}`] : [];
}

/** Why a custom resource can write data ([] = it cannot, as far as the template shows). */
export function customResourceWrites(r, resources) {
  const why = sdkCallWrites(r);
  const { fns, unresolved } = providerFunctions(r.Properties?.ServiceToken, resources);
  if (unresolved)
    return [
      ...why,
      'ServiceToken not resolvable to an in-stack Lambda (provider permissions unknown)',
    ];
  for (const fn of fns) why.push(...functionWrites(fn, resources));
  return why;
}

// ---------------------------------------------------------------------------------------------------------------
// the check

const key = (stack, logicalId) => `${stack}/${logicalId}`;
const keysOf = (entries) => entries.map((e) => key(e.stack, e.logicalId));

/** The allowlist lists, each with its text field and the "no effect" explanation for the dead-entry check. */
const LISTS = [
  ['DATA_CLASS_ALLOWLIST', 'reason', 'not a data resource', 'cls'],
  ['TTL_PINS', 'reason', 'not a DynamoDB table', 'ttl'],
  [
    'REPLACE_BASELINES',
    'reason',
    'resource is allowlisted R/E or has no replace properties',
    'base',
  ],
  ['CUSTOM_RESOURCE_ALLOWLIST', 'reason', 'custom resource cannot write data', 'cr'],
  ['SECRET_RECOVERY', 'recovery', 'not a class-P secret', 'sec'],
  [
    'PROPERTY_EXEMPTIONS',
    'reason',
    'the rule finds no gap there, or the resource is not class P',
    'exempt',
  ],
];
/** Entry key of a list: PROPERTY_EXEMPTIONS can hold several properties per resource. */
const entryKey = (list, e) =>
  list === 'PROPERTY_EXEMPTIONS'
    ? `${key(e.stack, e.logicalId)}#${e.property}`
    : key(e.stack, e.logicalId);

/** resource key → Set of exempted properties. */
function groupExemptions(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = key(e.stack, e.logicalId);
    m.set(k, (m.get(k) ?? new Set()).add(e.property));
  }
  return m;
}

function newContext(allow, synthCount) {
  return {
    synthCount,
    gaps: new Map(),
    integrity: new Set(),
    seen: new Set(),
    seenStacks: new Set(),
    classOf: new Map(allow.DATA_CLASS_ALLOWLIST.map((e) => [key(e.stack, e.logicalId), e.class])),
    ttlPin: new Map(allow.TTL_PINS.map((e) => [key(e.stack, e.logicalId), e])),
    baseline: new Map(allow.REPLACE_BASELINES.map((e) => [key(e.stack, e.logicalId), e])),
    crAllowed: new Set(keysOf(allow.CUSTOM_RESOURCE_ALLOWLIST)),
    recovery: new Set(keysOf(allow.SECRET_RECOVERY ?? [])),
    exemptions: groupExemptions(allow.PROPERTY_EXEMPTIONS ?? []),
    used: {
      cls: new Set(),
      ttl: new Set(),
      base: new Set(),
      cr: new Set(),
      sec: new Set(),
      exempt: new Set(),
    },
  };
}

function addGap(ctx, k, type, text, synth) {
  const g = ctx.gaps.get(k) ?? { type, texts: new Set(), synths: new Set() };
  g.texts.add(text);
  g.synths.add(synth);
  ctx.gaps.set(k, g);
}

const weakText = (text) =>
  typeof text !== 'string' ||
  text.trim().length < MIN_REASON ||
  /^(todo|tbd|n\/a|-)/i.test(text.trim());

/** Problems of one allowlist entry, apart from duplicates (text, class, property). */
function entryProblems(list, field, e) {
  const out = [];
  if (weakText(e[field])) out.push(`${field} missing or shorter than ${MIN_REASON} characters`);
  if (list === 'DATA_CLASS_ALLOWLIST' && !['R', 'E'].includes(e.class))
    out.push('class must be R or E (P is the default, it needs no entry)');
  if (list === 'PROPERTY_EXEMPTIONS' && !Object.hasOwn(EXEMPTABLE, e.property))
    out.push(`property must be one of ${Object.keys(EXEMPTABLE).join(', ')}`);
  return out;
}

/** Allowlist hygiene: text present and long enough, no duplicates, DATA_CLASS only R/E, known properties. */
function checkHygiene(ctx, allow) {
  for (const [list, field] of LISTS) {
    const dup = new Set();
    for (const e of allow[list] ?? []) {
      const k = entryKey(list, e);
      for (const msg of entryProblems(list, field, e)) ctx.integrity.add(`${list} ${k}: ${msg}`);
      if (dup.has(k)) ctx.integrity.add(`${list} ${k}: duplicate entry`);
      dup.add(k);
    }
  }
}

function checkCustomResource(ctx, k, r, resources, synth) {
  ctx.seen.add(k);
  const why = customResourceWrites(r, resources);
  if (why.length === 0) return;
  if (ctx.crAllowed.has(k)) ctx.used.cr.add(k);
  else
    addGap(
      ctx,
      k,
      r.Type,
      `custom resource can write data, not in CUSTOM_RESOURCE_ALLOWLIST: ${why.join('; ')}`,
      synth,
    );
}

/** TTL pins apply to every table, whatever its class. */
function checkTtl(ctx, k, r, synth) {
  const spec = r.Properties?.TimeToLiveSpecification;
  const attr = spec && isTrue(spec.Enabled) ? spec.AttributeName : undefined;
  const pin = ctx.ttlPin.get(k);
  if (pin) ctx.used.ttl.add(k);
  if (attr && !pin) {
    ctx.integrity.add(`${k}: TTL on '${attr}' is not pinned in TTL_PINS`);
  } else if (pin && attr !== pin.attribute) {
    const now = attr ? `on '${attr}'` : 'off';
    ctx.integrity.add(`${k}: TTL ${now}, pinned '${pin.attribute}' [${synth}]`);
  }
}

/** AWS Backup does not cover Secrets Manager: every P secret names its recovery path. */
function checkSecretRecovery(ctx, k) {
  if (ctx.recovery.has(k)) ctx.used.sec.add(k);
  else ctx.integrity.add(`${k}: class-P secret without a SECRET_RECOVERY entry`);
}

function checkBaseline(ctx, k, r, synth) {
  const h = replaceHash(r);
  const b = ctx.baseline.get(k);
  if (!b) {
    ctx.integrity.add(`${k}: replace properties not pinned in REPLACE_BASELINES (sha256 ${h})`);
    return;
  }
  ctx.used.base.add(k);
  if (b.sha256 !== h)
    ctx.integrity.add(
      `${k}: replace properties changed (sha256 ${h}, pinned ${b.sha256}) [${synth}] — a replacement destroys the resource; pin the new hash only with a reason`,
    );
}

/** An R/E resource carries its class as tag, so the AWS side (SCP, backup selection) sees the same class. */
function checkClassTag(ctx, k, r, cls, synth) {
  const tag = tagsOf(r)[CLASS_TAG];
  if (!tag)
    addGap(ctx, k, r.Type, `tag ${CLASS_TAG}=${cls} missing (allowlist class ${cls})`, synth);
  else if (tag !== cls)
    addGap(ctx, k, r.Type, `tag ${CLASS_TAG}=${tag}, allowlist says ${cls}`, synth);
}

/** Drop the gap texts a PROPERTY_EXEMPTIONS entry covers; an entry counts as used only if it dropped one. */
function exemptedGaps(ctx, k, r, texts) {
  const props = ctx.exemptions.get(k);
  if (!props) return texts;
  let kept = texts;
  for (const prop of props) {
    const rule = EXEMPTABLE[prop];
    if (!rule?.types.includes(r.Type)) continue;
    const rest = kept.filter((t) => !rule.gap.test(t));
    if (rest.length < kept.length) ctx.used.exempt.add(`${k}#${prop}`);
    kept = rest;
  }
  return kept;
}

function checkDataResource(ctx, k, id, r, resources, synth) {
  ctx.seen.add(k);
  if (r.Type.startsWith('AWS::DynamoDB::')) checkTtl(ctx, k, r, synth);
  const cls = ctx.classOf.get(k);
  if (cls) {
    ctx.used.cls.add(k);
    checkClassTag(ctx, k, r, cls, synth);
    return;
  }
  for (const text of exemptedGaps(ctx, k, r, gapsFor(r, id, resources)))
    addGap(ctx, k, r.Type, text, synth);
  if (r.Type === 'AWS::SecretsManager::Secret') checkSecretRecovery(ctx, k);
  if (REPLACE_PROPS[r.Type]) checkBaseline(ctx, k, r, synth);
}

function checkResource(ctx, stack, id, r, resources, synth) {
  const k = key(stack, id);
  // Custom::S3AutoDeleteObjects gets its rights from the bucket policy, not from IAM: the S3 rule reports it on a
  // class-P bucket; on an R/E bucket it is the intended teardown.
  if (r.Type === 'Custom::S3AutoDeleteObjects') return;
  if (r.Type?.startsWith('Custom::') || r.Type === 'AWS::CloudFormation::CustomResource')
    checkCustomResource(ctx, k, r, resources, synth);
  else if (DATA_TYPES.has(r.Type)) checkDataResource(ctx, k, id, r, resources, synth);
}

/** Dead entries: stack in no synth (unless partial), resource gone, or the entry has no effect. */
function checkDeadEntries(ctx, allow, partial) {
  for (const [list, , noEffect, usedKey] of LISTS) {
    for (const e of allow[list] ?? []) {
      const k = entryKey(list, e);
      if (!ctx.seenStacks.has(e.stack)) {
        if (!partial)
          ctx.integrity.add(
            `${list} ${k}: dead entry (stack ${e.stack} in no synth) — synthesize every variant (infra/README.md) or pass --partial`,
          );
      } else if (!ctx.seen.has(key(e.stack, e.logicalId))) {
        ctx.integrity.add(`${list} ${k}: dead entry (resource gone)`);
      } else if (!ctx.used[usedKey].has(k)) {
        ctx.integrity.add(`${list} ${k}: entry has no effect (${noEffect})`);
      }
    }
  }
}

function formatGap(ctx, k, g) {
  const only = g.synths.size < ctx.synthCount ? ` [only ${[...g.synths].join(',')}]` : '';
  return `${k} (${g.type})${only}: ${[...g.texts].join('; ')}`;
}

/**
 * @param synths  [{ name, stacks: [{ stack, template }] }]
 * @param allow   the exports of infra/config/data-protection-allowlist.ts
 * @param opts    { partial: boolean }
 * @returns { gaps: string[], integrity: string[], summary }
 */
export function checkDataProtection(synths, allow, { partial = false } = {}) {
  const ctx = newContext(allow, synths.length);
  checkHygiene(ctx, allow);
  for (const { name, stacks } of synths) {
    for (const { stack, template } of stacks) {
      ctx.seenStacks.add(stack);
      const resources = template.Resources ?? {};
      for (const [id, r] of Object.entries(resources))
        checkResource(ctx, stack, id, r, resources, name);
    }
  }
  checkDeadEntries(ctx, allow, partial);
  return {
    gaps: [...ctx.gaps.entries()]
      .sort(([a], [b]) => byCodeUnit(a, b))
      .map(([k, g]) => formatGap(ctx, k, g)),
    integrity: [...ctx.integrity].sort(byCodeUnit),
    summary: {
      synths: synths.map((s) => s.name),
      stacks: ctx.seenStacks.size,
      resources: ctx.seen.size,
      gapResources: ctx.gaps.size,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

export const ALLOWLIST = 'infra/config/data-protection-allowlist.ts';

/** The allowlist module (TypeScript with erasable types only; Node strips them on import). */
export async function loadAllowlist(root) {
  return import(pathToFileURL(join(root, ALLOWLIST)).href);
}

/** Report lines of a check result (shared by the CLI and the infra test). */
export function formatReport(res, { strict = false, partial = false } = {}) {
  const s = res.summary;
  const out = [
    `check-data-protection: ${s.synths.join(', ')} — ${s.stacks} stacks, ${s.resources} data/custom resources, ` +
      `${res.gaps.length} with gaps, ${res.integrity.length} integrity findings${partial ? ' (partial)' : ''}`,
  ];
  if (res.gaps.length) {
    out.push('', `GAPS (${strict ? 'strict: failing' : 'report only'}):`);
    for (const g of res.gaps) out.push(`  - ${g}`);
  }
  if (res.integrity.length) {
    out.push('', 'INTEGRITY (always failing):');
    for (const f of res.integrity) out.push(`  - ${f}`);
  }
  return out;
}

async function main(argv) {
  const strict = argv.includes('--strict');
  const partial = argv.includes('--partial');
  const explicit = argv.filter((a) => !a.startsWith('--'));
  const pairs = explicit.length ? explicit : ['default=infra/cdk.out'];
  const synths = [];
  for (const p of pairs) {
    // `<name>=<cdk.out>`, split at the LAST `=` (a name may be `key=value`); a bare path is the default synth
    const i = p.lastIndexOf('=');
    const [name, dir] = i < 0 ? ['default', p] : [p.slice(0, i), p.slice(i + 1)];
    if (!existsSync(join(dir, 'manifest.json'))) {
      console.error(
        `check-data-protection: ${dir}/manifest.json missing (synth ${name}) — run npm run synth -w infra first`,
      );
      return 1;
    }
    synths.push({ name, stacks: loadAssembly(dir) });
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const res = checkDataProtection(synths, await loadAllowlist(root), { partial });
  for (const line of formatReport(res, { strict, partial })) console.log(line);
  // integrity findings always fail; gaps are report only unless --strict
  return res.integrity.length || (strict && res.gaps.length) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = await main(process.argv.slice(2));
