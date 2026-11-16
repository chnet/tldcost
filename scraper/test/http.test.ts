import { describe, expect, it } from 'vitest';
import { assertUserAgent, HttpClient, HttpError, productToken, retryAfterMs } from '../src/http.js';
import { fakeFetch, testHttp, UA } from './helpers.js';

const ROBOTS_OK = { body: 'User-agent: *\nDisallow: /private\n' };

describe('user agent', () => {
  it('accepts name/version (+https url) and extracts the product token', () => {
    expect(() => assertUserAgent(UA)).not.toThrow();
    expect(productToken(UA)).toBe('tldcost-bot');
  });
  it('rejects e-mail addresses and free-form strings', () => {
    expect(() => assertUserAgent('tldcost-bot/1 (+https://x.example/a@b)')).toThrow(/e-mail/);
    expect(() => assertUserAgent('tldcost-bot/1 (mailto:someone@example.org)')).toThrow(
      /look like/,
    );
    expect(() => assertUserAgent('Mozilla/5.0')).toThrow(/look like/);
    expect(() => new HttpClient({ userAgent: 'x' })).toThrow(TypeError);
  });
});

describe('HttpClient', () => {
  it('fetches robots.txt once per host, sends the UA and paces requests 1/s', async () => {
    const { http, calls, clock } = testHttp({
      'https://a.example/robots.txt': ROBOTS_OK,
      'https://a.example/one': { body: 'one', headers: { 'content-type': 'text/plain' } },
      'https://a.example/two': { body: 'two' },
    });
    const one = await http.get('https://a.example/one');
    const two = await http.get('https://a.example/two', 'application/json');
    expect(one).toMatchObject({
      status: 200,
      text: 'one',
      contentType: 'text/plain',
      url: 'https://a.example/one',
    });
    expect(two.contentType).toBe('');
    expect(calls.map((c) => c.url)).toEqual([
      'https://a.example/robots.txt',
      'https://a.example/one',
      'https://a.example/two',
    ]);
    expect(calls[2]?.headers).toEqual({ 'user-agent': UA, accept: 'application/json' });
    expect(clock.sleeps).toEqual([1000, 1000]);
    expect(http.requestCount).toBe(3);
  });

  it('serialises concurrent requests to one host', async () => {
    const { http, clock } = testHttp({ 'https://a.example/robots.txt': ROBOTS_OK });
    const results = await Promise.allSettled([
      http.get('https://a.example/x'),
      http.get('https://a.example/y'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']); // both 404
    expect(clock.sleeps).toEqual([1000, 1000]);
  });

  it('honours Crawl-delay as the gap', async () => {
    const { http, clock } = testHttp({
      'https://ecb.example/robots.txt': { body: 'User-agent: *\nCrawl-delay: 5\n' },
      'https://ecb.example/feed': { body: 'ok' },
    });
    await http.get('https://ecb.example/feed');
    expect(clock.sleeps).toEqual([5000]);
  });

  it('robots.txt: 404 allows all, 5xx and network errors disallow all', async () => {
    const logs: string[] = [];
    const { http } = testHttp(
      {
        'https://open.example/robots.txt': { status: 404 },
        'https://open.example/x': { body: 'x' },
        'https://down.example/robots.txt': { status: 500 },
        'https://gone.example/robots.txt': new Error('ECONNREFUSED'),
      },
      { log: (m) => logs.push(m) },
    );
    await expect(http.get('https://open.example/x')).resolves.toMatchObject({ text: 'x' });
    await expect(http.get('https://down.example/x')).rejects.toThrow('disallowed by robots.txt');
    await expect(http.get('https://gone.example/x')).rejects.toThrow('disallowed by robots.txt');
    expect(logs[0]).toMatch(/unreachable \(ECONNREFUSED\)/);
  });

  it('refuses disallowed paths and non-https URLs without sending them', async () => {
    const { http, calls } = testHttp({ 'https://a.example/robots.txt': ROBOTS_OK });
    await expect(http.get('https://a.example/private/x?y=1')).rejects.toBeInstanceOf(HttpError);
    await expect(http.get('http://a.example/x')).rejects.toThrow('only https');
    expect(calls.map((c) => c.url)).toEqual(['https://a.example/robots.txt']);
  });

  it('throws HttpError with the status on non-2xx', async () => {
    const { http } = testHttp({
      'https://a.example/robots.txt': ROBOTS_OK,
      'https://a.example/x': { status: 410 },
    });
    const err = await http.get('https://a.example/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 410, url: 'https://a.example/x', message: 'HTTP 410' });
  });

  it('follows redirects, checking robots.txt of the target host', async () => {
    const { http, calls } = testHttp({
      'https://a.example/robots.txt': ROBOTS_OK,
      'https://a.example/old': { status: 301, headers: { location: 'https://b.example/new' } },
      'https://b.example/robots.txt': { body: 'User-agent: *\nDisallow: /blocked\n' },
      'https://b.example/new': { status: 302, headers: { location: '/blocked' } },
    });
    await expect(http.get('https://a.example/old')).rejects.toThrow('disallowed by robots.txt');
    expect(calls.map((c) => c.url)).toEqual([
      'https://a.example/robots.txt',
      'https://a.example/old',
      'https://b.example/robots.txt',
      'https://b.example/new',
    ]);
  });

  it('gives up after maxRedirects; a 3xx without Location is an error', async () => {
    const { http } = testHttp(
      {
        'https://a.example/robots.txt': ROBOTS_OK,
        'https://a.example/loop': { status: 302, headers: { location: '/loop' } },
        'https://a.example/nolocation': { status: 300 },
      },
      { maxRedirects: 1 },
    );
    await expect(http.get('https://a.example/loop')).rejects.toThrow('too many redirects');
    await expect(http.get('https://a.example/nolocation')).rejects.toThrow('HTTP 300');
  });

  it('retries 429/503 after Retry-After (seconds or date), then succeeds', async () => {
    const logs: string[] = [];
    const { http, clock } = testHttp(
      {
        'https://a.example/robots.txt': ROBOTS_OK,
        'https://a.example/x': [
          { status: 429, headers: { 'retry-after': '7' } },
          {
            status: 503,
            headers: { 'retry-after': new Date(1_000_000 + 3000 + 7000 + 60_000).toUTCString() },
          },
          { body: 'ok' },
        ],
      },
      { log: (m) => logs.push(m) },
    );
    await expect(http.get('https://a.example/x')).resolves.toMatchObject({ text: 'ok' });
    expect(clock.sleeps[0]).toBe(1000);
    expect(clock.sleeps[1]).toBe(7000);
    expect(clock.sleeps[2]).toBeGreaterThan(50_000);
    expect(logs).toHaveLength(2);
  });

  it('uses a growing default backoff without Retry-After and stops after maxRetries', async () => {
    const { http, clock } = testHttp({
      'https://a.example/robots.txt': ROBOTS_OK,
      'https://a.example/x': { status: 503, headers: { 'retry-after': 'soon' } },
    });
    await expect(http.get('https://a.example/x')).rejects.toMatchObject({ status: 503 });
    expect(clock.sleeps).toEqual([1000, 5000, 10000]);
  });

  it('gives up when Retry-After is longer than maxRetryAfterMs', async () => {
    const { http } = testHttp({
      'https://a.example/robots.txt': ROBOTS_OK,
      'https://a.example/x': { status: 429, headers: { 'retry-after': '3600' } },
    });
    await expect(http.get('https://a.example/x')).rejects.toThrow(/too long/);
  });

  it('works with the defaults (real clock, global fetch stand-in)', async () => {
    const { fetch } = fakeFetch({
      'https://a.example/robots.txt': { status: 404 },
      'https://a.example/x': { body: 'x' },
    });
    const http = new HttpClient({ userAgent: UA, fetch, minIntervalMs: 0 });
    await expect(http.get('https://a.example/x')).resolves.toMatchObject({ text: 'x' });
    const original = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      const viaGlobal = new HttpClient({ userAgent: UA, minIntervalMs: 1 });
      await viaGlobal.get('https://a.example/x');
      await expect(viaGlobal.get('https://a.example/x')).resolves.toMatchObject({ text: 'x' });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('retryAfterMs', () => {
  it('parses delta-seconds and HTTP dates', () => {
    expect(retryAfterMs(null, 0)).toBeUndefined();
    expect(retryAfterMs('12', 0)).toBe(12_000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:00:10 GMT', 4000)).toBe(6000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:00:01 GMT', 4000)).toBe(0);
    expect(retryAfterMs('later', 0)).toBeUndefined();
  });
});
