import { describe, expect, it } from 'vitest';
import { renderViewerRequestFunction } from '../lib/site-stack.js';

type Req = {
  uri: string;
  headers: Record<string, { value: string }>;
  querystring: Record<string, unknown>;
};
// Either the (rewritten) request or a redirect response; tests only read these fields.
type Result = { statusCode?: number; uri?: string; headers: { location: { value: string } } };
type Handler = (event: { request: Req }) => Result;

// Evaluates the rendered CloudFront Function source the same way the stack deploys it.
function load(canonical: string, redirects: string[]): Handler {
  const src = renderViewerRequestFunction(canonical, redirects);
  return new Function(`${src}\nreturn handler;`)() as Handler;
}

const handler = load('tldcost.io', ['www.tldcost.io', 'tldcost.de']);
const req = (
  host: string,
  uri: string,
  querystring: Record<string, unknown> = {},
): { request: Req } => ({
  request: { uri, headers: { host: { value: host } }, querystring },
});

describe('viewer-request CloudFront Function', () => {
  it('301-redirects www and alternate hosts to the apex, keeping path and query', () => {
    const res = handler(
      req('www.tldcost.io', '/tld/de/', { sort: { value: 'tco3' }, x: { value: '' } }),
    );
    expect(res.statusCode).toBe(301);
    expect(res.headers.location.value).toBe('https://tldcost.io/tld/de/?sort=tco3&x');
    expect(handler(req('TLDCOST.DE', '/')).headers.location.value).toBe('https://tldcost.io/');
  });

  it('host redirect adds the trailing slash in the same hop', () => {
    expect(handler(req('www.tldcost.io', '/tld/de')).headers.location.value).toBe(
      'https://tldcost.io/tld/de/',
    );
    expect(handler(req('www.tldcost.io', '/api/v1/all.json')).headers.location.value).toBe(
      'https://tldcost.io/api/v1/all.json',
    );
  });

  it('keeps multi-value query parameters', () => {
    const res = handler(
      req('www.tldcost.io', '/', {
        a: { value: '1', multiValue: [{ value: '1' }, { value: '2' }] },
      }),
    );
    expect(res.headers.location.value).toBe('https://tldcost.io/?a=1&a=2');
  });

  it('301-redirects directory URLs without trailing slash to /x/ (relative, keeps query)', () => {
    const res = handler(req('tldcost.io', '/tld/de', { sort: { value: 'tco3' } }));
    expect(res.statusCode).toBe(301);
    expect(res.headers.location.value).toBe('/tld/de/?sort=tco3');
    expect(handler(req('d111111abcdef8.cloudfront.net', '/methodik')).headers.location.value).toBe(
      '/methodik/',
    );
  });

  it('rewrites /x/ to /x/index.html without redirect; leaves files alone', () => {
    expect(handler(req('tldcost.io', '/')).uri).toBe('/index.html');
    expect(handler(req('tldcost.io', '/tld/de/')).uri).toBe('/tld/de/index.html');
    expect(handler(req('tldcost.io', '/api/v1/all.json')).uri).toBe('/api/v1/all.json');
    expect(handler(req('tldcost.io', '/favicon.ico')).uri).toBe('/favicon.ico');
    expect(handler(req('tldcost.io', '/404.html')).uri).toBe('/404.html');
  });

  it('does not host-redirect the apex or the cloudfront.net host', () => {
    expect(handler(req('tldcost.io', '/')).statusCode).toBeUndefined();
    expect(handler(req('d111111abcdef8.cloudfront.net', '/')).uri).toBe('/index.html');
  });
});
