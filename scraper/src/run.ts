// Runs the adapters, merges their results into data/offers/<provider>/<tld>.json, applies the
// plausibility gate and fetches the ECB rates. Pure decisions (merge, diff, gate) are exported for
// tests; run() does the I/O. --dry-run computes everything and writes nothing. Afterwards the
// plausibility check compares every offer with the TLD median of the other providers (stored data
// plus this run's results); its hits are reported for a human check and never block. Every written
// offer whose price state changed also gets a history entry (data/history/<provider>/<tld>.json);
// syncHistory() does the same for all stored offers (seed, hand-edited offers).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  appendHistory,
  DEFAULT_PLAUSIBILITY_HIGH,
  DEFAULT_PLAUSIBILITY_LOW,
  DEFAULT_PLAUSIBILITY_MIN_OTHERS,
  FOREIGN_MARKET_CURRENCIES,
  isMarketSwitch,
  marketBasis,
  marketSwitchLabel,
  plausibilityCheck,
  type FxRates,
  type MarketBasis,
  type Offer,
  type OfferPromo,
  type PlausibilityHit,
  type PriceHistory,
  type UncomparableOffer,
} from '@tldcost/core';
import { loadData } from '@tldcost/core/load';
import { format, resolveConfig } from 'prettier';
import { fetchEcb } from './ecb.js';
import type { HttpClient } from './http.js';
import type { Adapter, AdapterResult, ScrapedOffer } from './types.js';

/** Concept finding 2: a list or renewal price change above 30 % blocks the offer. */
export const DEFAULT_MAX_CHANGE = 0.3;
/** Gated fields. year1 is not gated: promo starts (e.g. -61 %) are normal and show up in `promo`. */
const GATED = ['year1_regular', 'renewal'] as const;
/**
 * One-time fees, gated only upwards: an increase from 0 or above the limit stops the offer (a setup
 * fee going from 0 to 25 € needs a human), a decrease passes (e.g. a .de transfer fee dropping to 0).
 */
const GATED_INCREASE = ['setup', 'transfer_in'] as const;
/** Evidence fields that change on every fetch; any other evidence change is listed in the diff. */
const VOLATILE_EVIDENCE = new Set(['fetched_at', 'evidence_hash']);

export interface FieldChange {
  path: string;
  from: unknown;
  to: unknown;
}

export interface OfferChange {
  provider: string;
  tld: string;
  /** added: new file; changed: price data differs; refreshed: only evidence (fetched_at, hash). */
  kind: 'added' | 'changed' | 'refreshed';
  fields: FieldChange[];
  /**
   * Changed evidence fields other than fetched_at and evidence_hash (e.g. source_url, method,
   * confidence). They do not make an offer "changed", but they are listed (empty for added).
   */
  evidence: FieldChange[];
  /**
   * Set when the offer switches between the German display and a foreign market display
   * ("DE -> US", core isMarketSwitch): the reports show it on its own line for the human check.
   */
  market?: string;
}

/**
 * Why an offer was not written (or not removed). Only `gate` fails the run (exit 1): a price jump on
 * stored data needs a human. The others leave the stored data untouched and are reported only:
 * - blocked: the adapter cannot trust the price (e.g. an unmarked promo in the INWX CSV fallback)
 * - promo-required: a sale price without a stored promo (Porkbun)
 * - delisted: a stored offer the provider no longer lists (file kept)
 * - history: the price history cannot take this state (appendHistory threw), offer not written
 */
export type ViolationKind = 'gate' | 'blocked' | 'promo-required' | 'delisted' | 'history';

export interface Violation {
  provider: string;
  tld: string;
  kind: ViolationKind;
  reason: string;
}

export interface ProviderReport {
  id: string;
  status: 'ok' | 'failed' | 'no-provider-file';
  error?: string;
  offers: number;
  notOffered: string[];
  skipped: AdapterResult['skipped'];
  failed: AdapterResult['failed'];
  warnings: string[];
}

