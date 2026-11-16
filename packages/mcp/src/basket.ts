// The MCP tool `basket` (Archiv-Issue 67, after Archiv-Issue 74): cost of a domain portfolio (several TLDs x count) per
// provider over N years. All maths is @tldcost/core computeBasket, the function behind the site's
// portfolio calculator, fed with the same inputs the site embeds: every offer, the providers' VAT
// rates and the ECB tables (API document all.json). Input semantics follow the calculator: basket,
// years, vat (gross/net), mode (new/transfer).
//
// The calculator's rules come back as notes (site footnotes, in English):
// - transfer mode: transfer fee plus the renewal price from year 1, unless the provider states that
//   the transfer includes a term; new-registration promos do not apply to transfers;
// - promos count only up to the stated limit (per TLD or per customer); limit or scope not stated:
//   ONE promo domain per provider in total, credited where the saving is smallest; a provider
//   statement "no limit" (limit_scope unlimited) gives every domain of that TLD the promo; without a stated
//   regular year-1 price the other domains pay the renewal price in year 1 (marked assumption);
// - a provider without an offer or with a missing input for a basket TLD gets no total (`k. A.` on
//   the site), with the reason per line.
// Neutral wording as in the other tools: a price order, never a rating. The operator's offer is
// marked and sorted like any other (computeBasket does not even see the flag).
import {
  computeBasket,
  MAX_BASKET_COUNT,
  MAX_BASKET_ROWS,
  type BasketLine,
  type BasketMode,
  type BasketPromoPool,
  type FxRate,
  type Offer,
  type PriceMode,
} from '@tldcost/core';
import type { ApiClient } from './api.js';
import { parseTld, parseVat, parseYears, sourceOf, ToolInputError } from './tools.js';

/** Most TLDs in one basket: the core limit, also the site calculator's. */
export { MAX_BASKET_ROWS };
const MODES: readonly BasketMode[] = ['new', 'transfer'];

const eur = (cents: number | null): number | null => (cents === null ? null : cents / 100);

export interface BasketInput {
  tld: string;
  count: number;
}

/** [{tld, count}] with unique TLDs (normalised like the other tools), 1..MAX_BASKET_ROWS rows. */
export function parseBasket(value: unknown): BasketInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BASKET_ROWS) {
    throw new ToolInputError(
      `basket must be a list of 1..${MAX_BASKET_ROWS} items like {"tld": "de", "count": 10}`,
    );
  }
  const out: BasketInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ToolInputError('basket items must be objects like {"tld": "de", "count": 10}');
    }
    const { tld: rawTld, count, ...rest } = item as Record<string, unknown>;
    if (Object.keys(rest).length > 0) {
      throw new ToolInputError(`unknown basket item field(s): ${Object.keys(rest).join(', ')}`);
    }
    const tld = parseTld(rawTld);
    if (
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_BASKET_COUNT
    ) {
      throw new ToolInputError(`count for .${tld} must be an integer 1..${MAX_BASKET_COUNT}`);
    }
    if (out.some((b) => b.tld === tld)) throw new ToolInputError(`.${tld} is listed twice`);
    out.push({ tld, count });
  }
  return out;
}

export function parseMode(value: unknown): BasketMode {
  if (value === undefined) return 'new';
  if (!MODES.includes(value as BasketMode)) {
    throw new ToolInputError('mode must be "new" (register) or "transfer" (move existing domains)');
  }
  return value as BasketMode;
}

const fxText = (fx: FxRate) =>
  `Converted from ${fx.currency} at the ECB reference rate of ${fx.date} (1 EUR = ${fx.perEur} ${fx.currency}).`;

