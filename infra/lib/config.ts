/**
 * Reads and validates the deployment configuration from CDK context (cdk.json or `-c key=value`).
 * Nothing account-specific is hardcoded: the account comes from `-c account=...` or stays
 * unresolved (template uses AWS::AccountId), so the synthesized templates are account-neutral.
 */

/** CloudFront only accepts ACM certificates from us-east-1, so the certificate stack always lives there. */
export const CERTIFICATE_REGION = 'us-east-1';

/** Default customer-managed policy used as permissions boundary for every IAM role of the site stack. */
export const DEFAULT_WORKLOAD_BOUNDARY_POLICY = 'chnet-tldcost-workload-boundary';

export interface SiteConfig {
  /** Target AWS account. Undefined = account-neutral templates (AWS::AccountId). */
  readonly account?: string;
  /** Region of the site stack (S3 bucket, IAM role, CloudFront control plane). Default eu-west-1 (EU/Ireland, where the CHnet resources live). */
  readonly siteRegion: string;
  /** Canonical apex domain, e.g. tldcost.io. www.<domain> is always added and redirects to it. */
  readonly domainName: string;
  /** Additional domains (e.g. a later tldcost.de) that also redirect to the apex. Empty by default. */
  readonly alternateDomainNames: string[];
  /**
   * ARN of the ISSUED certificate from stack tldcost-cert (us-east-1), passed as `-c certificateArn=...`.
   * Undefined = only the certificate stack is synthesized (first deploy step).
   */
  readonly certificateArn?: string;
  /** Exact `sub` claim the GitHub deploy role trusts (StringEquals, no wildcards). */
  readonly githubOidcSubject: string;
  /** Exact `job_workflow_ref` claim (StringEquals): the only workflow file + ref allowed to assume the role. */
  readonly githubJobWorkflowRef: string;
  /**
   * true = the site stack creates the GitHub OIDC provider itself (plain AWS::IAM::OIDCProvider, for an
   * account without one, e.g. a new dedicated account). false (default) = import the existing provider
   * by ARN. There is only one provider per URL and account, so never set true where one exists.
   * Also false where an organisation SCP denies iam:CreateOpenIDConnectProvider to the CloudFormation
   * execution role: there the owner creates the provider beforehand and the stack imports it.
   */
  readonly createGithubOidcProvider: boolean;
  /**
   * true (default) = the distribution serves the apex/www/alternate names with the certificate.
   * false = no alternate domain names, the certificate stays: only <id>.cloudfront.net. Needed for an
   * account move, because a CloudFront alternate domain name can be attached to only one distribution
   * in all of AWS: the old distribution must drop it before the new one can take it.
   */
  readonly attachDomainNames: boolean;
  /**
   * Name of an existing customer-managed IAM policy in the target account that the site stack sets as
   * permissions boundary on all of its IAM roles. Default DEFAULT_WORKLOAD_BOUNDARY_POLICY; an empty
   * string (`-c workloadBoundaryPolicyName=`) = no boundary, for accounts without that policy.
   */
  readonly workloadBoundaryPolicyName?: string;
}

export interface ContextReader {
  tryGetContext(key: string): unknown;
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ACCOUNT_RE = /^\d{12}$/;
const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
/** IAM policy name: 1-128 characters of [A-Za-z0-9+=,.@_-]. */
const POLICY_NAME_RE = /^[\w+=,.@-]{1,128}$/;
const CERT_ARN_RE =
  /^arn:aws:acm:us-east-1:(\d{12}):certificate\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function str(ctx: ContextReader, key: string): string | undefined {
  const v = ctx.tryGetContext(key);
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new Error(`context "${key}" must be a string`);
  return v.trim();
}

function list(ctx: ContextReader, key: string): string[] {
  const v = ctx.tryGetContext(key);
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v))
    return v
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) return list({ tryGetContext: () => JSON.parse(s) as unknown }, key);
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  throw new Error(`context "${key}" must be a list or a comma-separated string`);
}

/** Boolean from cdk.json (true/false) or `-c key=true|false`; anything else is an error. */
function bool(ctx: ContextReader, key: string, fallback: boolean): boolean {
  const v = ctx.tryGetContext(key);
  if (v === undefined || v === null || v === '') return fallback;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  throw new Error(`context "${key}" must be true or false`);
}

/**
 * Optional name: missing = fallback, empty string = switched off (undefined), otherwise the trimmed
 * string. Unlike str(), an explicit empty value does not fall back to the default.
 */
function optionalName(ctx: ContextReader, key: string, fallback: string): string | undefined {
  const v = ctx.tryGetContext(key);
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'string') throw new Error(`context "${key}" must be a string`);
  const s = v.trim();
  return s === '' ? undefined : s;
}

