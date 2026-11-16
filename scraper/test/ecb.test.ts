import { describe, expect, it } from 'vitest';
import { ECB_DAILY, fetchEcb, parseEcb } from '../src/ecb.js';
import { fixture, testHttp } from './helpers.js';

describe('ECB', () => {
  it('parses the daily feed (ECB date, units per EUR)', () => {
    const { date, rates } = parseEcb(fixture('ecb/eurofxref-daily.xml'));
    expect(date).toBe('2026-11-12');
    expect(rates.USD).toBe(1.1081);
    expect(rates.ISK).toBe(136.6);
    expect(Object.keys(rates)).toHaveLength(29);
  });
  it('rejects broken feeds', () => {
    expect(() => parseEcb('<Cube>')).toThrow(/no <Cube time/);
    expect(() => parseEcb("<Cube time='2026-11-12'><Cube currency='GBP' rate='0.8'/>")).toThrow(
      /no USD/,
    );
    expect(() => parseEcb("<Cube time='2026-11-12'><Cube currency='USD' rate='0'/>")).toThrow(
      /bad rate USD=0/,
    );
  });
  it('fetches once, after the Crawl-delay, as an fx record', async () => {
    const { http, clock, calls } = testHttp({
      'https://www.ecb.europa.eu/robots.txt': {
        body: 'User-agent: *\nDisallow: /paym/\nCrawl-delay: 5\n',
      },
      [ECB_DAILY]: { body: fixture('ecb/eurofxref-daily.xml') },
    });
    const fx = await fetchEcb(http, () => new Date('2026-11-13T06:00:00.500Z'));
    expect(fx).toMatchObject({
      schema_version: 1,
      source: 'ECB',
      date: '2026-11-12',
      base: 'EUR',
      source_url: ECB_DAILY,
      fetched_at: '2026-11-13T06:00:00Z',
    });
    expect(fx.evidence_hash).toMatch(/^sha256:/);
    expect(clock.sleeps).toEqual([5000]);
    expect(calls).toHaveLength(2);
  });
});
