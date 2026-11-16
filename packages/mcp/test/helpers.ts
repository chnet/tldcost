import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiClient } from '../src/api.js';

export const BASE = 'https://api.test/api/v1';
export const fixturePath = (p: string) => join(import.meta.dirname, 'fixtures', p);
export const fixture = <T = Record<string, unknown>>(p: string): T =>
  JSON.parse(readFileSync(fixturePath(p), 'utf8')) as T;

export interface FakeRoute {
  status?: number;
  body?: unknown;
  /** Raw body text instead of JSON. */
  text?: string;
}

/** fetch stand-in serving the fixtures under BASE (overridable per path); records every call. */
export function fakeApi(routes: Record<string, FakeRoute> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: init?.headers as Record<string, string> });
    const path = url.slice(BASE.length + 1);
    let route = routes[path];
    if (!route) {
      try {
        route = { body: fixture(path) };
      } catch {
        route = { status: 404, text: 'not found' };
      }
    }
    const text = route.text ?? JSON.stringify(route.body);
    return new Response(text, { status: route.status ?? 200 });
  }) as typeof globalThis.fetch;
  let now = new Date('2026-11-15T08:00:00Z');
  const clock = {
    now: () => now,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
  const api = new ApiClient({ baseUrl: `${BASE}/`, fetch, now: clock.now });
  return { api, calls, clock };
}
