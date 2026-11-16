// The only way adapters reach the network. Per host: robots.txt first (cached for the run), then
// requests strictly one after another with at least max(minIntervalMs, Crawl-delay) between them.
// No cookies, no credentials, a fixed User-Agent, a timeout, and a bounded backoff on 429/503.
import { ALLOW_ALL, DISALLOW_ALL, parseRobots, type Robots } from './robots.js';

export interface HttpResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  contentType: string;
  /** Raw body: evidence_hash is computed over these bytes. */
  bytes: Uint8Array;
  /** Body decoded as UTF-8. */
  text: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpOptions {
  userAgent: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds clock, injectable for tests. */
  now?: () => number;
  /** Minimum gap between two requests to one host (default 1000 = 1 req/s). */
  minIntervalMs?: number;
  timeoutMs?: number;
  /** Retries after a 429/503 (default 2). */
  maxRetries?: number;
  /** Longest Retry-After we are willing to wait (default 120 s); longer gives up. */
  maxRetryAfterMs?: number;
  maxRedirects?: number;
  log?: (message: string) => void;
}

/** "tldcost-bot/0.1.0 (+https://…)" -> "tldcost-bot". */
export function productToken(userAgent: string): string {
  return userAgent.split(/[/\s]/, 1)[0] as string;
}

/** A User-Agent must name the bot and a project URL, never a (personal) e-mail address. */
export function assertUserAgent(userAgent: string): void {
  if (!/^[A-Za-z0-9._-]+\/\S+ \(\+https:\/\/[^\s)]+\)$/.test(userAgent)) {
    throw new TypeError(`User-Agent must look like "name/version (+https://project-url)"`);
  }
  if (userAgent.includes('@')) throw new TypeError('User-Agent must not contain an e-mail address');
}

interface HostState {
  robots?: Promise<Robots>;
  /** Tail of this host's request queue. */
  queue: Promise<unknown>;
  lastRequestAt: number;
  crawlDelayMs: number;
}

const sleepReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  readonly userAgent: string;
  private readonly hosts = new Map<string, HostState>();
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxRetryAfterMs: number;
  private readonly maxRedirects: number;
  private readonly log: (message: string) => void;
  /** Requests sent in this run (robots.txt included), for the run report. */
  requestCount = 0;

  constructor(opts: HttpOptions) {
    assertUserAgent(opts.userAgent);
    this.userAgent = opts.userAgent;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.sleep = opts.sleep ?? sleepReal;
    this.now = opts.now ?? Date.now;
    this.minIntervalMs = opts.minIntervalMs ?? 1000;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.maxRetryAfterMs = opts.maxRetryAfterMs ?? 120_000;
    this.maxRedirects = opts.maxRedirects ?? 3;
    this.log = opts.log ?? (() => {});
  }

  /** GET `url` (https only) after robots.txt allows it; throws HttpError unless the final status is 2xx. */
  async get(url: string, accept = '*/*'): Promise<HttpResponse> {
    let current = new URL(url);
    for (let hop = 0; ; hop++) {
      if (current.protocol !== 'https:')
        throw new HttpError('only https URLs are fetched', current.href);
      const robots = await this.robotsFor(current);
      if (!robots.isAllowed(current.pathname + current.search)) {
        throw new HttpError('disallowed by robots.txt', current.href);
      }
      const res = await this.request(current, accept);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop >= this.maxRedirects)
          throw new HttpError('too many redirects', current.href, res.status);
        current = new URL(location, current);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (res.status < 200 || res.status > 299) {
        throw new HttpError(`HTTP ${res.status}`, current.href, res.status);
      }
      return {
        url: current.href,
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        bytes,
        text: new TextDecoder('utf-8').decode(bytes),
      };
    }
  }

  private host(url: URL): HostState {
    let state = this.hosts.get(url.host);
    if (!state) {
      state = { queue: Promise.resolve(), lastRequestAt: -Infinity, crawlDelayMs: 0 };
      this.hosts.set(url.host, state);
    }
    return state;
  }

  /** RFC 9309: 2xx parse, 4xx (incl. 404) = no restrictions, 5xx or unreachable = disallow all. */
  private robotsFor(url: URL): Promise<Robots> {
    const state = this.host(url);
    state.robots ??= (async () => {
      const robotsUrl = new URL('/robots.txt', url);
      let robots: Robots;
      try {
        const res = await this.request(robotsUrl, 'text/plain');
        const text = await res.text();
        if (res.status >= 200 && res.status <= 299)
          robots = parseRobots(text, productToken(this.userAgent));
        else if (res.status >= 400 && res.status <= 499) robots = ALLOW_ALL;
        else robots = DISALLOW_ALL;
      } catch (err) {
        this.log(
          `robots.txt ${robotsUrl.href} unreachable (${(err as Error).message}): disallow all`,
        );
        robots = DISALLOW_ALL;
      }
      state.crawlDelayMs = robots.crawlDelay * 1000;
      return robots;
    })();
    return state.robots;
  }

  /** One paced request (plus 429/503 retries) through the host queue. Redirects are not followed. */
  private request(url: URL, accept: string): Promise<Response> {
    const state = this.host(url);
    const run = async (): Promise<Response> => {
      for (let attempt = 0; ; attempt++) {
        const gap = Math.max(this.minIntervalMs, state.crawlDelayMs);
        const wait = state.lastRequestAt + gap - this.now();
        if (wait > 0) await this.sleep(wait);
        state.lastRequestAt = this.now();
        this.requestCount++;
        const res = await this.fetchImpl(url, {
          method: 'GET',
          headers: { 'user-agent': this.userAgent, accept },
          redirect: 'manual',
          credentials: 'omit',
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if ((res.status !== 429 && res.status !== 503) || attempt >= this.maxRetries) return res;
        const delay =
          retryAfterMs(res.headers.get('retry-after'), this.now()) ?? 5000 * (attempt + 1);
        await res.arrayBuffer(); // drain
        if (delay > this.maxRetryAfterMs) {
          throw new HttpError(
            `HTTP ${res.status}, Retry-After ${delay} ms too long`,
            url.href,
            res.status,
          );
        }
        this.log(`HTTP ${res.status} from ${url.host}, retry in ${delay} ms`);
        await this.sleep(delay);
      }
    };
    const next = state.queue.then(run, run);
    state.queue = next.catch(() => undefined);
    return next;
  }
}

/** Retry-After as delta-seconds or HTTP date -> milliseconds from `nowMs`; undefined if absent/invalid. */
export function retryAfterMs(header: string | null, nowMs: number): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header.trim()) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}
