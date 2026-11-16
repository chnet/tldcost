import { describe, expect, it } from 'vitest';
import { INWX_CSV, INWX_ENDPOINT, inwx } from '../src/adapters/inwx.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, fixture, testHttp, type Routes } from './helpers.js';

const ROBOTS = { 'https://www.inwx.de/robots.txt': { body: 'User-Agent: *\nDisallow:  \n' } };
const run = (routes: Routes, tlds: readonly string[] = MVP_TLDS, now?: string) =>
  inwx.fetch(ctxFor(testHttp({ ...ROBOTS, ...routes }).http, tlds, now));
const json = (tlds: unknown[]) => ({ [INWX_ENDPOINT]: { body: JSON.stringify({ tlds }) } });
const entry = (extra: object) => ({
  tld: 'test',
  currency: 'EUR',
  createPrice: 10,
  renewalPrice: 12,
  transferPrice: 12,
  createPeriod: 1,
  renewalPeriod: 1,
  transferPeriod: 1,
  ...extra,
});
const promo = (extra: object) => ({
  currency: 'EUR',
  limitedNumber: 0,
  period: '1Y',
  createPrice: 2.1,
  startTime: { scalar: '2026-11-01T00:00:00+00:00' },
  endTime: { scalar: '2026-11-14T23:59:59+00:00' },
  ...extra,
});

describe('inwx adapter (JSON)', () => {
  it('maps net prices, active promos and skips multi-year periods', async () => {
    const result = await run({ [INWX_ENDPOINT]: { body: fixture('inwx/all-prices.json') } });
    expect(result.warnings).toEqual([]);
    expect(result.notOffered).toEqual([]);
    expect(result.skipped).toEqual([
      { tld: 'ai', reason: expect.stringMatching(/period 2\/2 years/) },
    ]);
    expect(result.offers).toHaveLength(19);
    const io = result.offers.find((o) => o.tld === 'io');
    expect(io).toMatchObject({
      currency: 'EUR',
      vat_included: false,
      price: { year1: 2689, year1_regular: 6950, renewal: 6950, transfer_in: 6950 },
      promo: { conditions: null, valid_until: '2026-12-31' },
      evidence: { method: 'api', confidence: 'high', source_endpoint: INWX_ENDPOINT },
    });
    const de = result.offers.find((o) => o.tld === 'de');
    expect(de).toMatchObject({
      price: { year1: 502, year1_regular: 502, renewal: 391 },
      promo: null,
    });
    expect(result.offers.find((o) => o.tld === 'at')?.price.transfer_in).toBe(0);
    expect(result.offers).toMatchSnapshot();
  });

  it('applies a promo only between start and end', async () => {
    const routes = json([entry({ tld: 'biz', promo: promo({}) })]);
    const during = await run(routes, ['biz'], '2026-11-14T12:00:00Z');
    expect(during.offers[0]).toMatchObject({
      price: { year1: 210, year1_regular: 1000 },
      promo: { valid_until: '2026-11-14' },
    });
    const after = await run(routes, ['biz'], '2026-11-15T00:00:00Z');
    expect(after.offers[0]).toMatchObject({ price: { year1: 1000 }, promo: null });
    const before = await run(routes, ['biz'], '2026-10-31T23:59:59Z');
    expect(before.offers[0]?.promo).toBeNull();
  });

  it('notes limited promos and ignores promos it cannot map', async () => {
    const limited = await run(
      json([entry({ tld: 'a', promo: promo({ limitedNumber: 500 }) })]),
      ['a'],
      '2026-11-05T00:00:00Z',
    );
    expect(limited.offers[0]?.promo).toEqual({
      conditions: 'limitiert auf 500 Domains',
      valid_until: '2026-11-14',
    });
    const odd = await run(
      json([entry({ tld: 'b', promo: promo({ period: '2Y' }) })]),
      ['b'],
      '2026-11-05T00:00:00Z',
    );
    expect(odd.offers[0]).toMatchObject({ price: { year1: 1000 }, promo: null });
    expect(odd.warnings).toEqual(['.b: promo ignored (currency EUR, period 2Y)']);
  });

  it('reports foreign currencies, multi-year transfers and missing TLDs', async () => {
    const result = await run(
      json([entry({ tld: 'usd', currency: 'USD' }), entry({ tld: 'tr', transferPeriod: 2 })]),
      ['usd', 'tr', 'none'],
    );
    expect(result.failed).toEqual([{ tld: 'usd', reason: 'unexpected currency USD' }]);
    expect(result.offers[0]?.price.transfer_in).toBeNull();
    expect(result.notOffered).toEqual(['none']);
  });

  it('rounds four-decimal net prices half up', async () => {
    const result = await run(
      json([entry({ tld: 'r', createPrice: 26.8908, renewalPrice: 4.1933 })]),
      ['r'],
    );
    expect(result.offers[0]?.price).toMatchObject({ year1: 2689, renewal: 419 });
  });
});

