import { readFileSync } from 'node:fs';
import { Template } from 'aws-cdk-lib/assertions';
import { createApp } from '../lib/app.js';
import type { TldcostCertStack } from '../lib/cert-stack.js';
import type { TldcostSiteStack } from '../lib/site-stack.js';

/** Context from cdk.json, so tests exercise the committed defaults. */
export const CDK_JSON_CONTEXT = JSON.parse(
  readFileSync(new URL('../cdk.json', import.meta.url), 'utf8'),
).context as Record<string, unknown>;

/** Example ARN for tests only (documentation account 123456789012). */
export const TEST_CERT_ARN =
  'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000000';

/** Cert stack via the same entry point as bin/tldcost.ts, with cdk.json context plus overrides. */
export function synthCert(overrides: Record<string, unknown> = {}): {
  template: Template;
  stack: TldcostCertStack;
} {
  const { certStack } = createApp({ context: { ...CDK_JSON_CONTEXT, ...overrides } });
  return { template: Template.fromStack(certStack), stack: certStack };
}

/** Site stack (needs certificateArn; defaults to TEST_CERT_ARN). */
export function synthSite(overrides: Record<string, unknown> = {}): {
  template: Template;
  stack: TldcostSiteStack;
} {
  const { siteStack } = createApp({
    context: { ...CDK_JSON_CONTEXT, certificateArn: TEST_CERT_ARN, ...overrides },
  });
  if (!siteStack) throw new Error('site stack not synthesized');
  return { template: Template.fromStack(siteStack), stack: siteStack };
}

export function contextReader(ctx: Record<string, unknown>) {
  return { tryGetContext: (key: string) => ctx[key] };
}

/** First resource of a `Template.findResources()` result; fails the test if there is none. */
export function firstResource<T>(resources: Record<string, T>): T {
  const [first] = Object.values(resources);
  if (first === undefined) throw new Error('expected at least one matching resource');
  return first;
}
