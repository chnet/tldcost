// Build time only: the public JSON API under /api/v1/ (concept sections 3.4 and 3.6).
//
// Every document carries the raw data from data/ unchanged (`providers`, `offers`, `fx`) plus a
// separate `derived` block with the TCO values computed by @tldcost/core, the same function the
// price table uses, so API and site never disagree. The raw data stays the source of truth.
//
// Output is reproducible: no build timestamp. `data_version` is a hash of the loaded data, so it
// changes exactly when data/ changes.
import { createHash } from 'node:crypto';
import {
  computeTco,
  fxRateFor,
  type Cents,
  type FxRate,
  type FxRates,
  type Offer,
  type PriceMode,
  type Provider,
} from '@tldcost/core';
import type { TldcostData } from '@tldcost/core/load';
import { orderTlds } from './rows';

export const API_VERSION = 1;
/**
 * Version of the schema set schema/*.schema.json. It equals the newest record `schema_version`:
 * offers 2 (feature value "paid" and feature_costs, Archiv-Issue 124), providers and fx 1.
 */
export const SCHEMA_VERSION = 2;
export const SITE_ORIGIN = 'https://tldcost.io';

/** License of the data and of every API document (owner decision 2026-11-14; data/LICENSE). */
export const DATA_LICENSE = {
  name: 'CC BY 4.0',
  spdx: 'CC-BY-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Quelle: tldcost.io (CHnet Solutions Plus UG), CC BY 4.0',
} as const;
export const API_PATH = '/api/v1';
export const SCHEMA_NAMES = ['offer', 'provider', 'fx'] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

export const schemaPath = (name: SchemaName) => `${API_PATH}/schema/${name}.schema.json`;
export const offersPath = (tld: string) => `${API_PATH}/offers/${tld}.json`;
export const tldPagePath = (tld: string) => `/tld/${tld}/`;

/** Fields every API document starts with. */
export interface ApiMeta {
  api_version: typeof API_VERSION;
  schema_version: typeof SCHEMA_VERSION;
  /** `sha256:<hex>` over the loaded data; changes exactly when data/ changes. */
  data_version: string;
  /** Newest `evidence.fetched_at` of the offers in this document, null without offers. */
  data_updated: string | null;
  /** Oldest `evidence.fetched_at` of the offers in this document, null without offers. */
  data_oldest: string | null;
  documentation: string;
  /** License of this document's data and the attribution to use (DATA_LICENSE). */
  license: typeof DATA_LICENSE;
}

/** TCO values of one offer in one VAT mode, EUR cents. */
export interface DerivedTcoMode {
  setup: Cents | null;
  sum_2y: Cents | null;
  avg_2y: Cents | null;
  sum_3y: Cents | null;
  avg_3y: Cents | null;
  sum_5y: Cents | null;
  avg_5y: Cents | null;
  /** Inputs that are missing, e.g. `price.renewal`, `vat_rate`, `fx.USD`; sums are null then. */
  missing: string[];
}

/** ECB reference rate: `per_eur` units of `currency` per 1 EUR on `date`. */
export interface DerivedFx {
  currency: string;
  date: string;
  per_eur: number;
}

export interface DerivedOffer {
  currency: 'EUR';
  /** ECB rate used to convert a non-EUR offer, null for EUR offers or when none is available. */
  fx: DerivedFx | null;
  /** The offer makes no VAT statement: amounts as stated, gross and net equal. */
  vat_not_stated: boolean;
  gross: DerivedTcoMode;
  net: DerivedTcoMode;
}

export interface Derived {
  description: string;
  /** Key `<provider>/<tld>`, one entry per offer in `offers`. */
  tco: Record<string, DerivedOffer>;
}

export interface AllDocument extends ApiMeta {
  providers: Provider[];
  offers: Offer[];
  fx: FxRates[];
  derived: Derived;
}

export interface TldDocument extends ApiMeta {
  tld: string;
  /** Only providers with an offer for this TLD. */
  providers: Provider[];
  offers: Offer[];
  derived: Derived;
}

export interface TldsDocument extends ApiMeta {
  tlds: { tld: string; offers: number; href: string; page: string }[];
}

export const DERIVED_DESCRIPTION =
  'Abgeleitete Werte, berechnet mit @tldcost/core (computeTco) aus den Rohdaten in "offers" ' +
  '(siehe Methodik). Maßgeblich sind die Rohdaten. Beträge in Euro-Cent, brutto und netto; ' +
  'Monatspreise (price.unit "month") sind auf das Jahr hochgerechnet (mal 12), Fremdwährungen ' +
  'zum EZB-Kurs umgerechnet. setup ist einmalig, sum_Ny die Summe über N Jahre (Einrichtung und ' +
  'jede innerhalb von N Jahren fällige Zahlung in voller Höhe), avg_Ny der Durchschnitt pro Jahr.';