export interface RunReport {
  dryRun: boolean;
  startedAt: string;
  providers: ProviderReport[];
  changes: OfferChange[];
  violations: Violation[];
  fx?: { status: 'added' | 'unchanged' | 'failed'; date?: string; error?: string };
  requests: number;
  /** Files written (empty in dry-run). */
  written: string[];
  /**
   * Offers far from the TLD median of the other providers (never blocks, never changes the exit
   * code). `error`: the check could not run (e.g. unreadable data).
   */
  plausibility?: PlausibilityReport;
}

export interface PlausibilityReport {
  low: number;
  high: number;
  /** Minimum number of other providers for the TLD (default 3, so at least 4 in all). */
  minOthers: number;
  hits: PlausibilityHit[];
  /** Offers left out of the check (no regular price, invalid term, VAT/FX rate missing, 0). */
  uncomparable: UncomparableOffer[];
  error?: string;
}

export interface RunOptions {
  dataDir: string;
  adapters: readonly Adapter[];
  http: HttpClient;
  tlds: readonly string[];
  dryRun: boolean;
  fx: boolean;
  maxChange?: number;
  /** Bounds of the plausibility check (share/multiple of the TLD median). Default 1/3 and 3. */
  plausibility?: { low?: number; high?: number; minOthers?: number };
  now?: () => Date;
  log?: (message: string) => void;
}

/**
 * undefined: the source knows nothing about promos, keep the stored one. For the same promo (same
 * valid_until) the hand-written conditions stay unless the source states its own. The limit per
 * customer (with its source and scope, incl. "unlimited") is hand-checked for one promo: it stays
 * only while the promo is unchanged, i.e. also the same year-1 price in the same currency, price
 * unit and VAT mode (`samePrice`, see samePriceBasis). Otherwise it is dropped and the portfolio
 * calculator falls back to its conservative pool (fail-safe: never more promo domains than
 * checked). Most promos have no valid_until, so the date alone cannot tell a new promo from the
 * old one.
 */
export function mergePromo(
  stored: OfferPromo | null | undefined,
  scraped: OfferPromo | null | undefined,
  samePrice = false,
): OfferPromo | null {
  if (scraped === undefined) return stored ?? null;
  if (!scraped || !stored || stored.valid_until !== scraped.valid_until) return scraped;
  const merged: OfferPromo = { ...scraped };
  if (!merged.conditions && stored.conditions) merged.conditions = stored.conditions;
  if (!samePrice) return merged;
  if (merged.max_per_customer === undefined && stored.max_per_customer !== undefined) {
    merged.max_per_customer = stored.max_per_customer;
  }
  if (
    merged.max_per_customer_source === undefined &&
    stored.max_per_customer_source !== undefined
  ) {
    merged.max_per_customer_source = stored.max_per_customer_source;
  }
  if (merged.limit_scope === undefined && stored.limit_scope !== undefined) {
    merged.limit_scope = stored.limit_scope;
  }
  return merged;
}

/**
 * true when the scraped year-1 price means the same as the stored one: same amount, currency,
 * price unit and VAT mode. Fail-safe: anything else counts as a new promo (Archiv-Issue 128 review).
 */
export function samePriceBasis(existing: Offer | undefined, s: ScrapedOffer): boolean {
  return (
    existing !== undefined &&
    existing.price.year1 === s.price.year1 &&
    existing.currency === s.currency &&
    existing.price.unit === s.price.unit &&
    existing.vat_included === s.vat_included
  );
}

/**
 * A derived list price (`derivedListPrice`) checked against the stored offer. The source may show a
 * sale that is not below the renewal price, read as the new list price.
 * - Below the stored list price, with a stored promo that has not expired: that is the recorded
 *   sale; the stored list price and promo stay.
 * - Below the stored list price otherwise: the offer needs a human (`promoRequired`).
 * - No stored list price but a stored promo: written (usually the sale ended), with a warning,
 *   because a sale at or above renewal would look the same.
 * - Equal or higher: passes unchanged (a sale ended, or a real increase under the gate).
 * `today` is YYYY-MM-DD; a promo with `valid_until` before it has expired.
 */
