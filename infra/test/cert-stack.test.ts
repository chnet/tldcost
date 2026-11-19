import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { createApp } from '../lib/app.js';
import { CDK_JSON_CONTEXT, synthCert } from './helpers.js';

type Resources = Record<string, { Type: string; Properties?: Record<string, unknown> }>;

/** Logical IDs as deployed. A changed ID makes CloudFormation replace the certificate in use. */
const GEN1_ID = 'Certificate4E7ABB08';
const GEN2_ID = 'CertificateWithAlternatesADEEF19C';

describe('stack tldcost-cert', () => {
  const { template, stack } = synthCert();
  const json = JSON.stringify(template.toJSON());
  const resources = template.toJSON().Resources as Resources;

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

  it('contains ONLY ACM certificates: generation 1 and generation 2', () => {
    const types = Object.values(resources)
      .map((r) => r.Type)
      .filter((t) => t !== 'AWS::CDK::Metadata');
    expect(types).toEqual([
      'AWS::CertificateManager::Certificate',
      'AWS::CertificateManager::Certificate',
    ]);
  });

  it('generation 1 keeps its logical ID and covers apex + www only, DNS validation, no hosted zone', () => {
    const gen1 = resources[GEN1_ID];
    expect(gen1?.Type).toBe('AWS::CertificateManager::Certificate');
    expect(gen1?.Properties).toMatchObject({
      DomainName: 'tldcost.io',
      SubjectAlternativeNames: ['www.tldcost.io'],
      ValidationMethod: 'DNS',
    });
    expect(gen1?.Properties).not.toHaveProperty('DomainValidationOptions');
  });

  it('generation 2 covers apex, www and the alternate domains, DNS validation, no hosted zone', () => {
    const gen2 = resources[GEN2_ID];
    expect(gen2?.Type).toBe('AWS::CertificateManager::Certificate');
    expect(gen2?.Properties).toMatchObject({
      DomainName: 'tldcost.io',
      SubjectAlternativeNames: ['www.tldcost.io', 'tldcost.de', 'www.tldcost.de'],
      ValidationMethod: 'DNS',
    });
    expect(gen2?.Properties).not.toHaveProperty('DomainValidationOptions');
  });

  it('outputs both certificate ARNs', () => {
    template.hasOutput('CertificateArn', { Value: { Ref: GEN1_ID } });
    template.hasOutput('CertificateWithAlternatesArn', { Value: { Ref: GEN2_ID } });
  });

  it('tags with Project=CHnet and app=tldcost', () => {
    for (const tag of [
      { Key: 'Project', Value: 'CHnet' },
      { Key: 'app', Value: 'tldcost' },
    ]) {
      template.resourcePropertiesCountIs(
        'AWS::CertificateManager::Certificate',
        { Tags: Match.arrayWith([tag]) },
        2,
      );
    }
  });

  it('generation 2 follows alternateDomainNames; generation 1 never changes', () => {
    const one = synthCert({ alternateDomainNames: ['tldcost.de'] }).template;
    const oneRes = one.toJSON().Resources as Resources;
    expect(oneRes[GEN2_ID]?.Properties?.SubjectAlternativeNames).toEqual([
      'www.tldcost.io',
      'tldcost.de',
    ]);
    expect(oneRes[GEN1_ID]).toEqual(resources[GEN1_ID]);
  });

  it('without alternate domains: only generation 1, unchanged, and no generation 2 output', () => {
    const none = synthCert({ alternateDomainNames: [] }).template;
    none.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    expect((none.toJSON().Resources as Resources)[GEN1_ID]).toEqual(resources[GEN1_ID]);
    expect(Object.keys(none.findOutputs('*'))).toEqual(['CertificateArn']);
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