const offerKey = (o: Offer) => `${o.provider}/${o.tld}`;

/** `sha256:<hex>` of the loaded data. loadData sorts everything, so the hash is stable. */
export function dataVersion(data: TldcostData): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`;
}

function fetchedRange(offers: readonly Offer[]): [string | null, string | null] {
  if (offers.length === 0) return [null, null];
  const times = offers.map((o) => o.evidence.fetched_at);
  // ISO 8601 UTC timestamps (schema: date-time); compare as instants, return the stored string
  const ms = times.map((t) => Date.parse(t));
  const newest = times[ms.indexOf(Math.max(...ms))] ?? null;
  const oldest = times[ms.indexOf(Math.min(...ms))] ?? null;
  return [newest, oldest];
}

function meta(version: string, offers: readonly Offer[]): ApiMeta {
  const [data_updated, data_oldest] = fetchedRange(offers);
  return {
    api_version: API_VERSION,
    schema_version: SCHEMA_VERSION,
    data_version: version,
    data_updated,
    data_oldest,
    documentation: `${SITE_ORIGIN}/api/`,
    license: DATA_LICENSE,
  };
}

function tcoMode(offer: Offer, provider: Provider, mode: PriceMode, fx?: FxRate): DerivedTcoMode {
  const opts = { mode, provider, ...(fx ? { fx } : {}) };
  const t2 = computeTco(offer, 2, opts);
  const t3 = computeTco(offer, 3, opts);
  const t5 = computeTco(offer, 5, opts);
  return {
    setup: t3.setup,
    sum_2y: t2.sum,
    avg_2y: t2.avg,
    sum_3y: t3.sum,
    avg_3y: t3.avg,
    sum_5y: t5.sum,
    avg_5y: t5.avg,
    missing: [...new Set([t2, t3, t5].flatMap((t) => t.missing))].sort(),
  };
}

/** The derived block for `offers`; offers without a provider record are skipped. */
export function deriveTco(data: TldcostData, offers: readonly Offer[]): Derived {
  const providerById = new Map(data.providers.map((p) => [p.id, p]));
  const tco: Record<string, DerivedOffer> = {};
  for (const offer of offers) {
    const provider = providerById.get(offer.provider);
    if (!provider) continue; // validate-data rejects this
    // same FX lookup as the table (rows.ts)
    const fx =
      offer.currency === 'EUR'
        ? undefined
        : fxRateFor(data.fx, offer.currency, offer.evidence.fetched_at);
    tco[offerKey(offer)] = {
      currency: 'EUR',
      fx: fx ? { currency: fx.currency, date: fx.date, per_eur: fx.perEur } : null,
      vat_not_stated: offer.vat_included === null,
      gross: tcoMode(offer, provider, 'gross', fx),
      net: tcoMode(offer, provider, 'net', fx),
    };
  }
  return { description: DERIVED_DESCRIPTION, tco };
}

/** TLDs with at least one offer, in the site's display order. */
export function apiTlds(data: TldcostData): string[] {
  return orderTlds(data.offers.map((o) => o.tld));
}

export function buildAll(data: TldcostData): AllDocument {
  return {
    ...meta(dataVersion(data), data.offers),
    providers: data.providers,
    offers: data.offers,
    fx: data.fx,
    derived: deriveTco(data, data.offers),
  };
}

export function buildTld(data: TldcostData, tld: string): TldDocument {
  const offers = data.offers.filter((o) => o.tld === tld);
  const ids = new Set(offers.map((o) => o.provider));
  return {
    ...meta(dataVersion(data), offers),
    tld,
    providers: data.providers.filter((p) => ids.has(p.id)),
    offers,
    derived: deriveTco(data, offers),
  };
}

export function buildTlds(data: TldcostData): TldsDocument {
  return {
    ...meta(dataVersion(data), data.offers),
    tlds: apiTlds(data).map((tld) => ({
      tld,
      offers: data.offers.filter((o) => o.tld === tld).length,
      href: offersPath(tld),
      page: tldPagePath(tld),
    })),
  };
}

/** A schema file as served under /api/v1/schema/, with `$id` pointing at that URL. */
export function servedSchema(schema: Record<string, unknown>, name: SchemaName) {
  return { ...schema, $id: `${SITE_ORIGIN}${schemaPath(name)}` };
}

/** JSON response for an Astro static endpoint. Pretty-printed: diffable, CloudFront compresses. */
export function jsonResponse(body: unknown): Response {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
