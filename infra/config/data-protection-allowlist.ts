/**
 * Allowlist of scripts/check-data-protection.mjs (same check as in the organisation's infrastructure
 * repository, backup rollout step B3b). Every data resource the check does not find here is class P and
 * must meet the P rules (Retain, deletion protection, PITR/versioning, tag chnet:class=P, …). R/E resources
 * carry their class as tag chnet:class=R|E (checked as a gap).
 *
 * Every entry needs a reason (at least 15 characters). An entry whose resource no longer exists in any
 * synth is reported as a dead entry, so remove the entry together with the resource.
 *
 * Keys: stack name + logical ID of the synthesized template.
 *
 * Erasable TypeScript only (interfaces and type annotations): the check's CLI imports this file with
 * Node's built-in type stripping.
 */

/** R = rebuildable from the repository or a build, E = ephemeral (counters, short-lived logs, tokens). */
export type DataClass = 'R' | 'E';

export interface DataClassEntry {
  stack: string;
  logicalId: string;
  class: DataClass;
  reason: string;
}

/** TTL attribute of a DynamoDB table. A new or changed TimeToLiveSpecification is reported. */
export interface TtlPin {
  stack: string;
  logicalId: string;
  attribute: string;
  reason: string;
}

/**
 * sha256 (16 hex) of the replace properties (REPLACE_PROPS in the check) of a class-P EC2 instance, RDS
 * database, hosted zone, state machine or queue. A change means CloudFormation replaces the resource.
 */
export interface ReplaceBaseline {
  stack: string;
  logicalId: string;
  sha256: string;
  reason: string;
}

/** Custom resources whose provider can call a data-service write verb. */
export interface CustomResourceEntry {
  stack: string;
  logicalId: string;
  reason: string;
}

/**
 * AWS Backup does not cover Secrets Manager: every class-P secret names how its value comes back after a
 * loss. Names and sources only, never a value. tldcost has no secrets today.
 */
export interface SecretRecoveryEntry {
  stack: string;
  logicalId: string;
  recovery: string;
}

/**
 * A class-P resource may skip exactly one rule (`property`, today only 'pitr'), with a reason. It stays class P;
 * every other rule applies. An entry that suppresses nothing (the rule finds no gap there) fails the check.
 */
export interface PropertyExemption {
  stack: string;
  logicalId: string;
  property: 'pitr';
  reason: string;
}

export const DATA_CLASS_ALLOWLIST: DataClassEntry[] = [
  {
    stack: 'tldcost',
    logicalId: 'SiteBucket397A1860',
    class: 'R',
    reason:
      'static site build: every object is rebuilt from the repository (site/ + data/ in git) by the deploy workflow; versioning only serves the rollback to a previous build',
  },
];

export const TTL_PINS: TtlPin[] = [];

export const REPLACE_BASELINES: ReplaceBaseline[] = [];

export const CUSTOM_RESOURCE_ALLOWLIST: CustomResourceEntry[] = [];

export const SECRET_RECOVERY: SecretRecoveryEntry[] = [];

export const PROPERTY_EXEMPTIONS: PropertyExemption[] = [];
