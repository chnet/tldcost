# infra — CDK stacks `tldcost-cert` + `tldcost`

Static hosting for tldcost: S3 (versioned, private) + CloudFront (OAC) + ACM certificate + GitHub OIDC deploy role.
npm workspace `@tldcost/infra` in the root monorepo: one shared `package-lock.json` in the root; TypeScript, vitest and `@types/node` come from the root `devDependencies`. Typecheck runs via `tsc -b` in the root (project reference `infra`).

Bootstrap: both regions, version 32 (2026-11-13). Procedure and order of the go-live: [`docs/runbook.md`](../docs/runbook.md).

## Stacks

| Stack | Region | Content |
|---|---|---|
| `tldcost-cert` | `us-east-1` (fixed, CloudFront accepts only certificates from us-east-1) | **only** ACM certificates, DNS validation without a hosted zone. Generation 1 `Certificate`: `tldcost.io` + `www.tldcost.io`, output `CertificateArn`. Generation 2 `CertificateWithAlternates`, only when `alternateDomainNames` is set: apex, www and the alternate domains, output `CertificateWithAlternatesArn` (see [Alternate domains](#alternate-domains-bluegreen-certificate)) |
| `tldcost` | `siteRegion`, default **`eu-west-1`** (EU/Ireland) | S3 bucket, CloudFront, CloudFront Function, two response headers policies (site, API), GitHub deploy role. Imports the certificate via `-c certificateArn=…` |

The stacks are coupled only via the `certificateArn` parameter. There are no SSM cross-region references and no custom resources. Without `certificateArn`, only `tldcost-cert` is synthesized (first deploy step).

Both stacks: qualifier `tldcost`, toolkit stack `CDKToolkit-tldcost`, termination protection on, tags `Project=CHnet` / `app=tldcost`.

Not in the stacks: Route 53 zone and records, OIDC provider, Lambda functions, custom resources.

## Resources in the site stack

| Resource | Properties |
|---|---|
| S3 bucket | versioned, Block Public Access (all 4), BucketOwnerEnforced, SSE-S3, TLS ≥ 1.2 enforced, `RETAIN`. Lifecycle: old versions 90 days (at least the last 10), aborted multipart uploads 7 days. Tag `chnet:class=R` (see [Data protection](#data-protection-check)) |
| CloudFront | OAC (no OAI) via the regional bucket endpoint, so that any bucket region works. `index.html` as default root object, HTTP→HTTPS, TLSv1.2_2021, HTTP/2+3, IPv6, PriceClass_100, **no access logging** (no tracking). 403/404 → `/404.html` (404). Two behaviors with the same origin, cache policy `CachingOptimized`, GET/HEAD and function: default (site) and `api/*` (public JSON API); they differ only in the response headers policy |
| CloudFront Function | `functions/viewer-request.js`: `www.` and alternate domains → 301 to the apex domain. `/x` → 301 to `/x/` (Astro `trailingSlash: 'always'`). `/x/` → `/x/index.html` (rewrite) |
| Response Headers Policy | HSTS 2 years + includeSubDomains (without preload), CSP, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP, `Server` header removed. Fine-tune CSP/HSTS later |
| Response Headers Policy API | For `api/*`: the same security headers plus CORS `Access-Control-Allow-Origin: *`, methods only GET/HEAD, without credentials. OPTIONS is not allowed in the behavior, so preflights are not answered; simple cross-origin GETs do not need one |
| IAM role | GitHub OIDC deploy role (see below). By default the OIDC provider is **imported**, not created (exception: `createGithubOidcProvider=true`). Every role of the stack gets the permissions boundary `workloadBoundaryPolicyName` |

## Configuration (CDK context)

Defaults are in `cdk.json` or, for keys missing there, in `lib/config.ts`; overrides via `-c key=value`.

| Key | Default | Meaning |
|---|---|---|
| `account` | — | Target account. If not set, the templates are account-neutral (`AWS::AccountId`). No account ID in the code |
| `siteRegion` | `eu-west-1` | Region of the site stack. `eu-central-1` or `us-east-1` are also possible |
| `certificateArn` | — | ARN of the **ISSUED** certificate from `tldcost-cert`. It is validated: format `arn:aws:acm:us-east-1:<account>:certificate/<uuid>`, and the account must match `account` (if set) |
| `domainName` | `tldcost.io` | Canonical domain. `www.<domain>` is always added and redirects |
| `alternateDomainNames` | `[]`; `cdk.json`: `tldcost.de`, `www.tldcost.de` | Additional domains that redirect to the apex domain (aliases of the distribution, redirect list of the function, SANs of certificate generation 2). **Empty = inactive.** A change needs the blue/green certificate order in [Alternate domains](#alternate-domains-bluegreen-certificate) |
| `githubOidcSubject` | `repo:chnet@16511920/tldcost@1459607746:environment:production` | Exact `sub` claim. Only the immutable form `owner@id/repo@id` with environment is allowed |
| `githubJobWorkflowRef` | `chnet/tldcost/.github/workflows/deploy.yml@refs/heads/main` | Exact `job_workflow_ref` claim. Only `@refs/heads/main` is allowed |
| `createGithubOidcProvider` | `false` | `true`: the site stack creates the GitHub OIDC provider itself (`AWS::IAM::OIDCProvider`, without Lambda, `DeletionPolicy: Retain`). Only for an account **without** a provider and without an organization SCP that forbids creating it (move to a different AWS account). `-c …=true\|false` or boolean in `cdk.json` |
| `workloadBoundaryPolicyName` | `chnet-tldcost-workload-boundary` | Name of an existing customer-managed IAM policy with path `/` in the target account (the ARN is built as `arn:<partition>:iam::<account>:policy/<name>`). The site stack sets it as permissions boundary on **all** of its IAM roles (`tldcost-cert` has none). Empty (`-c workloadBoundaryPolicyName=`) = no boundary, for accounts without that policy. The policy is not created by this app: before the first deploy with a boundary it must exist and allow the deploy role's actions (S3 sync of the site bucket, CloudFront invalidation) |
| `attachDomainNames` | `true` | `false`: the distribution gets no alternate domain names and is reachable only at `<id>.cloudfront.net`. Certificate, redirects and headers remain. For the move to a different AWS account |

## Commands

```bash
npm ci              # in the repo root (installs all workspaces)
cd infra
npm test            # CDK assertions (vitest), both stacks
npm run build       # tsc -b (typecheck only; declarations to infra/dist, gitignored)
npm run synth       # only tldcost-cert
npx cdk synth -c certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000000   # both stacks (example ARN)
```

`cdk synth` needs no AWS credentials.

## Data protection check

`scripts/check-data-protection.mjs` (repo root) checks every data resource of the synthesized templates
against the data-class rules of the backup concept: the same check as in the organisation's
infrastructure repository (backup rollout step B3b), adapted here. Every data resource is class **P**
(must be backed up: Retain, versioning or PITR, deletion protection, tag `chnet:class=P`, …) unless
[`config/data-protection-allowlist.ts`](config/data-protection-allowlist.ts) lists it as **R**
(rebuildable from the repository or a build) or **E** (ephemeral), each with a reason. Tag convention
on the resources: `chnet:class=P|R|E`; an R/E resource without its class tag (or with another one) is a
gap. `PROPERTY_EXEMPTIONS` lets one class-P resource skip a single rule (today only PITR), with a reason.

- **Gaps are report only:** printed, exit 0; `--strict` (later rollout step) makes them fail.
  **Integrity findings always fail** (allowlist hygiene: an entry without a reason, a dead entry, an
  unpinned or changed TTL or replace baseline, a class-P secret without a recovery entry), in the CLI
  and in `npm test`.
- **Every synth:** `test/data-protection.test.ts` synthesizes each context variant (`SYNTHS`: only the
  certificate stack; the site stack; with `createGithubOidcProvider=true`; with `attachDomainNames=false`;
  without permissions boundary) in `npm test` (CI `validate`) and prints the report. A new switch in
  `lib/config.ts` (`bool` or `optionalName`) without a variant fails that test.
- **On a `cdk.out`** (repo root): synthesize both stacks first. Plain `npm run synth -w infra` gives
  only `tldcost-cert`, and the allowlist entry of stack `tldcost` is then reported as a dead entry
  (exit 1); pass `--partial` for such a run.

  ```bash
  npm run synth -w infra -- -c certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000000
  npm run check:data-protection
  ```
- Today the only data resource is the site bucket: class R, because every deploy rebuilds it from
  `site/` and `data/` in git.

## Bootstrap (operator, local, after IAM review)

Both regions with the same options:

```bash
npx cdk bootstrap aws://<account>/us-east-1 --qualifier tldcost --toolkit-stack-name CDKToolkit-tldcost --profile <profile>
npx cdk bootstrap aws://<account>/eu-west-1 --qualifier tldcost --toolkit-stack-name CDKToolkit-tldcost --profile <profile>
```

- `--toolkit-stack-name CDKToolkit-tldcost` is mandatory. Without a custom name, the bootstrap would overwrite the account's existing `CDKToolkit` stack. `cdk.json` already sets `toolkitStackName`.
- Without `--cloudformation-execution-policies`, the CloudFormation execution role gets `AdministratorAccess`. That is why infra deploys run only locally, by the operator, never from CI.
- With a different `siteRegion`, bootstrap that region instead of eu-west-1.

## GitHub OIDC deploy role (site stack)

Trust (all `StringEquals`, no wildcards):

- `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com`
- `token.actions.githubusercontent.com:sub` = `repo:chnet@16511920/tldcost@1459607746:environment:production`
- `token.actions.githubusercontent.com:job_workflow_ref` = `chnet/tldcost/.github/workflows/deploy.yml@refs/heads/main`

**Repository created anew:** a new repository gets a new repository ID, even under the same owner and name. Before the first deploy from it, the operator:

1. **Immutable subject:** checks `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`. It must show `"use_immutable_subject": true` (this repository today: `"use_default": true` and `"use_immutable_subject": true`). Whether that comes from an organization default or is set per repository cannot be read without `admin:org`. If it is `false`, enable it for the new repository (repository settings → Actions → OIDC, or `PUT` on the same endpoint). Otherwise the `sub` claim is name-based (`repo:<owner>/<repo>:…`), `lib/config.ts` rejects it, and the trust cannot match.
2. **Environment:** creates the environment `production` again, with the branch policy that allows only `main`; the `sub` claim ends in `:environment:production`.
3. **Context and trust:** sets `githubOidcSubject` to the new claim (`repo:<owner>@<owner-id>/<repo>@<new-repo-id>:environment:production`). `githubJobWorkflowRef` is built from owner and repository *names*: it changes only if one of them changes. Then the operator updates the trust of the deploy role with a stack deploy of `tldcost` (local).

Until then, every deploy from the new repository fails at `sts:AssumeRoleWithWebIdentity`.

**Create the provider (`createGithubOidcProvider`)**, only when moving to an account without a provider:

- **Organization SCP:** If an SCP of the organization forbids `iam:CreateOpenIDConnectProvider` for the CloudFormation execution role (`cdk-tldcost-cfn-exec-role-…`), `true` fails at deploy time. In such accounts, the operator creates the provider **beforehand** via SSO, and the stack runs with `createGithubOidcProvider=false` (import, default):
  ```bash
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com --profile <profile>
  ```
  The flag remains for accounts without this SCP. The trust of the role is identical in both cases.

- In the new account, pass `-c createGithubOidcProvider=true` on **every** deploy of `tldcost`. If the flag is forgotten, CloudFormation removes the provider from the stack. Because of `Retain`, it continues to exist under the same ARN, and the role keeps working: its trust always references the provider by ARN, byte-identical in both modes. A later `true` then fails with `EntityAlreadyExists`: in this account, continue without the flag from then on.
- **Never** set it in an account that already has the provider (e.g. via a CICD stack). The deploy fails with `EntityAlreadyExists`. Check: `aws iam list-open-id-connect-providers --profile <profile>`.
- `ThumbprintList` is intentionally missing: it is optional in CloudFormation, and IAM determines the CA's thumbprint itself.

Requirements for the later workflow:
- The deploy job is defined **directly in `.github/workflows/deploy.yml`**, not in a reusable workflow. With a reusable workflow, `job_workflow_ref` changes, and the role refuses to be assumed.
- The job needs `environment: production` and `permissions: id-token: write`.
- The environment `production` gets a branch policy that allows only `main` (operator step in the repo settings).

Permissions (complete list, site content only):

| Sid | Action | Resource |
|---|---|---|
| `ListSiteBucket` | `s3:ListBucket` | site bucket (exact ARN) |
| `WriteSiteObjects` | `s3:PutObject`, `s3:DeleteObject` | `<site bucket ARN>/*` |
| `InvalidateDistribution` | `cloudfront:CreateInvalidation` | the distribution (exact ARN) |

No `sts:AssumeRole` on the bootstrap roles `cdk-tldcost-*`. CI deploys only site content (S3 sync + invalidation).

Prerequisite: the OIDC provider `token.actions.githubusercontent.com` exists in the target account (from the account's CICD stack).

## DNS

The zone `tldcost.io` is a **Route 53 hosted zone in a separate domains account**, maintained via PR in the operator's zone repository. The NS are switched to it at the registrar (runbook step 2, option B). These stacks create no DNS records. All records are added as literal values via PR in the zone repository:

| When | Record | Value |
|---|---|---|
| after the deploy of `tldcost-cert` has started | 2 × CNAME `_<hash>.tldcost.io.`, `_<hash>.www.tldcost.io.` | `_<hash>.<…>.acm-validations.aws.` (from `aws acm describe-certificate`) |
| after the deploy of `tldcost` | `tldcost.io` A + AAAA, **ALIAS** | Output `DistributionDomainName`, alias zone `Z2FDTNDATAQYW2` (CloudFront) |
| after the deploy of `tldcost` | `www.tldcost.io` A + AAAA, ALIAS | same as above |

The zone `tldcost.de` lives in the same domains account and is maintained the same way. It exists before the registration, because the .de registry checks the name servers first:

| When | Record | Value |
|---|---|---|
| with the zone | `tldcost.de` CAA | `0 issue "amazon.com"` and `0 issuewild "amazon.com"` (as for `tldcost.io`) |
| after the deploy of `tldcost-cert` with generation 2 has started | 2 × CNAME `_<hash>.tldcost.de.`, `_<hash>.www.tldcost.de.` | from `aws acm describe-certificate` of generation 2. The CNAMEs of `tldcost.io` and `www.tldcost.io` are the same for both generations |
| after the deploy of `tldcost` with generation 2 | `tldcost.de` and `www.tldcost.de` A + AAAA, ALIAS | Output `DistributionDomainName`, alias zone `Z2FDTNDATAQYW2` |

Because the zone is in Route 53, an ALIAS to CloudFront is valid at the apex as well. The validation CNAMEs stay in place permanently, so that ACM can renew the certificate automatically.

Commands and order: [`docs/runbook.md`](../docs/runbook.md).

## Alternate domains (blue/green certificate)

The distribution can use only one certificate. A certificate whose names change is replaced by CloudFormation, and the old one cannot be deleted during the cleanup while CloudFront still uses it. Therefore generation 1 (`tldcost.io`, `www.tldcost.io`) is pinned and never changes, and generation 2 with all names is created next to it:

1. `alternateDomainNames` in `cdk.json`, merged by PR.
2. Deploy `tldcost-cert`: adds generation 2 and waits until it is ISSUED (validation CNAMEs of the new domains, see [DNS](#dns)). Generation 1 stays as it is.
3. Deploy `tldcost` with `-c certificateArn=<CertificateWithAlternatesArn>`: the distribution gets the new aliases and generation 2.
4. Alias records of the new domains.
5. Later, by a separate change: remove generation 1 once no distribution uses it. A later change of `alternateDomainNames` then replaces the only certificate and needs the same blue/green order again.

Rollback until step 5: deploy `tldcost` with the generation 1 ARN and `-c 'alternateDomainNames=[]'`. Between steps 1 and 3, deploy `tldcost` only as step 3: with the generation 1 ARN the new aliases are not covered and CloudFormation rolls the update back.

## Rollback

Primary: `git revert` of the faulty commit on `main`, then a normal deploy via the workflow. Re-runs of old workflow runs are possible for only 30 days and are therefore not the standard path. Emergency alternative: the bucket is versioned (old versions 90 days, at least the last 10). See the runbook.

## Notes for the review

- The CSP is a starting value (`script-src 'self' 'unsafe-inline'` because of Astro inline scripts). Tighten it later.
- HSTS without `preload`, because that is hard to undo.
- The site stack in eu-west-1 keeps the bucket and the role in the EU (data protection). The certificate is a pure configuration object in us-east-1. CloudFront is a global service.
