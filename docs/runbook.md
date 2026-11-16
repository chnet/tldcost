# Runbook tldcost — infrastructure and go-live

Applies to the CDK stacks in [`infra/`](../infra/README.md): `tldcost-cert` (us-east-1) and `tldcost` (site, default eu-west-1).
All infra deploys (`cdk bootstrap`, `cdk deploy`) run **locally, by the operator**, and never from CI. CI deploys only site content.

Placeholders: `<account>` = target account of the site, `<profile>` = local AWS profile for it. The DNS zone `tldcost.io` lives in a separate domains account and is maintained via PR in **the operator's zone repository**.

## Rules for every step

- Run each step on its own and **only after approval by the operator**.
- Keep the order. A step counts as done only when its check is green.

## Prerequisites

- [ ] IAM review of the current state completed
- [ ] OIDC provider `token.actions.githubusercontent.com` exists in the target account
- [ ] GitHub environment `production` with a branch policy that allows only `main`

## Go-live procedure

### 1. Bootstrap

Both regions (us-east-1 and eu-west-1) with qualifier `tldcost` and toolkit stack `CDKToolkit-tldcost`, bootstrap version 32. Run again only for a later update:

```bash
npm ci        # in the repo root
cd infra
npx cdk bootstrap aws://<account>/us-east-1 --qualifier tldcost --toolkit-stack-name CDKToolkit-tldcost --profile <profile>
npx cdk bootstrap aws://<account>/eu-west-1 --qualifier tldcost --toolkit-stack-name CDKToolkit-tldcost --profile <profile>
```

Check (both regions, expected `32`):

```bash
aws ssm get-parameter --name /cdk-bootstrap/tldcost/version --region us-east-1 --profile <profile> --query Parameter.Value --output text
aws ssm get-parameter --name /cdk-bootstrap/tldcost/version --region eu-west-1 --profile <profile> --query Parameter.Value --output text
```

### 2. NS switch (option B)

Switch the name servers of `tldcost.io` at the registrar to the Route 53 hosted zone `tldcost.io` **before** the certificate is requested. ACM validates only if the validation CNAMEs are in the zone that is currently authoritative.

Until step 6, the zone contains no A/AAAA records for `tldcost.io` and `www.tldcost.io`. **The site stays dark until the alias PR.** This is intentional for option B, because there is no web presence before that.

Beforehand, check at the current DNS provider whether it has records that must stay (e.g. MX or TXT). Carry these over via PR in the operator's zone repository before the NS are switched.

Check without the resolver cache (a normal `dig NS` can still show the old NS until the TTL expires):

```bash
# Delegation directly at the .io registry (expected: the four ns-….awsdns-… of the Route 53 zone)
dig +norec +noall +authority NS tldcost.io @a0.nic.io

# The Route 53 zone answers authoritatively (expected: flag aa, SOA with awsdns-hostmaster.amazon.com)
R53_NS=<one of the zone's four Route 53 NS, e.g. ns-123.awsdns-45.com>
dig +norec SOA tldcost.io @"$R53_NS"
```

`R53_NS` is needed again in 3c.

### 3. Certificate stack, CNAME PR, ISSUED

**3a. Deploy the certificate stack**

```bash
npx cdk deploy tldcost-cert -c account=<account> --profile <profile>
```

CloudFormation creates the certificate and **waits** until ACM has validated it. The terminal stays open during this time. Run 3b and 3c in parallel in a second terminal.

**3b. Read the validation CNAMEs from `describe-certificate`**

Take the certificate ARN from the stack, not from `list-certificates`: there can be several certificates for `tldcost.io` there (e.g. leftovers of an earlier attempt, or for an alternate domain). This already works while the stack is still `CREATE_IN_PROGRESS`. If the result is empty or `None`, the certificate has not been created yet: wait briefly and repeat.

```bash
ARN=$(aws cloudformation describe-stack-resources --stack-name tldcost-cert --region us-east-1 --profile <profile> \
  --query "StackResources[?ResourceType=='AWS::CertificateManager::Certificate'].PhysicalResourceId | [0]" --output text)
aws acm describe-certificate --certificate-arn "$ARN" --region us-east-1 --profile <profile> \
  --query 'Certificate.DomainValidationOptions[].[DomainName,ResourceRecord.Name,ResourceRecord.Type,ResourceRecord.Value]' --output table
```

This returns two CNAMEs (for `tldcost.io` and `www.tldcost.io`).

**3c. CNAME PR in the operator's zone repository**

Add the two CNAMEs as literal values via PR in the operator's zone repository and merge it. They stay in place permanently, so that ACM can renew the certificate automatically.

Check directly at the Route 53 zone (expected for each name: the ACM value `_….acm-validations.aws.`):

```bash
dig +norec +short CNAME <ResourceRecord.Name from 3b> @"$R53_NS"
```

**3d. Wait for ISSUED**

```bash
aws acm describe-certificate --certificate-arn "$ARN" --region us-east-1 --profile <profile> \
  --query 'Certificate.Status' --output text      # expected: ISSUED
```

After that, `cdk deploy tldcost-cert` completes successfully. If it times out before that and rolls back: first check the records (check from 3c), then repeat 3a.

### 4. Site stack with `-c certificateArn`

`SITE_REGION` is the region of the site stack: `siteRegion` from `cdk.json` (default `eu-west-1`). If you use a different region, use it everywhere.

```bash
SITE_REGION=eu-west-1
CERT_ARN=$(aws cloudformation describe-stacks --stack-name tldcost-cert --region us-east-1 --profile <profile> \
  --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue" --output text)
npx cdk deploy tldcost -c account=<account> -c siteRegion="$SITE_REGION" -c certificateArn="$CERT_ARN" --profile <profile>
```

