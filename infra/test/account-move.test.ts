import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { synthSite, TEST_CERT_ARN } from './helpers.js';

// Flags for moving the tldcost stacks into another AWS account.
// The defaults must leave the site stack exactly as before: the snapshot below is the template of
// main before the flags existed (CDKMetadata removed, it changes with every CDK version), plus the
// permissions boundary on the deploy role (default of workloadBoundaryPolicyName) and the alternate
// domains tldcost.de and www.tldcost.de from cdk.json (aliases and the function's redirect list).

type Resources = Record<
  string,
  {
    Type: string;
    Properties?: Record<string, unknown>;
    DeletionPolicy?: string;
    UpdateReplacePolicy?: string;
    DependsOn?: string[];
  }
>;
type Json = Record<string, unknown>;

/** Copy of an object without the given keys. */
function omit<T extends object>(o: T, ...keys: string[]): T {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
}

const resourcesOf = (overrides: Record<string, unknown> = {}): Resources => {
  return omit(synthSite(overrides).template.toJSON().Resources as Resources, 'CDKMetadata');
};
const idOf = (r: Resources, type: string) => {
  const ids = Object.keys(r).filter((k) => r[k]?.Type === type);
  expect(ids, type).toHaveLength(1);
  return ids[0] as string;
};
const distConfig = (r: Resources) =>
  r[idOf(r, 'AWS::CloudFront::Distribution')]?.Properties?.DistributionConfig as Json;
const trust = (r: Resources) =>
  (
    (r[idOf(r, 'AWS::IAM::Role')]?.Properties?.AssumeRolePolicyDocument as Json).Statement as Json[]
  )[0] as Json;

describe('account-move flags: defaults unchanged', () => {
  it('default site template equals the committed snapshot (template of main before the flags)', async () => {
    const { template } = synthSite();
    const { Resources, ...rest } = template.toJSON() as { Resources: Resources };
    const resources = omit(Resources, 'CDKMetadata');
    await expect(
      `${JSON.stringify({ ...rest, Resources: resources }, null, 2)}\n`,
    ).toMatchFileSnapshot('./__snapshots__/site-default.template.json');
  });

  it('explicit defaults (attachDomainNames=true, createGithubOidcProvider=false) change nothing', () => {
    expect(resourcesOf({ attachDomainNames: 'true', createGithubOidcProvider: 'false' })).toEqual(
      resourcesOf(),
    );
    expect(resourcesOf({ attachDomainNames: true, createGithubOidcProvider: false })).toEqual(
      resourcesOf(),
    );
    expect(resourcesOf({ workloadBoundaryPolicyName: 'chnet-tldcost-workload-boundary' })).toEqual(
      resourcesOf(),
    );
  });

  it('default imports the OIDC provider by ARN and creates none', () => {
    const r = resourcesOf();
    expect(Object.values(r).filter((v) => v.Type === 'AWS::IAM::OIDCProvider')).toHaveLength(0);
    expect(JSON.stringify(trust(r).Principal)).toContain(
      ':oidc-provider/token.actions.githubusercontent.com',
    );
  });
});

describe('attachDomainNames=false', () => {
  const base = resourcesOf();
  const moved = resourcesOf({ attachDomainNames: 'false' });

  it('drops only the alternate domain names; certificate, TLS policy and everything else stay', () => {
    const { Aliases, ...baseRest } = distConfig(base);
    expect(Aliases).toEqual(['tldcost.io', 'www.tldcost.io', 'tldcost.de', 'www.tldcost.de']);
    expect(distConfig(moved).Aliases).toBeUndefined();
    expect(distConfig(moved)).toEqual(baseRest);
    expect(distConfig(moved).ViewerCertificate).toEqual({
      AcmCertificateArn: TEST_CERT_ARN,
      MinimumProtocolVersion: 'TLSv1.2_2021',
      SslSupportMethod: 'sni-only',
    });
  });

  it('changes no other resource (function, headers policies, bucket, role, policies)', () => {
    const dist = idOf(base, 'AWS::CloudFront::Distribution');
    expect(omit(moved, dist)).toEqual(omit(base, dist));
  });

  it('acknowledges the CDK warning for a certificate without domain names, no other warnings', () => {
    const { stack } = synthSite({ attachDomainNames: 'false' });
    Annotations.fromStack(stack).hasNoWarning('*', Match.anyValue());
  });

  it('still needs the certificate ARN', () => {
    expect(() => synthSite({ attachDomainNames: 'false', certificateArn: undefined })).toThrow(
      /site stack not synthesized/,
    );
  });
});

