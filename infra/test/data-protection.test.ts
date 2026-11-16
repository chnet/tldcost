// Data-protection check (scripts/check-data-protection.mjs) on every synth of the app: each context
// variant below is synthesized through the same entry point as `cdk synth` (createApp) and checked together.
// GAPS are report only: printed, never failing (backup rollout step B3b). INTEGRITY findings (allowlist
// hygiene: missing reason, dead entry, TTL or replace baseline) fail the test, as in the CLI. The tests also
// fail when a variant does not synthesize or a switch of lib/config.ts has no variant here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkDataProtection,
  formatReport,
  type Synth,
} from '../../scripts/check-data-protection.mjs';
import * as allowlist from '../config/data-protection-allowlist.js';
import { createApp } from '../lib/app.js';
import { CDK_JSON_CONTEXT, TEST_CERT_ARN } from './helpers.js';

/**
 * Every context switch that changes the resource set: no certificateArn = only tldcost-cert; with it the
 * site stack, once per switch (bool or optionalName) of lib/config.ts.
 */
export const SYNTHS: Record<string, Record<string, unknown>> = {
  default: {},
  site: { certificateArn: TEST_CERT_ARN },
  'site-create-oidc-provider': { certificateArn: TEST_CERT_ARN, createGithubOidcProvider: true },
  'site-detached-domains': { certificateArn: TEST_CERT_ARN, attachDomainNames: false },
  'site-no-boundary': { certificateArn: TEST_CERT_ARN, workloadBoundaryPolicyName: '' },
};

function synth(name: string, context: Record<string, unknown>): Synth {
  const { app } = createApp({ context: { ...CDK_JSON_CONTEXT, ...context } });
  const assembly = app.synth();
  return {
    name,
    stacks: assembly.stacks.map((s) => ({
      stack: s.stackName,
      template: s.template as Synth['stacks'][number]['template'],
    })),
  };
}

describe('data-protection check (gaps report only)', () => {
  it('runs on every synth, prints its report, and has no integrity finding', () => {
    const synths = Object.entries(SYNTHS).map(([name, ctx]) => synth(name, ctx));
    const res = checkDataProtection(synths, { ...allowlist });
    console.log(formatReport(res).join('\n'));
    expect(res.integrity).toEqual([]);
    expect(res.summary.synths).toEqual(Object.keys(SYNTHS));
    expect(new Set(synths.flatMap((s) => s.stacks.map((t) => t.stack)))).toEqual(
      new Set(['tldcost-cert', 'tldcost']),
    );
  });

  it('SYNTHS switches every switch context (bool, optionalName) of lib/config.ts and the certificate ARN', () => {
    const source = readFileSync(new URL('../lib/config.ts', import.meta.url), 'utf8');
    const switches = [...source.matchAll(/\b(?:bool|optionalName)\(\s*ctx,\s*'(\w+)'/g)].map(
      (m) => m[1] as string,
    );
    expect(switches).toContain('workloadBoundaryPolicyName');
    expect(switches.length).toBeGreaterThan(0);
    const used = new Set(Object.values(SYNTHS).flatMap((ctx) => Object.keys(ctx)));
    for (const key of [...switches, 'certificateArn']) expect(used, key).toContain(key);
  });
});