export function readConfig(ctx: ContextReader): SiteConfig {
  const account = str(ctx, 'account');
  if (account !== undefined && !ACCOUNT_RE.test(account)) {
    throw new Error(`context "account" must be a 12-digit AWS account ID`);
  }

  const siteRegion = str(ctx, 'siteRegion') ?? 'eu-west-1';
  if (!REGION_RE.test(siteRegion))
    throw new Error(`context "siteRegion" is not a valid AWS region: "${siteRegion}"`);

  const domainName = (str(ctx, 'domainName') ?? '').toLowerCase();
  if (!DOMAIN_RE.test(domainName))
    throw new Error(`context "domainName" is not a valid domain: "${domainName}"`);

  const alternateDomainNames = list(ctx, 'alternateDomainNames').map((d) => d.toLowerCase());
  for (const d of alternateDomainNames) {
    if (!DOMAIN_RE.test(d)) throw new Error(`alternate domain is not a valid domain: "${d}"`);
    if (d === domainName || d === `www.${domainName}`) {
      throw new Error(`alternate domain "${d}" duplicates the primary domain or its www host`);
    }
  }
  if (new Set(alternateDomainNames).size !== alternateDomainNames.length) {
    throw new Error('alternateDomainNames contains duplicates');
  }

  const certificateArn = str(ctx, 'certificateArn');
  if (certificateArn !== undefined) {
    const m = CERT_ARN_RE.exec(certificateArn);
    if (!m) {
      throw new Error(
        `context "certificateArn" must be an ACM certificate ARN in ${CERTIFICATE_REGION} ` +
          `(arn:aws:acm:us-east-1:<account>:certificate/<uuid>), got "${certificateArn}"`,
      );
    }
    if (account !== undefined && m[1] !== account) {
      throw new Error(
        `certificateArn belongs to account ${m[1]}, but context "account" is ${account}`,
      );
    }
  }

  const githubOidcSubject = str(ctx, 'githubOidcSubject') ?? '';
  // Immutable form only (owner@id/repo@id), bound to an environment; rejects repo:<owner>/<repo>:... (IAM review).
  if (!/^repo:[^/@*?:]+@\d+\/[^/@*?:]+@\d+:environment:[^*?:]+$/.test(githubOidcSubject)) {
    throw new Error(
      'context "githubOidcSubject" must be an exact, immutable, environment-bound subject ' +
        '(repo:<owner>@<owner-id>/<repo>@<repo-id>:environment:<name>, no wildcards)',
    );
  }

  const githubJobWorkflowRef = str(ctx, 'githubJobWorkflowRef') ?? '';
  // Only workflows on main (no other branches, no refs/tags/*) (IAM review).
  if (
    !/^[^/@*?\s]+\/[^/@*?\s]+\/\.github\/workflows\/[^/@*?\s]+\.ya?ml@refs\/heads\/main$/.test(
      githubJobWorkflowRef,
    )
  ) {
    throw new Error(
      'context "githubJobWorkflowRef" must be an exact workflow ref on main ' +
        '(<owner>/<repo>/.github/workflows/<file>.yml@refs/heads/main, no wildcards)',
    );
  }

  const workloadBoundaryPolicyName = optionalName(
    ctx,
    'workloadBoundaryPolicyName',
    DEFAULT_WORKLOAD_BOUNDARY_POLICY,
  );
  if (
    workloadBoundaryPolicyName !== undefined &&
    !POLICY_NAME_RE.test(workloadBoundaryPolicyName)
  ) {
    throw new Error(
      `context "workloadBoundaryPolicyName" is not a valid IAM policy name: "${workloadBoundaryPolicyName}"`,
    );
  }

  return {
    account,
    siteRegion,
    domainName,
    alternateDomainNames,
    certificateArn,
    githubOidcSubject,
    githubJobWorkflowRef,
    createGithubOidcProvider: bool(ctx, 'createGithubOidcProvider', false),
    attachDomainNames: bool(ctx, 'attachDomainNames', true),
    workloadBoundaryPolicyName,
  };
}

/** All host names served by the distribution and covered by the certificate. Apex first. */
export function siteHostNames(config: Pick<SiteConfig, 'domainName' | 'alternateDomainNames'>) {
  const wwwDomain = `www.${config.domainName}`;
  const redirectHosts = [wwwDomain, ...config.alternateDomainNames];
  return {
    apex: config.domainName,
    wwwDomain,
    redirectHosts,
    all: [config.domainName, ...redirectHosts],
  };
}
