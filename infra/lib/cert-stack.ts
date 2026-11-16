import { CfnOutput, Stack, type StackProps, aws_certificatemanager as acm } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { type SiteConfig, siteHostNames } from './config.js';

export interface TldcostCertStackProps extends StackProps {
  readonly config: SiteConfig;
}

/**
 * Stack tldcost-cert (always us-east-1): ONLY the ACM certificate for CloudFront.
 * DNS validation without a hosted zone: the validation CNAMEs go into the tldcost.io zone (separate
 * domains account) via a PR in the zone repo. CloudFormation waits until the certificate is ISSUED.
 */
export class TldcostCertStack extends Stack {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: TldcostCertStackProps) {
    super(scope, id, props);
    const hosts = siteHostNames(props.config);

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: hosts.apex,
      subjectAlternativeNames: hosts.redirectHosts,
      validation: acm.CertificateValidation.fromDns(),
    });

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description:
        'Pass to the site stack as -c certificateArn=... once ISSUED. Validation CNAMEs: ' +
        "aws acm describe-certificate --region us-east-1 --query 'Certificate.DomainValidationOptions[].ResourceRecord'",
    });
  }
}
