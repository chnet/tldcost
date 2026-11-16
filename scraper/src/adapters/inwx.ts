// INWX: the price list page loads its prices from /api/v1/domain/all-prices (JSON, not documented,
// not disallowed by robots.txt). Prices are NET (the frontend adds taxRate when displaying; the
// download dialog says all prices are net): vat_included false, the provider's vat_rate applies.
// Fallback when the JSON fails or changes shape: the official CSV download, which mixes promo
// prices into "Neu-Registrierung" without dates. Only rows where registration equals renewal are
// provably regular; all other rows are blocked (the stored offer stays) and reported.
// A broken JSON is never silently replaced: the fallback is reported as a warning.
import type { OfferPromo } from '@tldcost/core';
import { evidenceHash } from '../evidence.js';
import type { HttpResponse } from '../http.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter, type AdapterContext, type AdapterResult } from '../types.js';

export const INWX_ENDPOINT = 'https://www.inwx.de/api/v1/domain/all-prices';
export const INWX_CSV = 'https://www.inwx.de/de/domain/pricelist/vat/1/file/csv';
export const INWX_SOURCE_URL = 'https://www.inwx.de/de/domain/pricelist';

/** Some net prices have four decimals (e.g. promo 26.8908 = 32.00 gross): round half up to cents. */
const cents = (v: number | string) => toCents(v, { exact: false });

interface InwxTime {
  scalar: string;
}

interface InwxPromo {
  currency: string;
  limitedNumber?: number;
  startTime: InwxTime;
  endTime: InwxTime;
  period: string;
  createPrice: number;
}

