// The MCP tools (v1, Archiv-Issue 67): list_tlds, get_offers, compare, get_provider (basket: basket.ts).
// Transport-free: each tool takes plain arguments and returns a JSON-serialisable result, so they
// are tested without MCP.
//
// Rules (same as the site, see https://tldcost.io/methodik/):
// - TCO is computed by @tldcost/core computeTco, the function behind the site's table and the API's
//   `derived` block: monthly prices are annualised (x 12), non-EUR prices converted at the ECB rate
//   the API names in `derived.tco[*].fx`, VAT added or removed with the provider's rate.
// - Neutral wording: results are sorted, never rated ("best", "recommended"). The portal operator's
//   own offer is marked `operator: true` and sorted like any other.
// - Every answer carries its source (API URL, data_version, data_updated, retrieval time) and the
//   data license with the attribution to use.
import {
  computeTco,
  effectiveContract,
  MAX_TCO_YEARS,
  type FxRate,
  type Offer,
  type PriceMode,
  type Provider,
  type TcoResult,
} from '@tldcost/core';
import type { ApiClient, ApiMeta, Fetched, TldDocument } from './api.js';
import { NotFoundError } from './api.js';

/** Wrong input; reported to the client as a tool error with this message. */
export class ToolInputError extends Error {}

export type SortKey = 'total' | 'year1' | 'provider';
const SORT_KEYS: readonly SortKey[] = ['total', 'year1', 'provider'];
const MODES: readonly PriceMode[] = ['gross', 'net'];
const DEFAULT_YEARS = 3;

export interface Source {
  api_url: string;
  data_version: string;
  /** Newest price fetch date of the data in this answer. */
  data_updated: string | null;
  /** Oldest price fetch date of the data in this answer. */
  data_oldest: string | null;
  /** When this server fetched the API document. */
  retrieved_at: string;
  documentation: string;
  license: ApiMeta['license'];
}

export const sourceOf = (f: Fetched<ApiMeta>): Source => ({
  api_url: f.url,
  data_version: f.doc.data_version,
  data_updated: f.doc.data_updated,
  data_oldest: f.doc.data_oldest,
  retrieved_at: f.retrieved_at,
  documentation: f.doc.documentation,
  license: f.doc.license,
});

/** Cents -> euros with two decimals; null stays null. */
const eur = (cents: number | null): number | null => (cents === null ? null : cents / 100);

// ---------------------------------------------------------------------------------------------
// input checks

/** ".DE " -> "de". Throws on anything that is not a domain label sequence. */
export function parseTld(value: unknown): string {
  if (typeof value !== 'string') throw new ToolInputError('tld must be a string, e.g. "de"');
  const tld = value.trim().toLowerCase().replace(/^\./, '');
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(tld) || tld.length > 63) {
    throw new ToolInputError(`not a TLD: ${JSON.stringify(value)}`);
  }
  return tld;
}

export function parseYears(value: unknown): number {
  if (value === undefined) return DEFAULT_YEARS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_TCO_YEARS) {
    throw new ToolInputError(`years must be an integer 1..${MAX_TCO_YEARS}`);
  }
  return value;
}

export function parseVat(value: unknown): PriceMode {
  if (value === undefined) return 'gross';
  if (!MODES.includes(value as PriceMode)) throw new ToolInputError('vat must be "gross" or "net"');
  return value as PriceMode;
}

export function parseSort(value: unknown): SortKey {
  if (value === undefined) return 'total';
  if (!SORT_KEYS.includes(value as SortKey)) {
    throw new ToolInputError(`sort must be one of ${SORT_KEYS.join(', ')}`);
  }
  return value as SortKey;
}

export function parseProviders(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 50 ||
    !value.every((v) => typeof v === 'string' && /^[a-z0-9-]{1,64}$/.test(v))
  ) {
    throw new ToolInputError('providers must be a non-empty list of provider ids, e.g. ["inwx"]');
  }
  return [...new Set(value as string[])];
}