export function checkDerivedListPrice(
  existing: Offer | undefined,
  s: ScrapedOffer,
  today: string,
): { offer: ScrapedOffer; promoRequired?: string; warning?: string } {
  const stored = existing?.price.year1_regular;
  const derived = s.price.year1_regular;
  if (!s.derivedListPrice || typeof derived !== 'number') return { offer: s };
  const promo = existing?.promo;
  if (typeof stored !== 'number') {
    if (!promo) return { offer: s };
    return {
      offer: s,
      warning:
        `year1 ${derived} taken as the list price and the stored promo removed; without a stored ` +
        'list price a sale at or above renewal looks the same: check by hand',
    };
  }
  if (derived >= stored) return { offer: s };
  const until = promo?.valid_until;
  const expired = typeof until === 'string' && until < today;
  if (promo && !expired) {
    const offer: ScrapedOffer = { ...s, price: { ...s.price, year1_regular: stored } };
    delete offer.promo; // undefined: the stored promo stays (mergePromo)
    return { offer };
  }
  return {
    offer: s,
    promoRequired:
      `year1 ${derived} below the stored list price ${stored} without a ` +
      `${promo ? `current promo (stored promo ended ${promo.valid_until})` : 'stored promo'} ` +
      '(sale at or above renewal, or a new list price: check by hand)',
  };
}

/**
 * One-time fees the source no longer states: a stored number that becomes null is not written
 * (kind `blocked`). Otherwise a later null -> number step would pass the gate unseen (the gate
 * compares numbers only), e.g. a setup fee 0 -> null (pattern no longer found) -> 14.90.
 */
export function unknownFees(existing: Offer | undefined, next: Offer): string[] {
  if (!existing) return [];
  return GATED_INCREASE.filter(
    (k) => typeof existing.price[k] === 'number' && next.price[k] === null,
  ).map((k) => `${k} ${existing.price[k]} -> null: a known fee became unknown`);
}

/**
 * The scraped fields replace their counterparts; manual fields (vat_rate, contract, features,
 * feature_costs, provider_verified, price fields the source does not set) stay.
 */
export function mergeOffer(provider: string, existing: Offer | undefined, s: ScrapedOffer): Offer {
  const offer: Offer = {
    schema_version: 2,
    provider,
    tld: s.tld,
    currency: s.currency,
    vat_included: s.vat_included,
    price: { ...existing?.price, ...s.price },
    promo: mergePromo(existing?.promo, s.promo, samePriceBasis(existing, s)),
    ...(s.foreign_market ? { foreign_market: { ...s.foreign_market } } : {}),
    evidence: { ...s.evidence },
    provider_verified: existing?.provider_verified ?? false,
  };
  // the setup fee's source belongs to this run's price: none from the adapter, none stored
  if (s.price.setup_source === undefined) delete offer.price.setup_source;
  // 1 is the schema default: kept out of the files, as in hand-made offers
  if (offer.price.term_years === 1) delete offer.price.term_years;
  if (offer.price.renewal_term_years === 1) delete offer.price.renewal_term_years;
  if (existing?.vat_rate !== undefined) offer.vat_rate = existing.vat_rate;
  if (existing?.contract) offer.contract = existing.contract;
  if (existing?.features) offer.features = existing.features;
  // sources of "paid" features (Archiv-Issue 124): without them a kept "paid" would fail validate-data
  if (existing?.feature_costs) offer.feature_costs = existing.feature_costs;
  // stable key order, matching schema/examples
  const {
    schema_version,
    tld,
    currency,
    vat_included,
    vat_rate,
    price,
    promo,
    contract,
    features,
    feature_costs,
    foreign_market,
    evidence,
  } = offer;
  return Object.fromEntries(
    Object.entries({
      schema_version,
      provider,
      tld,
      currency,
      vat_included,
      vat_rate,
      price,
      promo,
      contract,
      features,
      feature_costs,
      foreign_market,
      evidence,
      provider_verified: offer.provider_verified,
    }).filter(([, v]) => v !== undefined),
  ) as unknown as Offer;
}

function leafDiff(path: string, a: unknown, b: unknown, out: FieldChange[]): void {
  const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of [...keys].sort()) {
      leafDiff(
        path ? `${path}.${k}` : k,
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        out,
      );
    }
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path, from: a ?? null, to: b ?? null });
  }
}

