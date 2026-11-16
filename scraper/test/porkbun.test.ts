import { describe, expect, it } from 'vitest';
import { PORKBUN_ENDPOINT, porkbun } from '../src/adapters/porkbun.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, fixture, testHttp } from './helpers.js';

const ROBOTS = { 'https://api.porkbun.com/robots.txt': { status: 404 } };
const run = (body: string, tlds: readonly string[] = MVP_TLDS) =>
  porkbun.fetch(ctxFor(testHttp({ ...ROBOTS, [PORKBUN_ENDPOINT]: { body } }).http, tlds));

describe('porkbun adapter', () => {
  it('maps the public pricing API (USD, no VAT statement, coupons ignored)', async () => {
    const result = await run(fixture('porkbun/pricing.json'));
    expect(result.notOffered).toEqual(['at', 'ch', 'berlin']);
    expect(result.skipped).toEqual([{ tld: 'ai', reason: expect.stringMatching(/multi-year/) }]);
    expect(result.failed).toEqual([]);
    expect(result.offers.map((o) => o.tld)).toHaveLength(16);
    const de = result.offers.find((o) => o.tld === 'de');
    expect(de).toMatchObject({
      currency: 'USD',
      vat_included: null,
      price: {
        unit: 'year',
        setup: 0,
        year1: 290,
        renewal: 407,
        transfer_in: 510,
      },
      evidence: {
        source_url: 'https://porkbun.com/products/domains',
        source_endpoint: PORKBUN_ENDPOINT,
        fetched_at: '2026-11-13T06:00:00Z',
        method: 'api',
        confidence: 'medium',
      },
    });
    expect(de?.evidence.evidence_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // first-year sale (registration < renewal): list price and promo are left to the stored offer
    expect(de?.price).not.toHaveProperty('year1_regular');
    expect(de).not.toHaveProperty('promo');
    expect(de?.promoRequired).toMatch(/first-year sale/);
    expect(de).not.toHaveProperty('derivedListPrice');
    // no sale: the registration price is the list price, no promo
    const com = result.offers.find((o) => o.tld === 'com');
    expect(com).toMatchObject({
      price: { year1: 1181, year1_regular: 1181, renewal: 1181 },
      promo: null,
      // the list price is taken from the registration price: run.ts checks it against the stored one
      derivedListPrice: true,
    });
    expect(result.offers).toMatchSnapshot();
  });

  it('skips special TLD types and reports unparsable prices per TLD', async () => {
    const body = JSON.stringify({
      status: 'SUCCESS',
      pricing: {
        '1': {
          registration: '1.34',
          renewal: '16.79',
          transfer: '16.79',
          specialType: 'handshake',
        },
        com: { registration: '11,81', renewal: '11.81', transfer: '11.81' },
      },
    });
    const result = await run(body, ['1', 'com']);
    expect(result.skipped).toEqual([{ tld: '1', reason: "special TLD type 'handshake'" }]);
    expect(result.failed).toEqual([
      { tld: 'com', reason: expect.stringMatching(/not a non-negative decimal/) },
    ]);
  });

  it('throws on an error response', async () => {
    await expect(run(JSON.stringify({ status: 'ERROR', message: 'x' }))).rejects.toThrow(
      /unexpected response/,
    );
    await expect(run(JSON.stringify({ status: 'SUCCESS', pricing: null }))).rejects.toThrow(
      /unexpected response/,
    );
  });
});
