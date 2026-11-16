import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKLOAD_BOUNDARY_POLICY, readConfig } from '../lib/config.js';
import { CDK_JSON_CONTEXT, TEST_CERT_ARN, contextReader } from './helpers.js';

const read = (overrides: Record<string, unknown> = {}) =>
  readConfig(contextReader({ ...CDK_JSON_CONTEXT, ...overrides }));

describe('readConfig', () => {
  it('committed defaults: tldcost.io, site in eu-west-1, no account, no alternates, no certificate yet', () => {
    expect(read()).toEqual({
      account: undefined,
      siteRegion: 'eu-west-1',
      domainName: 'tldcost.io',
      alternateDomainNames: [],
      certificateArn: undefined,
      githubOidcSubject: 'repo:chnet@16511920/tldcost@1442468107:environment:production',
      githubJobWorkflowRef: 'chnet/tldcost/.github/workflows/deploy.yml@refs/heads/main',
      createGithubOidcProvider: false,
      attachDomainNames: true,
      workloadBoundaryPolicyName: 'chnet-tldcost-workload-boundary',
    });
  });

  it('workloadBoundaryPolicyName: default, custom name, empty = none, invalid rejected', () => {
    expect(read().workloadBoundaryPolicyName).toBe(DEFAULT_WORKLOAD_BOUNDARY_POLICY);
    expect(read({ workloadBoundaryPolicyName: null }).workloadBoundaryPolicyName).toBe(
      DEFAULT_WORKLOAD_BOUNDARY_POLICY,
    );
    expect(read({ workloadBoundaryPolicyName: ' my-boundary ' }).workloadBoundaryPolicyName).toBe(
      'my-boundary',
    );
    expect(read({ workloadBoundaryPolicyName: '' }).workloadBoundaryPolicyName).toBeUndefined();
    expect(read({ workloadBoundaryPolicyName: '  ' }).workloadBoundaryPolicyName).toBeUndefined();
    for (const bad of ['a/b', 'arn:aws:iam::aws:policy/x', 'x'.repeat(129), 'with space']) {
      expect(() => read({ workloadBoundaryPolicyName: bad }), bad).toThrow(
        /workloadBoundaryPolicyName/,
      );
    }
    expect(() => read({ workloadBoundaryPolicyName: true })).toThrow(/must be a string/);
  });

  describe('account-move flags (createGithubOidcProvider, attachDomainNames)', () => {
    it('accept "true"/"false" strings (cdk -c) and booleans (cdk.json)', () => {
      for (const [value, expected] of [
        ['true', true],
        ['false', false],
        [true, true],
        [false, false],
        ['', undefined],
        [undefined, undefined],
      ] as const) {
        const c = read({ createGithubOidcProvider: value, attachDomainNames: value });
        expect(c.createGithubOidcProvider, String(value)).toBe(expected ?? false);
        expect(c.attachDomainNames, String(value)).toBe(expected ?? true);
      }
    });

    it('reject anything else', () => {
      for (const value of ['yes', '1', 'TRUE ', 1, 0, 'False']) {
        expect(() => read({ attachDomainNames: value }), String(value)).toThrow(
          /attachDomainNames/,
        );
        expect(() => read({ createGithubOidcProvider: value }), String(value)).toThrow(
          /createGithubOidcProvider/,
        );
      }
    });
  });

  it('siteRegion is a parameter (eu-central-1 and us-east-1 still possible)', () => {
    expect(read({ siteRegion: 'eu-central-1' }).siteRegion).toBe('eu-central-1');
    expect(read({ siteRegion: 'us-east-1' }).siteRegion).toBe('us-east-1');
    expect(() => read({ siteRegion: 'europe' })).toThrow(/siteRegion/);
  });

  it('validates the account format', () => {
    expect(read({ account: '123456789012' }).account).toBe('123456789012');
    expect(() => read({ account: '1234' })).toThrow(/12-digit/);
  });

  it('certificateArn must be an ACM certificate in us-east-1', () => {
    expect(read({ certificateArn: TEST_CERT_ARN }).certificateArn).toBe(TEST_CERT_ARN);
    expect(() => read({ certificateArn: TEST_CERT_ARN.replace('us-east-1', 'eu-west-1') })).toThrow(
      /us-east-1/,
    );
    expect(() => read({ certificateArn: TEST_CERT_ARN.replace(':acm:', ':iam:') })).toThrow(/ACM/);
    expect(() =>
      read({ certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/*' }),
    ).toThrow(/ACM/);
    expect(() => read({ certificateArn: 'tldcost.io' })).toThrow(/ACM/);
  });

  it('certificateArn must belong to the given account', () => {
    expect(read({ certificateArn: TEST_CERT_ARN, account: '123456789012' }).account).toBe(
      '123456789012',
    );
    expect(() => read({ certificateArn: TEST_CERT_ARN, account: '111111111111' })).toThrow(
      /belongs to account/,
    );
  });

  it('parses alternate domains from CLI strings (-c alternateDomainNames=...)', () => {
    expect(read({ alternateDomainNames: 'tldcost.de, tldcost.com' }).alternateDomainNames).toEqual([
      'tldcost.de',
      'tldcost.com',
    ]);
    expect(read({ alternateDomainNames: '["tldcost.de"]' }).alternateDomainNames).toEqual([
      'tldcost.de',
    ]);
    expect(() => read({ alternateDomainNames: ['www.tldcost.io'] })).toThrow(/duplicates/);
    expect(() => read({ alternateDomainNames: ['not a domain'] })).toThrow(/valid domain/);
  });

  describe('githubOidcSubject (immutable, environment-bound)', () => {
    it('accepts the immutable owner@id/repo@id form', () => {
      expect(read().githubOidcSubject).toBe(
        'repo:chnet@16511920/tldcost@1442468107:environment:production',
      );
    });

    it('rejects the classic mutable form repo:<owner>/<repo>:environment:<name>', () => {
      expect(() =>
        read({ githubOidcSubject: 'repo:chnet/tldcost:environment:production' }),
      ).toThrow(/immutable/);
    });

    it('rejects branch-bound and wildcard subjects', () => {
      for (const sub of [
        'repo:chnet@16511920/tldcost@1442468107:ref:refs/heads/main',
        'repo:chnet@16511920/tldcost@1442468107:*',
        'repo:chnet@16511920/tldcost@1442468107:environment:*',
        'repo:chnet@16511920/tldcost@1442468107:environment:prod:extra',
        'repo:chnet@abc/tldcost@1442468107:environment:production',
        'repo:chnet@16511920/tldcost:environment:production',
      ]) {
        expect(() => read({ githubOidcSubject: sub }), sub).toThrow(/githubOidcSubject/);
      }
    });
  });

  describe('githubJobWorkflowRef (main only)', () => {
    it('rejects tags, other branches, wildcards and missing refs', () => {
      for (const ref of [
        '',
        'chnet/tldcost/.github/workflows/deploy.yml@refs/tags/v1.0.0',
        'chnet/tldcost/.github/workflows/deploy.yml@refs/heads/develop',
        'chnet/tldcost/.github/workflows/deploy.yml@refs/heads/main-old',
        'chnet/tldcost/.github/workflows/deploy.yml@refs/heads/*',
        'chnet/tldcost/.github/workflows/*.yml@refs/heads/main',
        'chnet/tldcost/.github/workflows/deploy.yml',
      ]) {
        expect(() => read({ githubJobWorkflowRef: ref }), ref).toThrow(/githubJobWorkflowRef/);
      }
    });
  });
});
