import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { createApp } from '../lib/app.js';
import { CDK_JSON_CONTEXT, synthCert } from './helpers.js';

describe('stack tldcost-cert', () => {
  const { template, stack } = synthCert();
  const json = JSON.stringify(template.toJSON());

  it('is named tldcost-cert, lives in us-east-1, termination protection on, account-neutral', () => {
    expect(stack.stackName).toBe('tldcost-cert');
    expect(stack.region).toBe('us-east-1');
    expect(stack.terminationProtection).toBe(true);
    expect(json).not.toMatch(/\d{12}/);
  });

  it('uses the tldcost bootstrap qualifier', () => {
    const assembly = createApp({ context: CDK_JSON_CONTEXT }).app.synth();
    expect(assembly.getStackArtifact('tldcost-cert').assumeRoleArn).toContain(
      'cdk-tldcost-deploy-role-',
    );
  });

  it('contains ONLY the ACM certificate', () => {
    const types = Object.values(template.toJSON().Resources as Record<string, { Type: string }>)
      .map((r) => r.Type)
      .filter((t) => t !== 'AWS::CDK::Metadata');
    expect(types).toEqual(['AWS::CertificateManager::Certificate']);
  });

  it('certificate covers apex + www with DNS validation and no hosted zone', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'tldcost.io',
      SubjectAlternativeNames: ['www.tldcost.io'],
      ValidationMethod: 'DNS',
      DomainValidationOptions: Match.absent(),
    });
  });

  it('outputs the certificate ARN', () => {
    template.hasOutput('CertificateArn', {
      Value: { Ref: Match.stringLikeRegexp('^Certificate') },
    });
  });

  it('tags with Project=CHnet and app=tldcost', () => {
    for (const tag of [
      { Key: 'Project', Value: 'CHnet' },
      { Key: 'app', Value: 'tldcost' },
    ]) {
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        Tags: Match.arrayWith([tag]),
      });
    }
  });

  it('adds alternate domains as SANs only when configured', () => {
    const { template: t } = synthCert({ alternateDomainNames: ['tldcost.de'] });
    t.hasResourceProperties('AWS::CertificateManager::Certificate', {
      SubjectAlternativeNames: ['www.tldcost.io', 'tldcost.de'],
    });
  });

  it('stays in us-east-1 regardless of siteRegion', () => {
    expect(synthCert({ siteRegion: 'eu-central-1' }).stack.region).toBe('us-east-1');
  });
});

describe('app without certificateArn (first deploy step)', () => {
  it('synthesizes only tldcost-cert', () => {
    const { app, siteStack } = createApp({ context: CDK_JSON_CONTEXT });
    expect(siteStack).toBeUndefined();
    expect(app.synth().stacks.map((s) => s.stackName)).toEqual(['tldcost-cert']);
  });
});