export function parseProviderId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value)) {
    throw new ToolInputError('provider must be a provider id, e.g. "inwx" (see get_offers)');
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// offers

export interface OfferView {
  provider: string;
  provider_name: string;
  operator: boolean;
  /** Raw price as published by the provider (currency, unit, cents). */
  raw: {
    currency: string;
    vat_included: boolean | null;
    unit: Offer['price']['unit'];
    setup: number | null;
    year1: number | null;
    year1_regular: number | null;
    renewal: number | null;
    transfer_in: number | null;
    /**
     * Years covered by year1 / by one renewal: as stated, else the schema default 1. null when
     * the offer has no amounts at all (offered, values unknown): a default would claim a term.
     */
    term_years: number | null;
    renewal_term_years: number | null;
  };
  /** Computed in EUR for the requested years and VAT mode (annualised, converted). */
  tco: {
    years: number;
    vat: PriceMode;
    setup_eur: number | null;
    total_eur: number | null;
    avg_per_year_eur: number | null;
    per_year_eur: (number | null)[];
    /** Inputs that are unknown; totals are null then. */
    missing: string[];
    /** The offer makes no VAT statement: amounts as stated in both modes. */
    vat_not_stated: boolean;
    fx: { currency: string; date: string; per_eur: number } | null;
  };
  promo: { active: boolean; conditions: string | null; valid_until: string | null };
  evidence: {
    source_url: string;
    fetched_at: string;
    method: Offer['evidence']['method'];
    confidence: Offer['evidence']['confidence'];
  };
}

function fxFor(doc: TldDocument, offer: Offer): FxRate | undefined {
  const fx = doc.derived.tco[`${offer.provider}/${offer.tld}`]?.fx;
  return fx ? { currency: fx.currency, perEur: fx.per_eur, date: fx.date } : undefined;
}

function offerView(doc: TldDocument, offer: Offer, years: number, vat: PriceMode): OfferView {
  const provider = doc.providers.find((p) => p.id === offer.provider);
  const fx = fxFor(doc, offer);
  const t: TcoResult = computeTco(offer, years, {
    mode: vat,
    ...(provider ? { provider } : {}),
    ...(fx ? { fx } : {}),
  });
  const p = offer.price;
  const amounts = [p.setup, p.year1, p.year1_regular, p.renewal, p.transfer_in];
  const termDefault = amounts.some((a) => typeof a === 'number') ? 1 : null;
  return {
    provider: offer.provider,
    provider_name: provider?.name ?? offer.provider,
    operator: provider?.operator === true,
    raw: {
      currency: offer.currency,
      vat_included: offer.vat_included,
      unit: p.unit,
      setup: p.setup,
      year1: p.year1,
      year1_regular: p.year1_regular ?? null,
      renewal: p.renewal,
      transfer_in: p.transfer_in ?? null,
      term_years: p.term_years ?? termDefault,
      renewal_term_years: p.renewal_term_years ?? termDefault,
    },
    tco: {
      years,
      vat,
      setup_eur: eur(t.setup),
      total_eur: eur(t.sum),
      avg_per_year_eur: eur(t.avg),
      per_year_eur: t.perYear.map(eur),
      missing: t.missing,
      vat_not_stated: offer.vat_included === null,
      fx: fx ? { currency: fx.currency, date: fx.date, per_eur: fx.perEur } : null,
    },
    promo: {
      active: offer.promo !== undefined && offer.promo !== null,
      conditions: offer.promo?.conditions ?? null,
      valid_until: offer.promo?.valid_until ?? null,
    },
    evidence: {
      source_url: offer.evidence.source_url,
      fetched_at: offer.evidence.fetched_at,
      method: offer.evidence.method,
      confidence: offer.evidence.confidence,
    },
  };
}

async function tldDoc(api: ApiClient, tld: string): Promise<Fetched<TldDocument>> {
  try {
    return await api.tld(tld);
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new ToolInputError(`no offers for .${tld} (list_tlds shows the TLDs with data)`);
    }
    throw err;
  }
}

/** Provider ids are unique within one TLD document, so two offers never compare equal. */
const byId = (a: { provider: string }, b: { provider: string }) =>
  a.provider < b.provider ? -1 : 1;

// ---------------------------------------------------------------------------------------------
// tools

export async function listTlds(api: ApiClient) {
  const f = await api.tlds();
  return {
    tlds: f.doc.tlds.map((t) => ({ tld: t.tld, offers: t.offers })),
    source: sourceOf(f),
  };
}