/**
 * What changed between the stored and the new offer; evidence alone counts as "refreshed". Evidence
 * changes beyond fetched_at and evidence_hash are listed separately in `evidence`.
 */
export function compareOffer(existing: Offer | undefined, next: Offer): OfferChange {
  const base = { provider: next.provider, tld: next.tld };
  if (!existing) return { ...base, kind: 'added', fields: [], evidence: [] };
  const fields: FieldChange[] = [];
  leafDiff('', { ...existing, evidence: null }, { ...next, evidence: null }, fields);
  const evidence: FieldChange[] = [];
  leafDiff('evidence', existing.evidence, next.evidence, evidence);
  const from = marketBasis(existing);
  const to = marketBasis(next);
  return {
    ...base,
    kind: fields.length ? 'changed' : 'refreshed',
    fields,
    evidence: evidence.filter((f) => !VOLATILE_EVIDENCE.has(f.path.slice('evidence.'.length))),
    ...(isMarketSwitch(from, to) ? { market: marketSwitchLabel(from, to) } : {}),
  };
}

/** Reasons the new offer must not replace the stored one (empty = passes the gate). */
export function gate(
  existing: Offer | undefined,
  next: Offer,
  maxChange = DEFAULT_MAX_CHANGE,
): string[] {
  if (!existing) return [];
  const reasons: string[] = [];
  const o = existing.price;
  const n = next.price;
  // a market switch (owner decision 2026-11-19: German display EUR gross <-> foreign market display
  // USD net, marked with foreign_market) may change currency and VAT mode; it is reported on its own
  // line ("Markt DE -> US") for the human check of the data PR. Its amounts are not comparable with
  // the stored ones, so the price checks below apply within the same market only.
  const from = marketBasis(existing);
  const to = marketBasis(next);
  const switched = isMarketSwitch(from, to);
  if (!switched) {
    if (existing.currency !== next.currency)
      reasons.push(`currency ${existing.currency} -> ${next.currency}`);
    // foreign_market added or removed without the switch EUR gross <-> foreign currency net
    if (from.market !== to.market) {
      const basis = (b: MarketBasis) =>
        `${b.currency}/vat_included ${b.vat_included}${b.market ? `/foreign_market ${b.market}` : ''}`;
      reasons.push(
        `foreign_market changed without a market switch (${basis(from)} -> ${basis(to)}; only EUR gross <-> ${FOREIGN_MARKET_CURRENCIES.join('/')} net with foreign_market)`,
      );
    }
  }
  if (o.unit !== n.unit) reasons.push(`unit ${o.unit} -> ${n.unit}`);
  if (
    (o.term_years ?? 1) !== (n.term_years ?? 1) ||
    (o.renewal_term_years ?? 1) !== (n.renewal_term_years ?? 1)
  ) {
    reasons.push('term years changed');
  }
  if (!switched && existing.vat_included !== next.vat_included)
    reasons.push('vat_included changed');
  if (switched) return reasons;
  // the likely cause, named in the gate message so the human check is quick. `promo` is the year-1
  // registration promo: its end explains a year1_regular jump only, not renewal or one-time fees.
  const promoEnded = Boolean(existing.promo) && next.promo === null;
  const hint = (k: (typeof GATED)[number] | (typeof GATED_INCREASE)[number]) => {
    if (k === 'year1_regular' && promoEnded) return ', stored promo ended';
    if (k === 'transfer_in') {
      return ', end of a transfer promotion or a price increase (the data records no transfer promotion: compare with the source)';
    }
    return '';
  };
  for (const k of GATED) {
    const from = o[k];
    const to = n[k];
    if (typeof from !== 'number' || typeof to !== 'number') continue; // unknown on either side
    const change = from === 0 ? (to === 0 ? 0 : Infinity) : Math.abs(to - from) / from;
    if (change > maxChange) {
      reasons.push(
        `${k} ${from} -> ${to} (${from === 0 ? 'from 0' : `${Math.round(change * 100)} %`}${hint(k)})`,
      );
    }
  }
  for (const k of GATED_INCREASE) {
    const from = o[k];
    const to = n[k];
    if (typeof from !== 'number' || typeof to !== 'number' || to <= from) continue;
    if (from === 0 || (to - from) / from > maxChange) {
      reasons.push(
        `${k} ${from} -> ${to} (${from === 0 ? 'from 0' : `+${Math.round(((to - from) / from) * 100)} %`}${hint(k)})`,
      );
    }
  }
  return reasons;
}

