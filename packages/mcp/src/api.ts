// Client for the public, static tldcost JSON API (https://tldcost.io/api/v1/, site/src/lib/api.ts).
// Read only, no credentials, no personal data. Responses are cached in memory: the data changes
// about weekly, and every document carries `data_version` (a hash of the whole data set), so as
// soon as one response shows a new version, all cached documents of the old version are dropped.
// Documents of different data versions are therefore never combined.
import type { FxRates, Offer, Provider } from '@tldcost/core';

export const DEFAULT_BASE_URL = 'https://tldcost.io/api/v1';
export const USER_AGENT = 'tldcost-mcp (+https://github.com/chnet/tldcost)';
/** Cache lifetime of one document. The data changes weekly; an hour keeps answers fresh enough. */
export const DEFAULT_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

/** License block every API document carries (data/LICENSE). */
export interface ApiLicense {
  name: string;
  spdx: string;
  url: string;
  attribution: string;
}

export interface ApiMeta {
  api_version: number;
  schema_version: number;
  data_version: string;
  data_updated: string | null;
  data_oldest: string | null;
  documentation: string;
  license: ApiLicense;
}

export interface DerivedTcoMode {
  setup: number | null;
  missing: string[];
}

export interface DerivedOffer {
  currency: 'EUR';
  fx: { currency: string; date: string; per_eur: number } | null;
  vat_not_stated: boolean;
  gross: DerivedTcoMode;
  net: DerivedTcoMode;
}

export interface Derived {
  description: string;
  tco: Record<string, DerivedOffer>;
}

export interface TldsDocument extends ApiMeta {
  tlds: { tld: string; offers: number; href: string; page: string }[];
}

export interface TldDocument extends ApiMeta {
  tld: string;
  providers: Provider[];
  offers: Offer[];
  derived: Derived;
}

export interface AllDocument extends ApiMeta {
  providers: Provider[];
  offers: Offer[];
  /** ECB tables (data/fx), as the site's portfolio calculator embeds them. */
  fx: FxRates[];
  derived: Derived;
}

/** A fetched document with the URL it came from and when this client fetched it. */
export interface Fetched<T> {
  doc: T;
  url: string;
  retrieved_at: string;
}

/** The API could not be reached or answered with something unusable. */
export class ApiError extends Error {}

/** The API has no document for the path (e.g. a TLD without offers). */
export class NotFoundError extends ApiError {}

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  ttlMs?: number;
  now?: () => Date;
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private readonly cache = new Map<string, { at: number; value: Fetched<ApiMeta> }>();
  private version: string | undefined;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  tlds(): Promise<Fetched<TldsDocument>> {
    return this.get<TldsDocument>('/tlds.json');
  }

  tld(tld: string): Promise<Fetched<TldDocument>> {
    return this.get<TldDocument>(`/offers/${encodeURIComponent(tld)}.json`);
  }

  all(): Promise<Fetched<AllDocument>> {
    return this.get<AllDocument>('/all.json');
  }

  private async get<T extends ApiMeta>(path: string): Promise<Fetched<T>> {
    const now = this.now();
    const hit = this.cache.get(path);
    if (hit && now.getTime() - hit.at < this.ttlMs) return hit.value as Fetched<T>;

    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new ApiError(`tldcost API: ${(err as Error).message} (${url})`);
    }
    if (res.status === 404) throw new NotFoundError(`not found: ${url}`);
    if (!res.ok) throw new ApiError(`tldcost API: HTTP ${res.status} for ${url}`);
    let doc: T;
    try {
      doc = (await res.json()) as T;
    } catch {
      throw new ApiError(`tldcost API: no JSON at ${url}`);
    }
    if (doc?.api_version !== 1) {
      throw new ApiError(
        `tldcost API: unsupported api_version ${String(doc?.api_version)} at ${url}`,
      );
    }
    if (this.version !== doc.data_version) {
      // new data: never mix documents of different data versions. While a CDN serves both
      // versions (deploy in progress), this may flush more than once: extra requests only.
      this.cache.clear();
      this.version = doc.data_version;
    }
    const value: Fetched<T> = { doc, url, retrieved_at: now.toISOString() };
    this.cache.set(path, { at: now.getTime(), value });
    return value;
  }
}
