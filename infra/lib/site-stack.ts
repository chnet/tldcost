import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  Annotations,
  Aws,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  Tags,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_iam as iam,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { type SiteConfig, siteHostNames } from './config.js';

export const BOOTSTRAP_QUALIFIER = 'tldcost';

/**
 * CSP of the static Astro site, from content-security-policy.json (the e2e static server sends the
 * same header). Scripts and styles from 'self' only: the build has no inline <script>/<style> and
 * no style attributes (site/integrations/externalize-inline.mjs, checked by site/tests/check-build.mjs).
 */
export const DEFAULT_CONTENT_SECURITY_POLICY = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('./content-security-policy.json', import.meta.url)), 'utf8'),
  ) as string[]
).join('; ');

const FUNCTION_SOURCE = fileURLToPath(new URL('../functions/viewer-request.js', import.meta.url));

/** Renders the CloudFront Function source with the canonical host and the hosts that redirect to it. */
export function renderViewerRequestFunction(
  canonicalHost: string,
  redirectHosts: string[],
): string {
  const substitutions: Array<[string, string]> = [
    [
      "var CANONICAL_HOST = '__CANONICAL_HOST__';",
      `var CANONICAL_HOST = ${JSON.stringify(canonicalHost)};`,
    ],
    [
      'var REDIRECT_HOSTS = __REDIRECT_HOSTS__;',
      `var REDIRECT_HOSTS = ${JSON.stringify(redirectHosts)};`,
    ],
  ];
  let src = readFileSync(FUNCTION_SOURCE, 'utf8');
  for (const [placeholder, value] of substitutions) {
    if (src.split(placeholder).length !== 2)
      throw new Error(`viewer-request.js: expected exactly one "${placeholder}"`);
    src = src.replace(placeholder, value);
  }
  if (/var (CANONICAL_HOST|REDIRECT_HOSTS) = '?__/.test(src))
    throw new Error('viewer-request.js: unresolved placeholder');
  return src;
}

export interface TldcostSiteStackProps extends StackProps {
  /** config.certificateArn must be set (ISSUED certificate from stack tldcost-cert). */
  readonly config: SiteConfig;
}

/**
 * Stack tldcost (site region, default eu-west-1): S3 + CloudFront (OAC) + GitHub deploy role.
 * The certificate is imported by ARN from tldcost-cert (us-east-1): no SSM cross-region references,
 * no custom resources. No Route 53: alias records go into a PR in the zone repo.
 */
export class TldcostSiteStack extends Stack {
  constructor(scope: Construct, id: string, props: TldcostSiteStackProps) {
    super(scope, id, props);
    const { config } = props;
    if (!config.certificateArn) throw new Error('TldcostSiteStack requires config.certificateArn');
    // Permissions boundary on every IAM role of this stack (CDK aspect, also roles added later).
    // The policy is not created here: it must exist in the target account under this name.
    if (config.workloadBoundaryPolicyName) {
      iam.PermissionsBoundary.of(this).apply(
        iam.ManagedPolicy.fromManagedPolicyName(
          this,
          'WorkloadBoundary',
          config.workloadBoundaryPolicyName,
        ),
      );
    }
    const hosts = siteHostNames(config);

    // --- S3: private, versioned (rollback = previous build), only reachable via CloudFront OAC.
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'expire-old-builds',
          noncurrentVersionExpiration: Duration.days(90),
          noncurrentVersionsToRetain: 10,
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
    });
    // data class (tag convention chnet:class=P|R|E): R = rebuilt from the repository by every deploy;
    // listed in config/data-protection-allowlist.ts for scripts/check-data-protection.mjs
    Tags.of(bucket).add('chnet:class', 'R');

    // --- Certificate from tldcost-cert (us-east-1), imported by ARN. It stays on the distribution
    // also with attachDomainNames=false, so the cutover only has to add the domain names.
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      config.certificateArn,
    );

    // --- CloudFront
    const viewerRequestFn = new cloudfront.Function(this, 'ViewerRequestFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'tldcost: www/alternate -> apex, /x -> /x/ (301), /x/ -> /x/index.html',
      code: cloudfront.FunctionCode.fromInline(
        renderViewerRequestFunction(hosts.apex, hosts.redirectHosts),
      ),
    });

    const securityHeadersBehavior: cloudfront.ResponseSecurityHeadersBehavior = {
      strictTransportSecurity: {
        accessControlMaxAge: Duration.days(730),
        includeSubdomains: true,
        preload: false,
        override: true,
      },
      contentTypeOptions: { override: true },
      frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
      referrerPolicy: {
        referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        override: true,
      },
      xssProtection: { protection: false, override: true },
      contentSecurityPolicy: {
        contentSecurityPolicy: DEFAULT_CONTENT_SECURITY_POLICY,
        override: true,
      },
    };
    const customHeadersBehavior: cloudfront.ResponseCustomHeadersBehavior = {
      customHeaders: [
        {
          header: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          override: true,
        },
        { header: 'Cross-Origin-Opener-Policy', value: 'same-origin', override: true },
      ],
    };

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'tldcost security headers',
      securityHeadersBehavior,
      customHeadersBehavior,
      removeHeaders: ['Server'],
    });

    // Public JSON API (/api/v1/*.json): same security headers plus CORS for any origin, read-only.
    // A behavior takes exactly one response headers policy, hence a second policy with both parts.
    // Only GET/HEAD: the behavior does not allow OPTIONS, so no preflight is answered; simple
    // cross-origin GETs (fetch without custom headers) need none. No credentials with '*'.
    const apiHeaders = new cloudfront.ResponseHeadersPolicy(this, 'ApiHeaders', {
      comment: 'tldcost API: security headers + CORS *',
      securityHeadersBehavior,
      customHeadersBehavior,
      removeHeaders: ['Server'],
      corsBehavior: {
        accessControlAllowOrigins: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD'],
        accessControlAllowHeaders: ['*'],
        accessControlAllowCredentials: false,
        originOverride: true,
      },
    });

    // Shared by the default and the api/* behavior; they differ only in the response headers policy.
    // One origin object, so both behaviors use the same origin and the same OAC.
    const siteBehavior: Omit<cloudfront.BehaviorOptions, 'responseHeadersPolicy'> = {
      // OAC origin uses the bucket's regional domain name, so the bucket may live in any region.
      origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      compress: true,
      functionAssociations: [
        { function: viewerRequestFn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
      ],
    };

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'tldcost static site',
      // attachDomainNames=false (account move): no alternate domain names, the distribution serves only
      // <id>.cloudfront.net. A CloudFront alternate domain name can be attached to only one
      // distribution in all of AWS. Certificate, redirects and headers stay unchanged.
      domainNames: config.attachDomainNames ? hosts.all : undefined,
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
      enableLogging: false, // no tracking by design (README: no tracking)
      defaultRootObject: 'index.html',
      defaultBehavior: { ...siteBehavior, responseHeadersPolicy: securityHeaders },
      additionalBehaviors: {
        'api/*': { ...siteBehavior, responseHeadersPolicy: apiHeaders },
      },
      // S3 via OAC answers 403 for missing keys (no ListBucket for CloudFront) -> serve 404 page.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 404,
        responsePagePath: '/404.html',
        ttl: Duration.minutes(5),
      })),
    });

    if (!config.attachDomainNames) {
      // CDK warns about a certificate without domain names; here that is the intended interim state.
      Annotations.of(distribution).acknowledgeWarning(
        '@aws-cdk/aws-cloudfront:emptyDomainNames',
        'attachDomainNames=false: domain names are attached at the cutover of the account move',
      );
    }

    // --- GitHub OIDC deploy role (site content only: S3 sync + invalidation).
    // The trust always names the provider by its constructed ARN (one provider per URL and account).
    // Default: the provider exists already (CICD stack). With createGithubOidcProvider=true the stack
    // creates it as an extra resource (below); the trust policy stays byte-identical.
    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubOidc',
      `arn:${Aws.PARTITION}:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      description: `tldcost deploy from GitHub Actions (${config.githubOidcSubject})`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.OpenIdConnectPrincipal(oidcProvider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': config.githubOidcSubject,
          'token.actions.githubusercontent.com:job_workflow_ref': config.githubJobWorkflowRef,
        },
      }),
    });

    // createGithubOidcProvider=true (new dedicated account without a provider): plain CfnOIDCProvider,
    // not the L2 OpenIdConnectProvider (that one deploys a custom-resource Lambda). ThumbprintList is
    // optional in CloudFormation: without it IAM determines the CA thumbprint itself.
    // RETAIN (DeletionPolicy + UpdateReplacePolicy): a later deploy that forgets the flag only drops
    // the provider from the stack; it keeps existing under the same ARN and the role keeps working.
    // Setting the flag again then fails with EntityAlreadyExists, so in that account stay without it.
    if (config.createGithubOidcProvider) {
      const provider = new iam.CfnOIDCProvider(this, 'GithubOidcProvider', {
        url: 'https://token.actions.githubusercontent.com',
        clientIdList: ['sts.amazonaws.com'],
      });
      provider.applyRemovalPolicy(RemovalPolicy.RETAIN);
      deployRole.node.addDependency(provider); // provider before the role that trusts it
    }

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ListSiteBucket',
        actions: ['s3:ListBucket'],
        resources: [bucket.bucketArn],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteSiteObjects',
        actions: ['s3:PutObject', 's3:DeleteObject'],
        resources: [bucket.arnForObjects('*')],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvalidateDistribution',
        actions: ['cloudfront:CreateInvalidation'],
        resources: [distribution.distributionArn],
      }),
    );
    // Intentionally no sts:AssumeRole on cdk-tldcost-* bootstrap roles: the CloudFormation execution role is
    // admin by default, so infra deploys (`cdk deploy`) run locally by the owner, never from CI.

    // --- Outputs (values for the zone-repo PR and the deploy workflow)
    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: config.attachDomainNames
        ? `Alias target (A/AAAA ALIAS, zone Z2FDTNDATAQYW2) for ${hosts.all.join(', ')}`
        : 'No domain names attached (attachDomainNames=false): only this cloudfront.net name serves the site',
    });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'SiteBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'GithubDeployRoleArn', { value: deployRole.roleArn });
  }
}
