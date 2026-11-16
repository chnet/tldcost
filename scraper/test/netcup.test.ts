import { describe, expect, it } from 'vitest';
import {
  findProduct,
  NETCUP_SITEMAP,
  netcup,
  pagesFromSitemap,
  toOffer,
  visibleText,
} from '../src/adapters/netcup.js';
import { ctxFor, fixture, testHttp } from './helpers.js';

const BASE = 'https://www.netcup.com/de/domain/';
const AT = '2026-11-13T06:00:00Z';
const offer = (tld: string, slug: string, html = fixture(`netcup/${tld}.html`)) =>
  toOffer(tld, BASE + slug, html, new TextEncoder().encode(html), AT);

/** Rewrites one field of the page's product inside a fixture's devalue payload. */
function patch(
  html: string,
  path: string,
  edit: (p: Record<string, unknown>, data: unknown[]) => void,
): string {
  return html.replace(
    /(id="__NUXT_DATA__">)(.*?)(<\/script>)/,
    (_m, a: string, json: string, c: string) => {
      const data = JSON.parse(json) as unknown[];
      const product = data.find(
        (v) =>
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          'netPrice' in v &&
          data[
            (
              data[(v as Record<string, number>).additionalConfiguration as number] as Record<
                string,
                number
              >
            ).slug
          ] === path,
      ) as Record<string, number>;
      const view = new Proxy({} as Record<string, unknown>, {
        set(_t, key: string, value) {
          product[key] = data.push(value) - 1;
          return true;
        },
      });
      edit(view, data);
      return a + JSON.stringify(data) + c;
    },
  );
}

describe('netcup sitemap and page text', () => {
  it('maps TLDs to product pages, zusaetzliche-domain wins', () => {
    const pages = pagesFromSitemap(fixture('netcup/sitemap.xml'));
    expect(pages.get('de')).toBe(`${BASE}zusaetzliche-domain-de`);
    expect(pages.get('ai')).toBe(`${BASE}domain-.ai`);
    expect(pages.has('restore-dateien-von-webhosting')).toBe(false);
    const both = pagesFromSitemap(
      `<loc>${BASE}domain-.de</loc><loc>${BASE}zusaetzliche-domain-de</loc><loc>${BASE}domain-.de</loc>`,
    );
    expect(both.get('de')).toBe(`${BASE}zusaetzliche-domain-de`);
  });
  it('extracts visible text', () => {
    expect(
      visibleText('<style>p{}</style><p>0,42&nbsp;&euro; &amp;\u00a0x</p><script>1</script>'),
    ).toBe(' 0,42 € & x ');
  });
});

describe('netcup toOffer', () => {
  it('stores the displayed gross monthly price as unit month (12-month billing)', () => {
    const de = offer('de', 'zusaetzliche-domain-de');
    expect(de).toMatchObject({
      tld: 'de',
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'month',
        setup: 0,
        year1: 42,
        year1_regular: 42,
        renewal: 42,
        term_years: 1,
        transfer_in: null,
      },
      promo: null,
      evidence: {
        source_url: `${BASE}zusaetzliche-domain-de`,
        method: 'scrape',
        confidence: 'high',
        fetched_at: AT,
      },
    });
    expect(de.evidence.source_endpoint).toBeUndefined();
  });
  it('derives the displayed price from netPrice (payload price is truncated)', () => {
    // .dev: net 1.50, payload price 1.78, page shows 1,79 € pro Monat
    expect(offer('dev', 'zusaetzliche-domain-dev').price.year1).toBe(179);
  });
  it('maps a 24-month billing period to a 2-year term (.ai)', () => {
    expect(offer('ai', 'domain-.ai').price).toMatchObject({
      year1: 958 * 24,
      renewal: 958 * 24,
      term_years: 2,
      renewal_term_years: 2,
    });
  });
  it('snapshot', () => {
    expect(['de', 'dev'].map((t) => offer(t, `zusaetzliche-domain-${t}`))).toMatchSnapshot();
  });

  const de = fixture('netcup/de.html');
  const P = '/de/domain/zusaetzliche-domain-de';
  const cases: [string, (p: Record<string, unknown>, d: unknown[]) => void, RegExp][] = [
    ['not a domain', (p) => (p.domain = false), /not a domain/],
    ['not orderable', (p) => (p.availableToOrder = false), /not available to order/],
    ['free months', (p) => (p.free_months = 3), /free_months 3/],
    ['billing not whole years', (p) => (p.billing_period = 6), /not whole years/],
    [
      'minimum term differs',
      (p) => (p.minimum_contract_period = 24),
      /minimum term 24 != billing period 12/,
    ],
    ['gross does not fit net', (p) => (p.price = 0.99), /is not net 0.35/],
    ['visible price differs', (p) => (p.netPrice = 0.36), /visible text lacks "0,43 € pro Monat"/],
  ];
  for (const [name, edit, error] of cases) {
    it(`rejects: ${name}`, () => {
      expect(() => offer('de', 'zusaetzliche-domain-de', patch(de, P, edit))).toThrow(error);
    });
  }
  it('rejects a deal (promo mapping not implemented)', () => {
    const html = de
      .replace(/"deal":(\d+)/, (_m, i: string) => `"deal":${i}`)
      .replace(
        /(id="__NUXT_DATA__">)(.*?)(<\/script>)/,
        (_m, a: string, json: string, c: string) => {
          const data = JSON.parse(json) as unknown[];
          for (const v of data) {
            if (v && typeof v === 'object' && !Array.isArray(v) && 'deal' in v) {
              (v as Record<string, number>).deal = data.push({ percent: data.push(10) - 1 }) - 1;
            }
          }
          return a + JSON.stringify(data) + c;
        },
      );
    expect(() => offer('de', 'zusaetzliche-domain-de', html)).toThrow(/deal present/);
  });
  it('rejects a page without exactly one product for its path', () => {
    expect(() => findProduct(de, '/de/domain/other')).toThrow(
      /expected 1 product for \/de\/domain\/other, found 0/,
    );
  });
});

describe('netcup adapter', () => {
  const routes = {
    'https://www.netcup.com/robots.txt': {
      body: 'User-agent: *\nDisallow: /api/*\nDisallow: /de/product/*\n',
    },
    [NETCUP_SITEMAP]: { body: fixture('netcup/sitemap.xml') },
    [`${BASE}zusaetzliche-domain-de`]: { body: fixture('netcup/de.html') },
    [`${BASE}domain-.ai`]: { body: fixture('netcup/ai.html') },
    [`${BASE}zusaetzliche-domain-com`]: { status: 500 },
  };
  it('fetches the sitemap and one page per TLD, isolating page failures', async () => {
    const { http, calls } = testHttp(routes);
    const result = await netcup.fetch(ctxFor(http, ['de', 'ai', 'com', 'berlin']));
    expect(result.offers.map((o) => o.tld)).toEqual(['de', 'ai']);
    expect(result.failed).toEqual([{ tld: 'com', reason: 'HTTP 500' }]);
    expect(result.notOffered).toEqual(['berlin']);
    expect(calls).toHaveLength(5);
  });
  it('throws when the sitemap has no domain pages', async () => {
    const { http } = testHttp({ ...routes, [NETCUP_SITEMAP]: { body: '<urlset></urlset>' } });
    await expect(netcup.fetch(ctxFor(http, ['de']))).rejects.toThrow(/no domain pages/);
  });
});