export async function getOffers(api: ApiClient, args: Record<string, unknown>) {
  const tld = parseTld(args.tld);
  const years = parseYears(args.years);
  const vat = parseVat(args.vat);
  const f = await tldDoc(api, tld);
  return {
    tld,
    years,
    vat,
    currency: 'EUR',
    note: "Amounts in *_eur are EUR, annualised and converted as on tldcost.io; raw.* are the provider's own amounts in cents. Listed by provider id, not ranked.",
    offers: f.doc.offers.map((o) => offerView(f.doc, o, years, vat)).sort(byId),
    source: sourceOf(f),
  };
}

export async function compare(api: ApiClient, args: Record<string, unknown>) {
  const tld = parseTld(args.tld);
  const years = parseYears(args.years);
  const vat = parseVat(args.vat);
  const sort = parseSort(args.sort);
  const only = parseProviders(args.providers);
  const f = await tldDoc(api, tld);
  if (only) {
    const known = new Set(f.doc.offers.map((o) => o.provider));
    const unknown = only.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new ToolInputError(`no .${tld} offer from: ${unknown.join(', ')}`);
    }
  }
  const views = f.doc.offers
    .filter((o) => !only || only.includes(o.provider))
    .map((o) => offerView(f.doc, o, years, vat));
  const key = (v: OfferView): number | null =>
    sort === 'year1' ? (v.tco.per_year_eur[0] ?? null) : v.tco.total_eur;
  views.sort((a, b) => {
    if (sort !== 'provider') {
      const ka = key(a);
      const kb = key(b);
      // unknown amounts last
      if (ka !== kb) return ka === null ? 1 : kb === null ? -1 : ka - kb;
    }
    return byId(a, b);
  });
  return {
    tld,
    years,
    vat,
    sort,
    currency: 'EUR',
    note:
      sort === 'provider'
        ? 'Listed by provider id.'
        : `Sorted by ${sort === 'total' ? `total cost over ${years} year(s)` : 'first-year payment'}, lowest first; offers with unknown amounts last. The order is a price order, not a recommendation; check promo and contract terms (get_provider).`,
    rows: views.map((v, i) => ({
      position: i + 1,
      provider: v.provider,
      provider_name: v.provider_name,
      operator: v.operator,
      total_eur: v.tco.total_eur,
      avg_per_year_eur: v.tco.avg_per_year_eur,
      year1_eur: v.tco.per_year_eur[0] ?? null,
      setup_eur: v.tco.setup_eur,
      promo: v.promo.active,
      missing: v.tco.missing,
      raw_unit: v.raw.unit,
      raw_currency: v.raw.currency,
      source_url: v.evidence.source_url,
      fetched_at: v.evidence.fetched_at,
    })),
    source: sourceOf(f),
  };
}

export async function getProvider(api: ApiClient, args: Record<string, unknown>) {
  const id = parseProviderId(args.provider);
  const f = await api.all();
  const provider: Provider | undefined = f.doc.providers.find((p) => p.id === id);
  if (!provider) {
    const ids = f.doc.providers.map((p) => p.id).join(', ');
    throw new ToolInputError(`unknown provider "${id}"; known: ${ids}`);
  }
  const terms = provider.terms;
  return {
    provider: {
      id: provider.id,
      name: provider.name,
      website: provider.website,
      country: provider.country,
      vat_rate_percent: provider.vat_rate === null ? null : provider.vat_rate / 100,
      operator: provider.operator === true,
      reviewed_at: provider.reviewed_at ?? null,
    },
    terms: {
      url: terms?.url ?? null,
      section: terms?.section ?? null,
      min_term_months: terms?.min_term_months ?? null,
      notice_period_days: terms?.notice_period_days ?? null,
      billing_cycle: terms?.billing_cycle ?? null,
      auto_renew_default: terms?.auto_renew_default ?? null,
      notes: terms?.notes ?? {},
    },
    offers: f.doc.offers
      .filter((o) => o.provider === id)
      .map((o) => ({
        tld: o.tld,
        contract: effectiveContract(o, provider),
        features: o.features ?? {},
        // source and stated price of each "paid" feature, passed through as published (Archiv-Issue 124)
        feature_costs: o.feature_costs ?? {},
        source_url: o.evidence.source_url,
        fetched_at: o.evidence.fetched_at,
      })),
    note: 'null = unknown. Contract values per offer: the offer\'s own terms win over the provider terms. Feature "paid": offered only for a fee; feature_costs has the provider\'s quote and URL and, where stated, price_cents (offer currency and VAT mode), unit and a German note.',
    source: sourceOf(f),
  };
}