const readJson = <T>(file: string): T | undefined =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : undefined;

/** data/history/<provider>/<tld>.json of an offer. */
export const historyFile = (dataDir: string, provider: string, tld: string): string =>
  join(dataDir, 'history', provider, `${tld}.json`);

/** The history file to write for this offer state, or undefined when its price state is unchanged. */
export function historyChange(
  dataDir: string,
  offer: Offer,
): { file: string; value: PriceHistory } | undefined {
  const file = historyFile(dataDir, offer.provider, offer.tld);
  const { history, changed } = appendHistory(readJson<PriceHistory>(file), offer);
  return changed ? { file, value: history } : undefined;
}

/**
 * Brings data/history in line with every stored offer: seeds a missing history and appends an
 * entry where the price state changed (hand-edited offers). Writes only changed files; nothing is
 * fetched. Returns the written files and the number of unchanged histories.
 */
export async function syncHistory(
  dataDir: string,
  opts: { dryRun?: boolean } = {},
): Promise<{ written: string[]; unchanged: number }> {
  const written: string[] = [];
  let unchanged = 0;
  for (const offer of loadData(dataDir).offers) {
    const change = historyChange(dataDir, offer);
    if (!change) {
      unchanged++;
      continue;
    }
    if (!opts.dryRun) {
      mkdirSync(dirname(change.file), { recursive: true });
      writeFileSync(change.file, await formatJson(change.value, change.file));
    }
    written.push(change.file);
  }
  return { written, unchanged };
}

/** JSON as the repo's prettier config formats it (format:check runs over data/). */
export async function formatJson(value: unknown, file: string): Promise<string> {
  const config = (await resolveConfig(file)) ?? {};
  return format(JSON.stringify(value), { ...config, parser: 'json', filepath: file });
}