describe('inwx adapter (CSV fallback)', () => {
  const csv = { [INWX_CSV]: { body: fixture('inwx/pricelist.csv') } };

  it('falls back to the CSV when the JSON breaks, and says so', async () => {
    for (const broken of [
      { [INWX_ENDPOINT]: { status: 500 } },
      { [INWX_ENDPOINT]: { body: '{"tlds":[]}' } },
      { [INWX_ENDPOINT]: { body: '{"tlds":[{"tld":"de","createPrice":"5"}]}' } },
      { [INWX_ENDPOINT]: { body: '<html>' } },
    ]) {
      const result = await run({ ...broken, ...csv });
      expect(result.warnings[0]).toMatch(/^JSON source failed .* used CSV fallback/);
      expect(result.offers).toHaveLength(19);
    }
  });

  it('writes CSV rows only when registration = renewal (provably regular), blocks the rest', async () => {
    const result = await run({ [INWX_ENDPOINT]: { status: 500 }, ...csv });
    expect(result.skipped).toEqual([
      { tld: 'ai', reason: expect.stringMatching(/period 2\/2 years/) },
    ]);
    const io = result.offers.find((o) => o.tld === 'io');
    expect(io).toMatchObject({
      price: { year1: 2689, renewal: 6950 },
      blocked: 'CSV fallback: registration price may be an unmarked promo (fail closed)',
    });
    expect(result.warnings).toContain(
      '.io: CSV registration 26.89 != renewal 69.50, may be a promo: offer kept as stored',
    );
    const com = result.offers.find((o) => o.tld === 'com');
    expect(com).toMatchObject({
      vat_included: false,
      price: { year1: 1550, year1_regular: 1550, renewal: 1550, transfer_in: 1550 },
      promo: null,
      evidence: { source_endpoint: INWX_CSV, confidence: 'medium' },
    });
    expect(com).not.toHaveProperty('blocked');
    expect(result.offers).toMatchSnapshot();
  });

  it('handles odd rows and refuses an unknown header', async () => {
    const header = fixture('inwx/pricelist.csv').split('\n')[0];
    const body = `\uFEFF${header}\r\n"x";"abc";"1";"1.00";"1";"1.00";"1"\r\n"y";"1.00";"1";"3.00";"2";"1.00";"1"\r\n`;
    const result = await run({ [INWX_ENDPOINT]: { status: 500 }, [INWX_CSV]: { body } }, [
      'x',
      'y',
      'z',
    ]);
    expect(result.failed).toEqual([
      { tld: 'x', reason: expect.stringMatching(/not a non-negative decimal/) },
    ]);
    expect(result.offers[0]?.price.transfer_in).toBeNull();
    expect(result.notOffered).toEqual(['z']);
    await expect(
      run({ [INWX_ENDPOINT]: { status: 500 }, [INWX_CSV]: { body: '"tld";"price"\n' } }),
    ).rejects.toThrow(/unexpected header/);
    await expect(
      run({ [INWX_ENDPOINT]: { status: 500 }, [INWX_CSV]: { body: '' } }),
    ).rejects.toThrow(/unexpected header/);
  });
});