/** Year 1 at a promo price: the provider's condition verbatim and a stated per-TLD limit. */
export function promoNote(offer: Offer, unlimited = false): string {
  const c = offer.promo?.conditions?.trim();
  const until = offer.promo?.valid_until;
  const max = offer.promo?.max_per_customer;
  const parts = [`Year 1 of .${offer.tld} is a promotional price${c ? `: „${c}“` : '.'}`];
  if (until) parts.push(`Valid until ${until}.`);
  if (typeof max === 'number' && offer.promo?.limit_scope === 'per_tld') {
    parts.push(
      `According to the provider it applies to at most ${max} ${max === 1 ? 'domain' : 'domains'} ` +
        'of this TLD; further domains are counted at the regular price in year 1.',
    );
  }
  if (unlimited) {
    // as decided by core (promoScope unlimited): the provider's quote, unless it is the condition
    const q = offer.promo?.max_per_customer_source?.quote?.trim();
    parts.push(
      `According to the provider there is no limit per customer${q && q !== c ? ` (provider’s wording, German: “${q}”)` : ''}; ` +
        'every domain of this TLD is counted at the promotional price.',
    );
  }
  return parts.join(' ');
}

/** The provider's promo budget is shared across the basket TLDs and smaller than the domains. */
export function poolNote(pool: BasketPromoPool): string {
  if (pool.budget === 1) {
    const where = pool.credited.map((c) => `.${c.tld}`).join(', ');
    return (
      `Promotion only once per customer; counted for ${where}. ` +
      'If it applies to another TLD instead, the total can be lower.'
    );
  }
  const counted = pool.credited.map((c) => `.${c.tld} (${c.domains})`).join(', ');
  return (
    `Promotion for at most ${pool.budget} domains per customer; counted for ${counted}. ` +
    'If it applies to other TLDs instead, the total can be lower.'
  );
}

/** The provider states that the transfer includes a term: quote and source as recorded. */
export function transferTermNote(offer: Offer): string {
  const src = offer.price.transfer_includes_term_source;
  const parts = [
    `According to the provider, the transfer of .${offer.tld} includes a term; the first renewal is due after it.`,
  ];
  if (src?.quote) parts.push(`„${src.quote}“`);
  if (src?.url) parts.push(`Source: ${src.url}`);
  return parts.join(' ');
}

const NOTE_TRANSFER =
  'Transfer mode: the transfer fee plus the renewal price from year 1, unless the provider states ' +
  'that the transfer includes a term. Promotional prices for new registrations do not apply to ' +
  'transfers.';
const NOTE_PROMO_LIMIT =
  'Promotional prices count only for as many domains as the provider allows (per TLD or per ' +
  'customer). Where the provider states that there is no limit (verbatim quote), every domain of ' +
  'that TLD gets the promotional price, outside the per-customer budget. Where the limit or its ' +
  'scope is not stated, ONE promotional domain per provider is counted in total; the other ' +
  'domains pay the regular price in year 1. Where the provider states ' +
  'no regular year-1 price, the renewal price is used instead (an assumption, marked per line), ' +
  'but only if the registration and renewal terms are equal (e.g. not for a 2-year first term ' +
  'with yearly renewals); otherwise, or without a renewal price, the total is unknown (null).';
/** Same wording as the site's English footnote (basket.notes.regularFromRenewal in i18n/en.ts). */
export const NOTE_REGULAR_FROM_RENEWAL =
  'Regular first-year price not stated; calculated with the renewal price.';
const NOTE_MISSING =
  'A provider without an offer for a basket TLD, or with a missing input (see `missing`), has no ' +
  'total (null); the lines say why.';
const NOTE_VAT_NOT_STATED =
  'The provider makes no VAT statement: prices are taken as stated, gross and net equal; such a ' +
  'total must not be read as gross.';
const NOTE_MONTHLY = 'The provider states monthly prices; the totals annualise them (x 12).';
const NOTE_MIX =
  'Mix: per TLD the provider(s) with the lowest complete subtotal (all of them on a tie). This means ' +
  'several customer accounts; effort for transfers and administration is not included.';