export async function run(opts: RunOptions): Promise<RunReport> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const maxChange = opts.maxChange ?? DEFAULT_MAX_CHANGE;
  const report: RunReport = {
    dryRun: opts.dryRun,
    startedAt: now().toISOString(),
    providers: [],
    changes: [],
    violations: [],
    requests: 0,
    written: [],
  };
  const pending: { file: string; value: unknown }[] = [];
  /** Offers this run would write (also in a dry run): they replace the stored ones in the check. */
  const scrapedOffers: Offer[] = [];
  let fetchedFx: FxRates | undefined;

  for (const adapter of opts.adapters) {
    const empty = { offers: 0, notOffered: [], skipped: [], failed: [], warnings: [] };
    if (!existsSync(join(opts.dataDir, 'providers', `${adapter.id}.json`))) {
      report.providers.push({ id: adapter.id, status: 'no-provider-file', ...empty });
      log(`${adapter.id}: skipped, no data/providers/${adapter.id}.json`);
      continue;
    }
    let result: AdapterResult;
    try {
      result = await adapter.fetch({ http: opts.http, tlds: opts.tlds, now, log });
    } catch (err) {
      report.providers.push({
        id: adapter.id,
        status: 'failed',
        error: (err as Error).message,
        ...empty,
      });
      log(`${adapter.id}: FAILED ${(err as Error).message}`);
      continue;
    }
    const providerReport: ProviderReport = {
      id: adapter.id,
      status: 'ok',
      offers: result.offers.length,
      notOffered: result.notOffered,
      skipped: result.skipped,
      failed: result.failed,
      warnings: [...result.warnings],
    };
    report.providers.push(providerReport);
    for (const scrapedOffer of result.offers) {
      const file = join(opts.dataDir, 'offers', adapter.id, `${scrapedOffer.tld}.json`);
      const existing = readJson<Offer>(file);
      const derived = checkDerivedListPrice(
        existing,
        scrapedOffer,
        now().toISOString().slice(0, 10),
      );
      const s = derived.offer;
      const next = mergeOffer(adapter.id, existing, s);
      const found: Violation[] = [];
      const add = (kind: ViolationKind, reasons: string[]) => {
        if (reasons.length)
          found.push({ provider: adapter.id, tld: s.tld, kind, reason: reasons.join('; ') });
      };
      add('blocked', s.blocked ? [s.blocked] : []);
      add('blocked', unknownFees(existing, next));
      add('promo-required', s.promoRequired && !existing?.promo ? [s.promoRequired] : []);
      add('promo-required', derived.promoRequired ? [derived.promoRequired] : []);
      add('gate', gate(existing, next, maxChange));
      // price history: an entry only when the price state changed (not on every run). An error
      // here skips this offer only; the run goes on and reports it.
      let history: ReturnType<typeof historyChange>;
      if (!found.length) {
        try {
          history = historyChange(opts.dataDir, next);
        } catch (err) {
          add('history', [(err as Error).message]);
        }
      }
      if (found.length) {
        report.violations.push(...found);
        for (const v of found) {
          if (v.kind !== 'gate')
            providerReport.warnings.push(`.${s.tld}: ${v.reason}, offer not written`);
        }
        continue;
      }
      if (derived.warning) providerReport.warnings.push(`.${s.tld}: ${derived.warning}`);
      report.changes.push(compareOffer(existing, next));
      pending.push({ file, value: next });
      if (history) pending.push(history);
      scrapedOffers.push(next);
    }
    for (const tld of result.notOffered) {
      if (existsSync(join(opts.dataDir, 'offers', adapter.id, `${tld}.json`))) {
        const reason = 'offer no longer listed by the provider (file kept)';
        report.violations.push({ provider: adapter.id, tld, kind: 'delisted', reason });
        providerReport.warnings.push(`.${tld}: ${reason}`);
      }
    }
  }

  if (opts.fx) {
    try {
      const fx = await fetchEcb(opts.http, now);
      fetchedFx = fx;
      const file = join(opts.dataDir, 'fx', `${fx.date}.json`);
      const existing = readJson<FxRates>(file);
      if (existing) {
        report.fx = { status: 'unchanged', date: fx.date };
      } else {
        report.fx = { status: 'added', date: fx.date };
        pending.push({ file, value: fx });
      }
    } catch (err) {
      report.fx = { status: 'failed', error: (err as Error).message };
    }
  }

  report.plausibility = checkPlausibility(opts, scrapedOffers, fetchedFx);
  report.requests = opts.http.requestCount;
  if (!opts.dryRun) {
    for (const { file, value } of pending) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, await formatJson(value, file));
      report.written.push(file);
    }
  }
  return report;
}

/**
 * Plausibility check over the stored data with this run's offers (and ECB rates) in place of the
 * stored ones, so a dry run checks what it would write. Never throws: a failure is reported.
 */
export function checkPlausibility(
  opts: Pick<RunOptions, 'dataDir' | 'plausibility'>,
  scraped: readonly Offer[],
  fetchedFx?: FxRates,
): PlausibilityReport {
  const low = opts.plausibility?.low ?? DEFAULT_PLAUSIBILITY_LOW;
  const high = opts.plausibility?.high ?? DEFAULT_PLAUSIBILITY_HIGH;
  const minOthers = opts.plausibility?.minOthers ?? DEFAULT_PLAUSIBILITY_MIN_OTHERS;
  try {
    const data = loadData(opts.dataDir);
    const key = (o: Offer) => `${o.provider}/${o.tld}`;
    const fresh = new Map(scraped.map((o) => [key(o), o]));
    const offers = [...data.offers.filter((o) => !fresh.has(key(o))), ...fresh.values()];
    const fx =
      fetchedFx && !data.fx.some((t) => t.date === fetchedFx.date)
        ? [...data.fx, fetchedFx]
        : data.fx;
    const { hits, uncomparable } = plausibilityCheck(offers, data.providers, fx, {
      low,
      high,
      minOthers,
    });
    return { low, high, minOthers, hits, uncomparable };
  } catch (err) {
    return { low, high, minOthers, hits: [], uncomparable: [], error: (err as Error).message };
  }
}

