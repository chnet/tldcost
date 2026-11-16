import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { createApp } from '../lib/app.js';
import { CDK_JSON_CONTEXT, TEST_CERT_ARN, firstResource, synthSite } from './helpers.js';

const SUBJECT = 'repo:chnet@16511920/tldcost@1442468107:environment:production';
const JOB_WORKFLOW_REF = 'chnet/tldcost/.github/workflows/deploy.yml@refs/heads/main';

describe('stack tldcost (site, defaults from cdk.json + certificateArn)', () => {
  const { template, stack } = synthSite();
  const json = JSON.stringify(template.toJSON());

  it('is named tldcost, lives in eu-west-1 by default, termination protection on', () => {
    expect(stack.stackName).toBe('tldcost');
    expect(stack.region).toBe('eu-west-1');
    expect(stack.terminationProtection).toBe(true);
  });

  it('is account-neutral apart from the certificate ARN passed in', () => {
    expect(json.split(TEST_CERT_ARN).join('')).not.toMatch(/\d{12}/);
  });

  it('uses the tldcost bootstrap qualifier', () => {
    const assembly = createApp({
      context: { ...CDK_JSON_CONTEXT, certificateArn: TEST_CERT_ARN },
    }).app.synth();
    expect(assembly.stacks.map((s) => s.stackName).sort()).toEqual(['tldcost', 'tldcost-cert']);
    expect(assembly.getStackArtifact('tldcost').assumeRoleArn).toContain(
      'cdk-tldcost-deploy-role-',
    );
  });

  it('creates no certificate, Route 53 zone/records, OIDC provider, Lambda or custom resource', () => {
    template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
    template.resourceCountIs('AWS::Route53::HostedZone', 0);
    template.resourceCountIs('AWS::Route53::RecordSet', 0);
    template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
    template.resourceCountIs('AWS::Lambda::Function', 0);
    template.resourceCountIs('AWS::SSM::Parameter', 0);
    expect(json).not.toMatch(/"Custom::/);
  });

  describe('S3 site bucket', () => {
    it('is versioned, private, encrypted and retained', () => {
      template.hasResource('AWS::S3::Bucket', {
        DeletionPolicy: 'Retain',
        Properties: Match.objectLike({
          VersioningConfiguration: { Status: 'Enabled' },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
          BucketEncryption: Match.objectLike({
            ServerSideEncryptionConfiguration: [
              { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
            ],
          }),
        }),
      });
    });

    it('keeps old builds for rollback (noncurrent versions expire after 90 days)', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Status: 'Enabled',
              NoncurrentVersionExpiration: { NoncurrentDays: 90, NewerNoncurrentVersions: 10 },
            }),
          ]),
        },
      });
    });

    it('bucket policy denies non-TLS access and grants read only to CloudFront for this distribution', () => {
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
            Match.objectLike({
              Effect: 'Allow',
              Action: 's3:GetObject',
              Principal: { Service: 'cloudfront.amazonaws.com' },
              Condition: {
                StringEquals: {
                  'AWS:SourceArn': {
                    'Fn::Join': [
                      '',
                      Match.arrayWith([
                        ':distribution/',
                        { Ref: Match.stringLikeRegexp('^Distribution') },
                      ]),
                    ],
                  },
                },
              },
            }),
          ]),
        },
      });
    });
  });

  describe('CloudFront', () => {
    it('serves apex + www with the imported us-east-1 certificate, OAC origin via regional bucket domain', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Aliases: ['tldcost.io', 'www.tldcost.io'],
          DefaultRootObject: 'index.html',
          HttpVersion: 'http2and3',
          IPV6Enabled: true,
          PriceClass: 'PriceClass_100',
          Logging: Match.absent(),
          ViewerCertificate: {
            AcmCertificateArn: TEST_CERT_ARN,
            MinimumProtocolVersion: 'TLSv1.2_2021',
            SslSupportMethod: 'sni-only',
          },
          Origins: [
            Match.objectLike({
              // regional endpoint: works for a bucket outside us-east-1
              DomainName: {
                'Fn::GetAtt': [Match.stringLikeRegexp('^SiteBucket'), 'RegionalDomainName'],
              },
              OriginAccessControlId: Match.anyValue(),
              S3OriginConfig: { OriginAccessIdentity: '' },
            }),
          ],
          DefaultCacheBehavior: Match.objectLike({
            ViewerProtocolPolicy: 'redirect-to-https',
            AllowedMethods: ['GET', 'HEAD'],
            Compress: true,
            ResponseHeadersPolicyId: Match.anyValue(),
            FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
          }),
          CustomErrorResponses: [
            {
              ErrorCode: 403,
              ResponseCode: 404,
              ResponsePagePath: '/404.html',
              ErrorCachingMinTTL: 300,
            },
            {
              ErrorCode: 404,
              ResponseCode: 404,
              ResponsePagePath: '/404.html',
              ErrorCachingMinTTL: 300,
            },
          ],
        }),
      });
      template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 0);
      template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
        OriginAccessControlConfig: Match.objectLike({
          OriginAccessControlOriginType: 's3',
          SigningBehavior: 'always',
        }),
      });
    });

    it('sends security headers', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: Match.objectLike({
          SecurityHeadersConfig: {
            StrictTransportSecurity: {
              AccessControlMaxAgeSec: 63072000,
              IncludeSubdomains: true,
              Preload: false,
              Override: true,
            },
            ContentTypeOptions: { Override: true },
            FrameOptions: { FrameOption: 'DENY', Override: true },
            ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
            XSSProtection: { Protection: false, Override: true },
            ContentSecurityPolicy: {
              ContentSecurityPolicy: Match.stringLikeRegexp("frame-ancestors 'none'"),
              Override: true,
            },
          },
          CustomHeadersConfig: {
            Items: Match.arrayWith([Match.objectLike({ Header: 'Permissions-Policy' })]),
          },
        }),
      });
      // interest-cohort (FLoC) is obsolete and triggers browser console warnings.
      expect(json).not.toContain('interest-cohort');
      // scripts and styles from 'self' only: the site build has no inline code (no hashes either)
      expect(json).toContain("style-src 'self';");
      expect(json).toContain("script-src 'self';");
      expect(json).not.toContain('unsafe-inline');
    });

    describe('api/* behavior (public JSON API)', () => {
      const config = () =>
        firstResource(template.findResources('AWS::CloudFront::Distribution')).Properties
          .DistributionConfig;
      const policies = () => template.findResources('AWS::CloudFront::ResponseHeadersPolicy');

      it('has exactly one extra behavior, api/*, with the same settings as the default except the headers policy', () => {
        const { DefaultCacheBehavior: dflt, CacheBehaviors: behaviors, Origins } = config();
        expect(behaviors).toHaveLength(1);
        const { PathPattern, ResponseHeadersPolicyId, ...api } = behaviors[0];
        const { ResponseHeadersPolicyId: defaultPolicyId, ...rest } = dflt;
        expect(PathPattern).toBe('api/*');
        expect(api).toEqual(rest); // same origin, cache policy, methods, compression, viewer-request function
        expect(api.AllowedMethods).toEqual(['GET', 'HEAD']);
        expect(api.CachePolicyId).toBe('658327ea-f89d-4fab-a63d-7e88639e58f6'); // Managed-CachingOptimized
        expect(ResponseHeadersPolicyId).not.toEqual(defaultPolicyId);
        expect(Origins).toHaveLength(1);
        template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
      });

      it('sends CORS Access-Control-Allow-Origin * for GET/HEAD only, without credentials', () => {
        const [apiPolicyId, ...others] = Object.keys(policies()).filter(
          (id) => policies()[id]?.Properties.ResponseHeadersPolicyConfig.CorsConfig,
        );
        expect(others).toHaveLength(0);
        expect(config().CacheBehaviors[0].ResponseHeadersPolicyId).toEqual({ Ref: apiPolicyId });
        expect(
          policies()[apiPolicyId as string]?.Properties.ResponseHeadersPolicyConfig.CorsConfig,
        ).toEqual({
          AccessControlAllowOrigins: { Items: ['*'] },
          AccessControlAllowMethods: { Items: ['GET', 'HEAD'] },
          AccessControlAllowHeaders: { Items: ['*'] },
          AccessControlAllowCredentials: false,
          OriginOverride: true,
        });
      });

      it('keeps the same security headers on the API as on the site', () => {
        const configs = Object.values(policies()).map(
          (p) => p.Properties.ResponseHeadersPolicyConfig,
        );
        expect(configs).toHaveLength(2);
        const [a, b] = configs;
        expect(a.SecurityHeadersConfig).toEqual(b.SecurityHeadersConfig);
        expect(a.CustomHeadersConfig).toEqual(b.CustomHeadersConfig);
        expect(a.RemoveHeadersConfig).toEqual(b.RemoveHeadersConfig);
        // the site policy has no CORS
        expect(configs.filter((c) => c.CorsConfig)).toHaveLength(1);
      });
    });

    it('viewer-request function redirects www to the apex, all placeholders resolved', () => {
      template.hasResourceProperties('AWS::CloudFront::Function', {
        FunctionConfig: { Runtime: 'cloudfront-js-2.0', Comment: Match.anyValue() },
        FunctionCode: Match.stringLikeRegexp('var REDIRECT_HOSTS = \\["www\\.tldcost\\.io"\\];'),
      });
      const fn = firstResource(template.findResources('AWS::CloudFront::Function'));
      const code = fn.Properties.FunctionCode as string;
      expect(code).toContain('var CANONICAL_HOST = "tldcost.io";');
      expect(code).not.toMatch(/= '?__[A-Z_]+__'?;/);
      expect(typeof new Function(`${code}\nreturn handler;`)()).toBe('function');
    });
  });

  describe('GitHub OIDC deploy role', () => {
    it('trusts only the imported account OIDC provider with exact aud + environment-bound sub + job_workflow_ref', () => {
      template.resourceCountIs('AWS::IAM::Role', 1);
      template.hasResourceProperties('AWS::IAM::Role', {
        MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: 'sts:AssumeRoleWithWebIdentity',
              Principal: {
                Federated: {
                  'Fn::Join': [
                    '',
                    Match.arrayWith([
                      { Ref: 'AWS::AccountId' },
                      ':oidc-provider/token.actions.githubusercontent.com',
                    ]),
                  ],
                },
              },
              Condition: {
                StringEquals: {
                  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                  'token.actions.githubusercontent.com:sub': SUBJECT,
                  'token.actions.githubusercontent.com:job_workflow_ref': JOB_WORKFLOW_REF,
                },
              },
            },
          ],
        },
      });
    });

    it('has no StringLike / wildcard in the trust policy and is not bound to a branch ref', () => {
      const roles = template.findResources('AWS::IAM::Role');
      const doc = firstResource(roles).Properties.AssumeRolePolicyDocument;
      const trust = JSON.stringify(doc);
      expect(trust).not.toContain('StringLike');
      expect(trust).not.toContain('*');
      expect(trust).not.toContain('ref:refs/heads');
      expect(Object.keys(doc.Statement[0].Condition)).toEqual(['StringEquals']);
      expect(Object.keys(doc.Statement[0].Condition.StringEquals).sort()).toEqual([
        'token.actions.githubusercontent.com:aud',
        'token.actions.githubusercontent.com:job_workflow_ref',
        'token.actions.githubusercontent.com:sub',
      ]);
    });

    it('has exactly the least-privilege statements, no "*" resources', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      expect(Object.keys(policies)).toHaveLength(1);
      const statements = firstResource(policies).Properties.PolicyDocument.Statement as Array<{
        Sid: string;
        Action: string | string[];
        Resource: unknown;
        Effect: string;
      }>;
      const summary = statements.map((s) => ({
        sid: s.Sid,
        effect: s.Effect,
        actions: [s.Action].flat().sort(),
      }));
      expect(summary).toEqual([
        { sid: 'ListSiteBucket', effect: 'Allow', actions: ['s3:ListBucket'] },
        { sid: 'WriteSiteObjects', effect: 'Allow', actions: ['s3:DeleteObject', 's3:PutObject'] },
        {
          sid: 'InvalidateDistribution',
          effect: 'Allow',
          actions: ['cloudfront:CreateInvalidation'],
        },
      ]);
      for (const s of statements) expect(s.Resource).not.toBe('*');

      const byId = Object.fromEntries(statements.map((s) => [s.Sid, JSON.stringify(s.Resource)]));
      expect(byId.ListSiteBucket).toMatch(/SiteBucket.*"Arn"/);
      expect(byId.ListSiteBucket).not.toContain('/*');
      expect(byId.WriteSiteObjects).toMatch(/SiteBucket.*"\/\*"/);
      expect(byId.InvalidateDistribution).toMatch(/:distribution\/".*Distribution/);
    });

    it('cannot assume CDK bootstrap roles (infra deploys run locally, not from CI)', () => {
      const policy = JSON.stringify(template.findResources('AWS::IAM::Policy'));
      expect(policy).not.toContain('sts:');
      expect(policy).not.toContain('cdk-tldcost');
    });
  });

  it('exports the values needed for DNS and the deploy workflow', () => {
    for (const out of [
      'DistributionDomainName',
      'DistributionId',
      'SiteBucketName',
      'GithubDeployRoleArn',
    ]) {
      template.hasOutput(out, Match.anyValue());
    }
  });

  it('tags resources with Project=CHnet and app=tldcost', () => {
    for (const type of ['AWS::S3::Bucket', 'AWS::CloudFront::Distribution', 'AWS::IAM::Role']) {
      for (const tag of [
        { Key: 'Project', Value: 'CHnet' },
        { Key: 'app', Value: 'tldcost' },
      ]) {
        template.hasResourceProperties(type, { Tags: Match.arrayWith([tag]) });
      }
    }
  });
});