Check (expected: `CREATE_COMPLETE`) and read the outputs:

```bash
aws cloudformation describe-stacks --stack-name tldcost --region "$SITE_REGION" --profile <profile> \
  --query 'Stacks[0].StackStatus' --output text
aws cloudformation describe-stacks --stack-name tldcost --region "$SITE_REGION" --profile <profile> \
  --query 'Stacks[0].Outputs' --output table
```

### 5. Outputs as environment secrets and variables of `production`

The three identifiers are **secrets**, because the Actions log prints every step's env and inputs and never masks variables (Archiv-Issue 132). Only the region is a variable:

| Name | Kind | Value |
|---|---|---|
| `DEPLOY_ROLE_ARN` | secret | Output `GithubDeployRoleArn` |
| `SITE_BUCKET` | secret | Output `SiteBucketName` |
| `DISTRIBUTION_ID` | secret | Output `DistributionId` |
| `AWS_REGION` | variable | `SITE_REGION` from step 4 (region of the site stack) |

For example with `gh secret set DEPLOY_ROLE_ARN --env production --repo chnet/tldcost` (the value is read from the prompt, not from argv), the same for `SITE_BUCKET` and `DISTRIBUTION_ID`, and `gh variable set AWS_REGION --env production --repo chnet/tldcost --body '<SITE_REGION>'`.

Transition: `deploy.yml` reads `secrets.X || vars.X`, so an environment that still has the three values as variables keeps deploying, but those values then show in the first step's log. Once the secrets are set, delete the three variables.

Check (expected: three secrets by name, and the variable `AWS_REGION`):

```bash
gh secret list --env production --repo chnet/tldcost
gh variable list --env production --repo chnet/tldcost
```

Both jobs are defined **directly** in `.github/workflows/deploy.yml` (no reusable workflow, otherwise `job_workflow_ref` no longer matches). The job `build` (`contents: read`, no environment) runs `npm ci` and the site build and uploads `site/dist` as an artifact of the run (1 day). The job `deploy` has `environment: production` and only `permissions: id-token: write`; it downloads that artifact and runs only the sync and the invalidation, so no dependency code runs while the OIDC token exists. If a value is missing or malformed, `deploy` aborts with an error message before any AWS call.

### 6. Alias PR

A and AAAA records as ALIAS via PR in the operator's zone repository:

| Name | Type | Target |
|---|---|---|
| `tldcost.io` | A + AAAA (ALIAS) | Output `DistributionDomainName`, hosted zone `Z2FDTNDATAQYW2` |
| `www.tldcost.io` | A + AAAA (ALIAS) | Output `DistributionDomainName`, hosted zone `Z2FDTNDATAQYW2` |

From the merge on, the domain resolves to CloudFront. Until the first deploy, however, the bucket is empty, so the apex domain still responds with an error (403 or 404).

Check: `dig A tldcost.io +short` returns CloudFront addresses, and `curl -sI https://www.tldcost.io/x` returns 301 to `https://tldcost.io/x/`.

### 7. First deploy — only after approval of the legal notice (Impressum) and the privacy policy (Datenschutzerklärung)

The first run of `deploy.yml` starts only after the operator has approved the legal notice and the privacy policy.

```bash
gh workflow run deploy.yml --repo chnet/tldcost --ref main
```

For now, the only trigger is `workflow_dispatch`. Check: `curl -sI https://tldcost.io/` returns 200. A push trigger comes only after the first successful deploy, in a separate PR.

## Rollback

### Site content

1. **Standard: `git revert` + new deploy.** Revert the faulty commit on `main` via PR. Then start the **Deploy** workflow manually via `workflow_dispatch` on `main` (Actions → Deploy → Run workflow, or `gh workflow run deploy.yml --repo chnet/tldcost --ref main`). As long as `deploy.yml` has no push trigger, the merge does not trigger a deploy. Re-runs of old workflow runs are possible for only 30 days and are therefore not the standard path.

2. **Emergency, only by the operator:** Restore objects directly in the bucket, for example the placeholder or previous object versions from the versioned bucket. **Only the operator** can do this, with their own **SSO profile of the site account**. CI and other automated processes have no access to it.

   Old versions are kept for 90 days (at least the last 10). List the versions and copy the one you want as the new current version:
   ```bash
   aws s3api list-object-versions --bucket <bucket> --prefix <key> --region <SITE_REGION> --profile <SSO profile of the site account>
   aws s3api copy-object --bucket <bucket> --key <key> --copy-source '<bucket>/<key>?versionId=<id>' \
     --region <SITE_REGION> --profile <SSO profile of the site account>
   ```
   Alternatively, upload single files, e.g. the placeholder, with `aws s3 cp <file> s3://<bucket>/<key> --profile <SSO profile of the site account>`.

   Then invalidate:
   ```bash
   aws cloudfront create-invalidation --distribution-id <DistributionId> --paths '/*' --profile <SSO profile of the site account>
   ```
   Afterwards, bring the repo up to date via `git revert`, so that the repo and the bucket match again.

### Infrastructure

**Revert an infra change:** Revert the commit in `infra/` and run `cdk deploy` locally (step 3a or 4), after approval by the operator.

## Later: alternate domain (e.g. tldcost.de)

`-c alternateDomainNames=tldcost.de` on **both** stacks. This replaces the certificate: new CNAMEs (step 3b/3c), wait for ISSUED, then deploy the site stack with the new ARN. After that, add the alias records for the new domain in its zone.
During the cert deploy, the old certificate is still attached to CloudFront, so CloudFormation cannot delete it during cleanup. After the site deploy, check the old certificate in ACM and delete it by hand.
