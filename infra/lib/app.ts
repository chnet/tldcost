import { App, type AppProps, DefaultStackSynthesizer, Tags } from 'aws-cdk-lib';
import { CERTIFICATE_REGION, readConfig } from './config.js';
import { TldcostCertStack } from './cert-stack.js';
import { BOOTSTRAP_QUALIFIER, TldcostSiteStack } from './site-stack.js';

export interface TldcostApp {
  app: App;
  certStack: TldcostCertStack;
  /** Only present when `-c certificateArn=...` is given (certificate ISSUED). */
  siteStack?: TldcostSiteStack;
}

/**
 * Builds the CDK app exactly as `cdk synth` does (bin/tldcost.ts); tests use the same entry point.
 *
 * Deploy order: tldcost-cert (us-east-1) -> validation CNAMEs via a PR in the zone repo -> ISSUED
 * -> tldcost (site region) with -c certificateArn=... -> alias records via a PR in the zone repo.
 * Account move (stacks into another AWS account): createGithubOidcProvider and attachDomainNames.
 */
export function createApp(props?: AppProps): TldcostApp {
  const app = new App(props);
  const config = readConfig(app.node);

  // account undefined => account-neutral templates (AWS::AccountId).
  const certStack = new TldcostCertStack(app, 'tldcost-cert', {
    stackName: 'tldcost-cert',
    description:
      'tldcost: ACM certificate for CloudFront (us-east-1, DNS validation via chnet.domains)',
    env: { account: config.account, region: CERTIFICATE_REGION },
    synthesizer: new DefaultStackSynthesizer({ qualifier: BOOTSTRAP_QUALIFIER }),
    terminationProtection: true,
    config,
  });

  let siteStack: TldcostSiteStack | undefined;
  if (config.certificateArn) {
    siteStack = new TldcostSiteStack(app, 'tldcost', {
      stackName: 'tldcost',
      description:
        'tldcost static site: S3 (versioned) + CloudFront (OAC) + GitHub OIDC deploy role',
      env: { account: config.account, region: config.siteRegion },
      synthesizer: new DefaultStackSynthesizer({ qualifier: BOOTSTRAP_QUALIFIER }),
      terminationProtection: true,
      config,
    });
  } else {
    process.stderr.write(
      '[tldcost] no -c certificateArn=... given: only stack tldcost-cert is synthesized. ' +
        'Site stack tldcost needs the ISSUED certificate ARN (see infra/README.md).\n',
    );
  }

  Tags.of(app).add('Project', 'CHnet');
  Tags.of(app).add('app', 'tldcost');

  return { app, certStack, siteStack };
}