describe('createGithubOidcProvider=true', () => {
  const base = resourcesOf();
  const created = resourcesOf({ createGithubOidcProvider: 'true' });

  it('creates exactly one plain AWS::IAM::OIDCProvider for GitHub, no Lambda, no custom resource', () => {
    const provider = created[idOf(created, 'AWS::IAM::OIDCProvider')]?.Properties as Json;
    expect(provider.Url).toBe('https://token.actions.githubusercontent.com');
    expect(provider.ClientIdList).toEqual(['sts.amazonaws.com']);
    expect(provider.ThumbprintList).toBeUndefined(); // optional in CloudFormation, IAM determines it
    // a later deploy without the flag must not delete it (the deploy role would be dead)
    const resource = created[idOf(created, 'AWS::IAM::OIDCProvider')];
    expect(resource?.DeletionPolicy).toBe('Retain');
    expect(resource?.UpdateReplacePolicy).toBe('Retain');
    const kinds = Object.values(created).map((v) => v.Type);
    expect(kinds.filter((t) => /Lambda|Custom::|CloudFormation::CustomResource/.test(t))).toEqual(
      [],
    );
  });

  it('role trust policy is byte-identical to the default (constructed provider ARN, no Ref/GetAtt)', () => {
    const role = idOf(base, 'AWS::IAM::Role');
    expect(JSON.stringify(created[role]?.Properties?.AssumeRolePolicyDocument)).toBe(
      JSON.stringify(base[role]?.Properties?.AssumeRolePolicyDocument),
    );
    expect(JSON.stringify(trust(created).Principal)).toContain(
      ':oidc-provider/token.actions.githubusercontent.com',
    );
    expect(JSON.stringify(trust(created))).not.toMatch(/GithubOidcProvider/);
  });

  it('changes nothing else: the provider is added, role and its policy only get DependsOn on it', () => {
    const providerId = idOf(created, 'AWS::IAM::OIDCProvider');
    const rest = omit(created, providerId);
    const withDeps = Object.keys(rest).filter((k) => rest[k]?.DependsOn);
    expect(withDeps.sort()).toEqual(
      [idOf(base, 'AWS::IAM::Role'), idOf(base, 'AWS::IAM::Policy')].sort(),
    );
    for (const k of withDeps) expect(rest[k]?.DependsOn).toEqual([providerId]);
    const role = omit(rest[idOf(base, 'AWS::IAM::Role')] ?? { Type: '' }, 'DependsOn');
    const policy = omit(rest[idOf(base, 'AWS::IAM::Policy')] ?? { Type: '' }, 'DependsOn');
    expect({
      ...rest,
      [idOf(base, 'AWS::IAM::Role')]: role,
      [idOf(base, 'AWS::IAM::Policy')]: policy,
    }).toEqual(base);
  });
});

describe('both flags (new account before the cutover)', () => {
  it('= drop aliases + create provider, nothing else', () => {
    const r = resourcesOf({ attachDomainNames: 'false', createGithubOidcProvider: 'true' });
    expect(distConfig(r).Aliases).toBeUndefined();
    expect(Object.values(r).filter((v) => v.Type === 'AWS::IAM::OIDCProvider')).toHaveLength(1);
    expect(Object.keys(r).sort()).toEqual(
      [...Object.keys(resourcesOf()), idOf(r, 'AWS::IAM::OIDCProvider')].sort(),
    );
  });
});