interface InwxTld {
  tld: string;
  currency: string;
  createPrice: number;
  renewalPrice: number;
  transferPrice: number;
  createPeriod: number;
  renewalPeriod: number;
  transferPeriod: number;
  promo?: InwxPromo;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parseJson(text: string): Map<string, InwxTld> {
  const json = JSON.parse(text) as { tlds?: unknown };
  if (!Array.isArray(json.tlds) || json.tlds.length === 0) throw new Error('no "tlds" array');
  const map = new Map<string, InwxTld>();
  for (const t of json.tlds as InwxTld[]) {
    const ok =
      typeof t?.tld === 'string' &&
      isNum(t.createPrice) &&
      isNum(t.renewalPrice) &&
      isNum(t.transferPrice) &&
      Number.isInteger(t.createPeriod) &&
      Number.isInteger(t.renewalPeriod) &&
      Number.isInteger(t.transferPeriod);
    if (!ok) throw new Error(`unexpected entry ${JSON.stringify(t).slice(0, 120)}`);
    map.set(t.tld, t);
  }
  return map;
}

/** The promo if it is active at `at`, in EUR and for the first year; else undefined (+ warning). */
function activePromo(t: InwxTld, at: Date, warn: (m: string) => void): InwxPromo | undefined {
  const p = t.promo;
  if (!p) return undefined;
  const start = Date.parse(p.startTime?.scalar);
  const end = Date.parse(p.endTime?.scalar);
  if (!(start <= at.getTime() && at.getTime() <= end)) return undefined;
  if (p.currency !== t.currency || p.period !== '1Y' || !isNum(p.createPrice)) {
    warn(`.${t.tld}: promo ignored (currency ${p.currency}, period ${p.period})`);
    return undefined;
  }
  return p;
}

function fromJson(ctx: AdapterContext, res: HttpResponse, result: AdapterResult): void {
  const fetchedAtDate = ctx.now();
  const map = parseJson(res.text);
  const evidence = {
    source_url: INWX_SOURCE_URL,
    source_endpoint: INWX_ENDPOINT,
    fetched_at: isoSeconds(fetchedAtDate),
    method: 'api' as const,
    evidence_hash: evidenceHash(res.bytes),
    confidence: 'high' as const,
  };
  for (const tld of ctx.tlds) {
    const t = map.get(tld);
    if (!t) {
      result.notOffered.push(tld);
      continue;
    }
    // TODO (open issue): verify in the browser whether INWX prices with createPeriod > 1 (.ai: 100 for 2
    // years) are per year or per period, then map them with term_years instead of skipping.
    if (t.createPeriod !== 1 || t.renewalPeriod !== 1) {
      result.skipped.push({
        tld,
        reason: `registration period ${t.createPeriod}/${t.renewalPeriod} years, per-year vs per-term price not verified`,
      });
      continue;
    }
    if (t.currency !== 'EUR') {
      result.failed.push({ tld, reason: `unexpected currency ${t.currency}` });
      continue;
    }
    const promo = activePromo(t, fetchedAtDate, (m) => result.warnings.push(m));
    const regular = cents(t.createPrice);
    let promoOut: OfferPromo | null = null;
    if (promo) {
      promoOut = {
        conditions: promo.limitedNumber ? `limitiert auf ${promo.limitedNumber} Domains` : null,
        valid_until: promo.endTime.scalar.slice(0, 10),
      };
    }
    result.offers.push({
      tld,
      currency: 'EUR',
      vat_included: false,
      price: {
        unit: 'year',
        setup: 0,
        year1: promo ? cents(promo.createPrice) : regular,
        year1_regular: regular,
        renewal: cents(t.renewalPrice),
        term_years: 1,
        renewal_term_years: 1,
        // transferPeriod 0 (e.g. .at, .ch): a transfer adds no year; the price is still the price
        transfer_in: t.transferPeriod <= 1 ? cents(t.transferPrice) : null,
      },
      promo: promoOut,
      evidence,
    });
  }
}

const CSV_HEADER = [
  'TLD',
  'Neu-Registrierung',
  'Registrierung (Zeitraum in Jahren)',
  'Providerwechsel',
  'Providerwechsel (Zeitraum in Jahren)',
  'Verlängerung',
  'Verlängerung (Zeitraum in Jahren)',
];

/** One `;`-separated line with optional double quotes (no embedded separators in this file). */
const csvFields = (line: string) => line.split(';').map((f) => f.trim().replace(/^"(.*)"$/, '$1'));

function fromCsv(ctx: AdapterContext, res: HttpResponse, result: AdapterResult): void {
  const lines = res.text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = csvFields(lines[0] ?? '');
  if (CSV_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(`CSV: unexpected header ${JSON.stringify(header.slice(0, 7))}`);
  }
  const rows = new Map(
    lines
      .slice(1)
      .map((l) => csvFields(l))
      .map((f) => [f[0], f] as const),
  );
  const evidence = {
    source_url: INWX_SOURCE_URL,
    source_endpoint: INWX_CSV,
    fetched_at: isoSeconds(ctx.now()),
    method: 'api' as const,
    evidence_hash: evidenceHash(res.bytes),
    confidence: 'medium' as const,
  };
  for (const tld of ctx.tlds) {
    const f = rows.get(tld);
    if (!f) {
      result.notOffered.push(tld);
      continue;
    }
    const [, create, createPeriod, transfer, transferPeriod, renewal, renewalPeriod] =
      f as string[];
    if (createPeriod !== '1' || renewalPeriod !== '1') {
      result.skipped.push({
        tld,
        reason: `registration period ${createPeriod}/${renewalPeriod} years, per-year vs per-term price not verified`,
      });
      continue;
    }
    try {
      const year1 = cents(create as string);
      const renewalCents = cents(renewal as string);
      // "Neu-Registrierung" mixes promo prices in without marking them. It is provably the regular
      // price only when it equals the renewal price; anything else is never written unmarked.
      const regular = year1 === renewalCents;
      if (!regular) {
        result.warnings.push(
          `.${tld}: CSV registration ${create} != renewal ${renewal}, may be a promo: offer kept as stored`,
        );
      }
      result.offers.push({
        tld,
        currency: 'EUR',
        vat_included: false,
        price: {
          unit: 'year',
          setup: 0,
          year1,
          year1_regular: year1,
          renewal: renewalCents,
          term_years: 1,
          renewal_term_years: 1,
          transfer_in: Number(transferPeriod) <= 1 ? cents(transfer as string) : null,
        },
        promo: null,
        evidence,
        ...(regular
          ? {}
          : { blocked: 'CSV fallback: registration price may be an unmarked promo (fail closed)' }),
      });
    } catch (err) {
      result.failed.push({ tld, reason: (err as Error).message });
    }
  }
}

export const inwx: Adapter = {
  id: 'inwx',
  async fetch(ctx) {
    const result = newResult();
    try {
      const res = await ctx.http.get(INWX_ENDPOINT, 'application/json');
      fromJson(ctx, res, result);
      return result;
    } catch (err) {
      const fallback = newResult();
      fallback.warnings.push(
        `JSON source failed (${(err as Error).message}), used CSV fallback without list prices and promo data`,
      );
      const res = await ctx.http.get(INWX_CSV, 'text/csv');
      fromCsv(ctx, res, fallback);
      return fallback;
    }
  },
};