describe('site region parameter', () => {
  it('eu-central-1 and us-east-1 are possible; certificate stays the imported us-east-1 ARN', () => {
    for (const siteRegion of ['eu-central-1', 'us-east-1']) {
      const { template, stack } = synthSite({ siteRegion });
      expect(stack.region).toBe(siteRegion);
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          ViewerCertificate: Match.objectLike({ AcmCertificateArn: TEST_CERT_ARN }),
        }),
      });
    }
  });
});

describe('explicit account via context', () => {
  it('uses the given account for the OIDC provider ARN and the distribution ARN', () => {
    const { template } = synthSite({ account: '123456789012' });
    const json = JSON.stringify(template.toJSON());
    expect(json).toContain(':iam::123456789012:oidc-provider/token.actions.githubusercontent.com');
    expect(json).toContain(':cloudfront::123456789012:distribution/');
  });
});

describe('permissions boundary (workloadBoundaryPolicyName)', () => {
  const boundaryOf = (overrides: Record<string, unknown> = {}) => {
    const roles = synthSite(overrides).template.findResources('AWS::IAM::Role');
    expect(Object.keys(roles).length).toBeGreaterThan(0);
    return Object.values(roles).map((r) =>
      JSON.stringify((r as { Properties: Record<string, unknown> }).Properties.PermissionsBoundary),
    );
  };

  it('default: every IAM role has the default boundary policy of its own account', () => {
    for (const b of boundaryOf()) {
      expect(b).toContain(':policy/chnet-tldcost-workload-boundary');
      expect(b).toContain('AWS::AccountId');
    }
  });

  it('also covers the roles of the createGithubOidcProvider variant', () => {
    for (const b of boundaryOf({ createGithubOidcProvider: true })) {
      expect(b).toContain(':policy/chnet-tldcost-workload-boundary');
    }
  });

  it('a custom name is used as given', () => {
    for (const b of boundaryOf({ workloadBoundaryPolicyName: 'other-boundary' })) {
      expect(b).toContain(':policy/other-boundary"');
    }
  });

  it('empty string: no role has a boundary, everything else is unchanged', () => {
    for (const b of boundaryOf({ workloadBoundaryPolicyName: '' })) expect(b).toBeUndefined();
    const strip = (o: Record<string, unknown> = {}) => {
      const res = synthSite(o).template.toJSON().Resources as Record<
        string,
        { Type: string; Properties?: Record<string, unknown> }
      >;
      for (const r of Object.values(res)) {
        if (r.Type === 'AWS::IAM::Role') delete r.Properties?.PermissionsBoundary;
      }
      return res;
    };
    expect(strip({ workloadBoundaryPolicyName: '' })).toEqual(strip());
  });

  it('the certificate stack is not affected (no roles, no boundary)', () => {
    const assembly = createApp({
      context: { ...CDK_JSON_CONTEXT, certificateArn: TEST_CERT_ARN },
    }).app.synth();
    const cert = JSON.stringify(assembly.getStackByName('tldcost-cert').template);
    expect(cert).not.toMatch(/PermissionsBoundary|"AWS::IAM::Role"/);
  });
});

describe('alternate domains (e.g. a later tldcost.de)', () => {
  it('are added to aliases and redirect list when configured', () => {
    const { template } = synthSite({ alternateDomainNames: ['tldcost.de'] });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['tldcost.io', 'www.tldcost.io', 'tldcost.de'],
      }),
    });
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp('\\["www\\.tldcost\\.io","tldcost\\.de"\\]'),
    });
  });
});
