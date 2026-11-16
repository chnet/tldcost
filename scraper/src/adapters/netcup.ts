// netcup: one public product page per TLD (Nuxt SSR). The TLD -> page mapping comes from the
// product sitemap; the price data from the page's __NUXT_DATA__ payload (net price per month,
// billing period, minimum term, setup fee), cross-checked against the visible text.
// Stored GROSS as displayed (vat_included true), per month like the page (see toOffer for
// billing periods over 12 months). The page shows round(net x 1.19) per month,
// while the payload's gross `price` is truncated (.dev: net 1.50, shown 1,79 €, payload 1.78), so
// the displayed price is derived from netPrice and checked against the payload and the page text. robots.txt
// disallows /api/*, /de/product/*, checkout and admin only; the pages and the sitemap are allowed.
// Pages carry per-request nonces, so evidence_hash differs every run; diff and gate compare the
// extracted values only.
import { evidenceHash } from '../evidence.js';
import { formatEuroDe, toCents } from '../money.js';
import { devalueResolver, extractNuxtData } from '../nuxt.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter, type ScrapedOffer } from '../types.js';

export const NETCUP_SITEMAP = 'https://www.netcup.com/__sitemap__/products-de-DE.xml';
const PAGE =
  /<loc>(https:\/\/www\.netcup\.com\/de\/domain\/(?:zusaetzliche-domain-([a-z0-9-]+)|domain-\.([a-z0-9-]+)))<\/loc>/g;
const VAT_DE = 1900;

/** TLD -> product page URL. `zusaetzliche-domain-<tld>` wins over `domain-.<tld>`. */
export function pagesFromSitemap(xml: string): Map<string, string> {
  const pages = new Map<string, string>();
  for (const m of xml.matchAll(PAGE)) {
    const [, url, extra, plain] = m as unknown as [
      string,
      string,
      string | undefined,
      string | undefined,
    ];
    const tld = (extra ?? plain) as string;
    if (extra || !pages.has(tld)) pages.set(tld, url);
  }
  return pages;
}

/** Visible text of a page: no scripts/styles/tags, common entities decoded, whitespace collapsed. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

export interface NetcupProduct {
  id: number;
  price: number;
  netPrice: number;
  netSetup_costs: number;
  billing_period: number;
  minimum_contract_period: number;
  free_months: number;
  availableToOrder: boolean;
  domain: boolean;
  deal: unknown;
}

const PRODUCT_KEYS = [
  'price',
  'netPrice',
  'billing_period',
  'minimum_contract_period',
  'additionalConfiguration',
];

/** The product whose additionalConfiguration.slug is the page path (the page also lists cross-sells). */
export function findProduct(html: string, pagePath: string): NetcupProduct {
  const data = extractNuxtData(html);
  const resolve = devalueResolver(data);
  const found = new Map<number, NetcupProduct>();
  data.forEach((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return;
    if (!PRODUCT_KEYS.every((k) => k in raw)) return;
    const product = resolve(index) as Record<string, unknown>;
    const config = product.additionalConfiguration as Record<string, unknown> | null;
    if (config?.slug !== pagePath) return;
    found.set(product.id as number, {
      ...(product as unknown as NetcupProduct),
      deal: config.deal,
    });
  });
  if (found.size !== 1) throw new Error(`expected 1 product for ${pagePath}, found ${found.size}`);
  return [...found.values()][0] as NetcupProduct;
}

/** Offer from the page's product, after plausibility and visible-text checks (throws on mismatch). */
export function toOffer(
  tld: string,
  url: string,
  html: string,
  bytes: Uint8Array,
  fetchedAt: string,
): ScrapedOffer {
  const p = findProduct(html, new URL(url).pathname);
  if (!p.domain) throw new Error('product is not a domain');
  if (!p.availableToOrder) throw new Error('product is not available to order');
  if (p.free_months !== 0)
    throw new Error(`free_months ${p.free_months}: promo mapping not implemented`);
  if (p.deal !== false && p.deal !== null && p.deal !== undefined) {
    throw new Error('deal present: promo mapping not implemented');
  }
  if (!Number.isInteger(p.billing_period) || p.billing_period <= 0 || p.billing_period % 12 !== 0) {
    throw new Error(`billing period ${p.billing_period} months is not whole years`);
  }
  if (p.minimum_contract_period !== p.billing_period) {
    throw new Error(
      `minimum term ${p.minimum_contract_period} != billing period ${p.billing_period}`,
    );
  }
  const netMonthly = toCents(p.netPrice);
  const netSetup = toCents(p.netSetup_costs);
  const gross = (net: number) => Math.round((net * (10_000 + VAT_DE)) / 10_000);
  if (Math.abs(toCents(p.price) - gross(netMonthly)) > 1) {
    throw new Error(`gross ${p.price} is not net ${p.netPrice} + 19 % VAT`);
  }
  const text = visibleText(html);
  for (const expected of [
    `${formatEuroDe(gross(netMonthly))} € pro Monat`,
    `Mindestvertragslaufzeit ${p.minimum_contract_period} Monate`,
    `Abrechnungsperiode ${p.billing_period} Monate`,
    `Einrichtungsgebühr ${formatEuroDe(gross(netSetup))} €`,
  ]) {
    if (!text.includes(expected)) throw new Error(`visible text lacks "${expected}"`);
  }
  // Monthly price as displayed. 12-month billing: stored as `unit: month` (as on the page). Longer
  // billing periods (.ai: 24) cannot be `month` (schema: 1-year terms only), so they are stored as
  // the payment per term with term_years = months / 12.
  const monthly = gross(netMonthly);
  const years = p.billing_period / 12;
  const amount = years === 1 ? monthly : monthly * p.billing_period;
  return {
    tld,
    currency: 'EUR',
    vat_included: true,
    price: {
      unit: years === 1 ? 'month' : 'year',
      setup: gross(netSetup),
      year1: amount,
      year1_regular: amount,
      renewal: amount,
      term_years: years,
      renewal_term_years: years,
      // transfer price and transfer-out fee are not on the page (stage C, provider research)
      transfer_in: null,
    },
    promo: null,
    evidence: {
      source_url: url,
      fetched_at: fetchedAt,
      method: 'scrape',
      evidence_hash: evidenceHash(bytes),
      confidence: 'high',
    },
  };
}

export const netcup: Adapter = {
  id: 'netcup',
  async fetch(ctx) {
    const result = newResult();
    const sitemap = await ctx.http.get(NETCUP_SITEMAP, 'application/xml');
    const pages = pagesFromSitemap(sitemap.text);
    if (pages.size === 0) throw new Error('no domain pages in sitemap');
    for (const tld of ctx.tlds) {
      const url = pages.get(tld);
      if (!url) {
        result.notOffered.push(tld);
        continue;
      }
      try {
        const res = await ctx.http.get(url, 'text/html');
        const offer = toOffer(tld, url, res.text, res.bytes, isoSeconds(ctx.now()));
        result.offers.push(offer);
      } catch (err) {
        result.failed.push({ tld, reason: (err as Error).message });
      }
    }
    return result;
  },
};