function lineView(line: BasketLine, offer: Offer | undefined) {
  const notes: string[] = [];
  if (offer && line.promoDomains !== null && line.subtotal !== null) {
    notes.push(promoNote(offer, line.promoScope === 'unlimited'));
  }
  if (offer && line.transferIncludesTerm === true && line.subtotal !== null) {
    notes.push(transferTermNote(offer));
  }
  if (line.regularFromRenewal) notes.push(NOTE_REGULAR_FROM_RENEWAL);
  // the conversion note only where the line shows a converted amount
  const converted = [line.subtotal, line.each, line.eachRegular].some((v) => v !== null);
  if (line.fx && converted) notes.push(fxText(line.fx));
  return {
    tld: line.tld,
    count: line.count,
    status: line.status,
    subtotal_eur: eur(line.subtotal),
    each_eur: eur(line.each),
    each_at_regular_year1_eur: eur(line.eachRegular),
    regular_year1_from_renewal: line.regularFromRenewal,
    promo_domains: line.promoDomains,
    promo_scope: line.promoScope,
    missing: line.missing,
    vat_not_stated: line.vatNotStated,
    raw_unit: offer?.price.unit ?? null,
    raw_currency: offer?.currency ?? null,
    transfer_includes_term: line.transferIncludesTerm,
    source_url: offer?.evidence.source_url ?? null,
    fetched_at: offer?.evidence.fetched_at ?? null,
    notes,
  };
}

export async function basket(api: ApiClient, args: Record<string, unknown>) {
  const items = parseBasket(args.basket);
  const years = parseYears(args.years);
  const vat: PriceMode = parseVat(args.vat);
  const mode = parseMode(args.mode);
  const f = await api.all();
  const { offers, providers, fx } = f.doc;
  const known = new Set(offers.map((o) => o.tld));
  const unknown = items.filter((b) => !known.has(b.tld)).map((b) => `.${b.tld}`);
  if (unknown.length > 0) {
    throw new ToolInputError(
      `no offers for ${unknown.join(', ')} (list_tlds shows the TLDs with data)`,
    );
  }
  const vatRates = Object.fromEntries(providers.map((p) => [p.id, { vat_rate: p.vat_rate }]));
  const result = computeBasket(offers, items, years, mode, { price: vat, providers: vatRates, fx });
  const offerOf = new Map(offers.map((o) => [`${o.provider}/${o.tld}`, o]));
  const meta = new Map(providers.map((p) => [p.id, p]));

  const general = [NOTE_MISSING, NOTE_MIX];
  if (mode === 'transfer') general.unshift(NOTE_TRANSFER);
  else if (result.providers.some((p) => p.lines.some((l) => l.promoDomains !== null))) {
    general.unshift(NOTE_PROMO_LIMIT);
  }
  let vatNotStated = false;
  let monthly = false;

  const rows = result.providers.map((p, i) => {
    const lines = p.lines.map((l) => {
      const offer = offerOf.get(`${p.provider}/${l.tld}`);
      if (offer?.price.unit === 'month') monthly = true;
      return lineView(l, offer);
    });
    if (p.vatNotStated) vatNotStated = true;
    const notes: string[] = [];
    if (p.promoPool?.limited && p.total !== null) notes.push(poolNote(p.promoPool));
    return {
      position: i + 1,
      provider: p.provider,
      provider_name: meta.get(p.provider)?.name ?? p.provider,
      operator: meta.get(p.provider)?.operator === true,
      total_eur: eur(p.total),
      complete: p.total !== null,
      vat_not_stated: p.vatNotStated,
      promo_pool: p.promoPool,
      notes,
      lines,
    };
  });
  if (vatNotStated) general.push(NOTE_VAT_NOT_STATED);
  if (monthly) general.push(NOTE_MONTHLY);

  return {
    basket: items,
    years,
    vat,
    mode,
    currency: 'EUR',
    note:
      `Totals over ${years} year(s), lowest first; providers without a complete total last. ` +
      'The order is a price order, not a recommendation; check promotions and contract terms (get_provider).',
    notes: general,
    providers: rows,
    mix: {
      total_eur: eur(result.mix.total),
      vat_not_stated: result.mix.vatNotStated,
      lines: result.mix.lines.map((l) => ({
        tld: l.tld,
        count: l.count,
        providers: l.providers,
        subtotal_eur: eur(l.subtotal),
        vat_not_stated: l.vatNotStated,
        regular_year1_from_renewal: l.regularFromRenewal,
      })),
    },
    source: sourceOf(f),
  };
}