const euro = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/** One summary line per plausibility hit (gross EUR per year). */
export function plausibilityLines(p: PlausibilityReport | undefined): string[] {
  if (!p) return [];
  if (p.error) return [`? PLAUSIBILITY check failed: ${p.error}`];
  const reasons = new Map<string, number>();
  for (const u of p.uncomparable) reasons.set(u.reason, (reasons.get(u.reason) ?? 0) + 1);
  const uncomparable = reasons.size
    ? `, ${p.uncomparable.length} offer(s) not comparable (${[...reasons]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([r, n]) => `${n} ${r}`)
        .join(', ')})`
    : '';
  const status = `plausibility: ${p.hits.length} hit(s) (outside ${p.low.toFixed(2)}x..${p.high}x of the TLD median)${uncomparable}`;
  return [
    status,
    ...p.hits.map(
      (h) =>
        `? PLAUSIBILITY ${h.provider}/${h.tld}: ${euro(h.value)}/year gross (${h.field}) vs median ` +
        `${euro(h.median)} of ${h.others} other providers = ${h.ratio.toFixed(2)}x ` +
        `(${h.direction === 'below' ? `below ${p.low.toFixed(2)}x` : `above ${p.high}x`})`,
    ),
  ];
}

/**
 * Exit code of a run: 1 only for `gate` violations (a price jump on stored data needs a human).
 * Everything else (blocked, promo-required, delisted offers, a failed adapter, failed TLDs, a failed
 * FX fetch, plausibility hits) leaves the stored data untouched and is only reported: exit 0.
 */
export function exitCode(report: RunReport): number {
  return report.violations.some((v) => v.kind === 'gate') ? 1 : 0;
}

/** Human-readable summary (the dry-run "diff"). */
export function summarize(report: RunReport): string {
  const lines: string[] = [];
  const fmt = (v: unknown) => JSON.stringify(v);
  for (const p of report.providers) {
    lines.push(`${p.id}: ${p.status}${p.error ? ` (${p.error})` : ''}, ${p.offers} offers`);
    if (p.notOffered.length) lines.push(`  not offered: ${p.notOffered.join(', ')}`);
    for (const s of p.skipped) lines.push(`  skipped .${s.tld}: ${s.reason}`);
    for (const f of p.failed) lines.push(`  FAILED .${f.tld}: ${f.reason}`);
    for (const w of p.warnings) lines.push(`  warning: ${w}`);
  }
  const by = (k: OfferChange['kind']) => report.changes.filter((c) => c.kind === k);
  for (const c of by('added')) lines.push(`+ ${c.provider}/${c.tld} (new)`);
  const fieldLines = (fields: FieldChange[]) =>
    fields.map((f) => `    ${f.path}: ${fmt(f.from)} -> ${fmt(f.to)}`);
  for (const c of by('changed')) {
    lines.push(
      `~ ${c.provider}/${c.tld}`,
      ...(c.market ? [`    Markt ${c.market}`] : []),
      ...fieldLines(c.fields),
      ...fieldLines(c.evidence),
    );
  }
  const refreshed = by('refreshed');
  for (const c of refreshed.filter((r) => r.evidence.length)) {
    lines.push(`= ${c.provider}/${c.tld} (evidence changed)`, ...fieldLines(c.evidence));
  }
  if (refreshed.length) lines.push(`= ${refreshed.length} offers unchanged (evidence refreshed)`);
  for (const v of report.violations) {
    lines.push(`! ${v.kind.toUpperCase()} ${v.provider}/${v.tld}: ${v.reason}`);
  }
  lines.push(...plausibilityLines(report.plausibility));
  if (report.fx) {
    lines.push(
      `fx: ${report.fx.status}${report.fx.date ? ` ${report.fx.date}` : ''}${report.fx.error ? ` (${report.fx.error})` : ''}`,
    );
  }
  lines.push(
    `${report.requests} requests${report.dryRun ? ', dry run: nothing written' : `, ${report.written.length} files written`}`,
  );
  return lines.join('\n');
}
