import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient, type HttpOptions } from '../src/http.js';

export const UA = 'tldcost-bot/0.0.0 (+https://tldcost.io/methodik/)';
export const fixture = (p: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', p), 'utf8');

export interface Route {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}
export type Routes = Record<string, Route | Route[] | Error>;

/** fetch stand-in: exact URL -> response (an array is consumed in order). Unknown URLs: 404. */
export function fakeFetch(routes: Routes) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: init?.headers as Record<string, string> });
    let route = routes[url];
    if (route instanceof Error) throw route;
    if (Array.isArray(route)) route = route.length > 1 ? route.shift() : route[0];
    const r = route ?? { status: 404, body: 'not found' };
    // bytes, not a string: a string body would add a default content-type
    return new Response(new TextEncoder().encode(r.body ?? ''), {
      status: r.status ?? 200,
      headers: r.headers ?? {},
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** HttpClient on a fake fetch and a virtual clock (sleep advances it, nothing really waits). */
export function testHttp(routes: Routes, opts: Partial<HttpOptions> = {}) {
  const { fetch, calls } = fakeFetch(routes);
  const clock = { now: 1_000_000, sleeps: [] as number[] };
  const http = new HttpClient({
    userAgent: UA,
    fetch,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.sleeps.push(ms);
      clock.now += ms;
    },
    ...opts,
  });
  return { http, calls, clock };
}

export const ctxFor = (
  http: HttpClient,
  tlds: readonly string[],
  now = '2026-11-13T06:00:00Z',
) => ({
  http,
  tlds,
  now: () => new Date(now),
  log: () => {},
});
