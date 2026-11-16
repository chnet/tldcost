import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  DEFAULT_BASE_URL,
  DEFAULT_TTL_MS,
  NotFoundError,
  USER_AGENT,
} from '../src/api.js';
import { BASE, fakeApi, fixture } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiClient', () => {
  it('fetches API documents with the tldcost-mcp User-Agent and no personal data', async () => {
    const { api, calls } = fakeApi();
    const f = await api.tlds();
    expect(f.url).toBe(`${BASE}/tlds.json`);
    expect(f.retrieved_at).toBe('2026-11-15T08:00:00.000Z');
    expect(f.doc.api_version).toBe(1);
    expect(calls).toEqual([
      {
        url: `${BASE}/tlds.json`,
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      },
    ]);
    expect(USER_AGENT).toBe('tldcost-mcp (+https://github.com/chnet/tldcost)');
    await api.tld('de');
    await api.all();
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/tlds.json`,
      `${BASE}/offers/de.json`,
      `${BASE}/all.json`,
    ]);
  });

  it('caches documents for the TTL', async () => {
    const { api, calls, clock } = fakeApi();
    await api.tld('de');
    clock.advance(DEFAULT_TTL_MS - 1);
    await api.tld('de');
    expect(calls).toHaveLength(1);
    clock.advance(1);
    await api.tld('de');
    expect(calls).toHaveLength(2);
  });

  it('drops all cached documents when the data version changes', async () => {
    const de = fixture('offers/de.json');
    const newer = { ...fixture('tlds.json'), data_version: 'sha256:new' };
    const { api, calls } = fakeApi({ 'tlds.json': { body: newer } });
    await api.tld('de');
    await api.tld('de');
    expect(calls).toHaveLength(1);
    // tlds.json reports another data version: the cached de document is of the old data
    await api.tlds();
    await api.tld('de');
    expect(calls).toHaveLength(3);
    expect(de.data_version).not.toBe('sha256:new');
  });

  it('reports a missing document, HTTP errors, non-JSON and unknown API versions', async () => {
    const { api } = fakeApi({
      'offers/xyz.json': { status: 500, text: 'oops' },
      'offers/io.json': { text: '<html>' },
      'offers/me.json': { body: { api_version: 2 } },
      'offers/at.json': { body: null },
    });
    await expect(api.tld('zz')).rejects.toBeInstanceOf(NotFoundError);
    await expect(api.tld('xyz')).rejects.toThrow(`HTTP 500 for ${BASE}/offers/xyz.json`);
    await expect(api.tld('io')).rejects.toThrow('no JSON');
    await expect(api.tld('me')).rejects.toThrow('unsupported api_version 2');
    await expect(api.tld('at')).rejects.toThrow('unsupported api_version undefined');
  });

  it('defaults to tldcost.io and the global fetch', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(fixture('tlds.json'))));
    vi.stubGlobal('fetch', fetch);
    const api = new ApiClient();
    expect(api.baseUrl).toBe(DEFAULT_BASE_URL);
    const f = await api.tlds();
    expect(f.url).toBe('https://tldcost.io/api/v1/tlds.json');
    expect(Date.parse(f.retrieved_at)).not.toBeNaN();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
