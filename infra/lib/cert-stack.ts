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
  /** Generation 2: apex + www + alternate domains. Only present when alternateDomainNames is set. */
  public readonly alternateCertificate?: acm.Certificate;

  constructor(scope: Construct, id: string, props: TldcostCertStackProps) {
    super(scope, id, props);
    const hosts = siteHostNames(props.config);

    // Generation 1: apex + www only, pinned. A change of alternateDomainNames must never replace the
    // certificate the distribution is using (a replaced certificate that is still in use cannot be
    // deleted during the stack cleanup).
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: hosts.apex,
      subjectAlternativeNames: [hosts.wwwDomain],
      validation: acm.CertificateValidation.fromDns(),
    });

    // Generation 2 (blue/green): created next to generation 1 when alternate domains are configured.
    // The site stack switches to it via -c certificateArn=...; rollback = generation 1 ARN.
    // Generation 1 is removed in a later change, once no distribution uses it.
    if (props.config.alternateDomainNames.length > 0) {
      this.alternateCertificate = new acm.Certificate(this, 'CertificateWithAlternates', {
        domainName: hosts.apex,
        subjectAlternativeNames: hosts.redirectHosts,
        validation: acm.CertificateValidation.fromDns(),
      });
      new CfnOutput(this, 'CertificateWithAlternatesArn', {
        value: this.alternateCertificate.certificateArn,
        description:
          'Certificate incl. alternate domains: pass to the site stack as -c certificateArn=... once ISSUED',
      });
    }

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description:
        'Pass to the site stack as -c certificateArn=... once ISSUED. Validation CNAMEs: ' +
        "aws acm describe-certificate --region us-east-1 --query 'Certificate.DomainValidationOptions[].ResourceRecord'",
    });
  }
}
