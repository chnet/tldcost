// Portfolio calculator (Archiv-Issue 74): several TLDs × count, total per provider over N years.
// All price maths is computeTco (one domain over N years), multiplied by the count. Rules:
// - A provider that does not offer a basket TLD, or misses an input for it (e.g. the transfer
//   price), gets no total: the line says why, it is never skipped silently.
// - Order: total ascending, providers without a total last; ties by the number of complete lines
//   (more first), then provider id. No operator field: the operator cannot be treated differently.
// - New mode (owner decision 2026-11-15): a promo counts for at most promo.max_per_customer
//   domains, per TLD (limit_scope per_tld) or across all basket TLDs of the provider
//   (per_customer); limit or scope not stated: ONE promo domain in total per provider. The promo
//   goes to the smallest saving, ties by TLD id (allocatePool). limit_scope unlimited (provider
//   quote as source): every domain of that TLD gets the promo, outside the pool. Other domains pay year1_regular;
//   if the provider states none, the renewal price (assumption, line.regularFromRenewal).
// - The cheapest mix takes, per TLD, the lowest complete subtotal; ties keep every tied provider
//   (no id preference). It means several accounts.
// - Prices without a VAT statement (vat_included null) stay as stated in both modes and are
//   flagged on the line, the provider and the mix; the total must not read as gross.
import { fxRateFor } from './fx.js';
import { computeTco, MAX_TCO_YEARS, type TcoStart } from './tco.js';
import type { Cents, FxRate, FxRates, Offer, PriceMode, Provider } from './types.js';

/** new: every domain is registered new (TCO). transfer: existing domains moved in, then renewed. */
export type BasketMode = 'new' | 'transfer';

/** Upper bound of the count per TLD (input sanity, also the site's input limit; integer cents
 * stay exact far beyond it). */
export const MAX_BASKET_COUNT = 9999;

/** Most TLDs (rows) in one basket: the site's calculator and the MCP basket tool (one constant). */
export const MAX_BASKET_ROWS = 20;

export interface BasketItem {
  /** TLD without dot, lower case. */
  tld: string;
  /** Number of domains, integer 1..MAX_BASKET_COUNT. */
  count: number;
}

export interface BasketOptions {
  /** Default `gross`. */
  price?: PriceMode;
  /** Providers by id, for the VAT rate of net offers. */
  providers?: Readonly<Record<string, Pick<Provider, 'vat_rate'>>>;
  /** ECB tables; a foreign-currency offer uses the newest rate up to its fetched_at (fxRateFor). */
  fx?: readonly FxRates[];
}

/**
 * ok: complete. not_offered: the provider has no offer for the TLD. missing: an input is missing
 * or unclear (see `missing`, e.g. `price.transfer_in` or `transfer_term_unclear` in transfer mode).
 */
export type BasketLineStatus = 'ok' | 'not_offered' | 'missing';

export interface BasketLine {
  tld: string;
  count: number;
  status: BasketLineStatus;
  /** One domain over N years (EUR cents, setup included), at the promo price if any; null unless ok. */
  each: Cents | null;
  /**
   * New mode, offer with a promo: one domain over N years with year 1 at year1_regular, or, if the
   * provider states none, at the renewal price (assumption, see regularFromRenewal).
   */
  eachRegular: Cents | null;
  /**
   * Some domains pay the regular year-1 price, which the provider does not state: year 1 counted at
   * the renewal price instead (owner decision 2026-11-15, marked as an assumption).
   */
  regularFromRenewal: boolean;
  /** New mode, offer with a promo: domains counted at the promo price (0..count). null otherwise. */
  promoDomains: number | null;
  /**
   * Which promo limit applied: per_tld (stated number for this TLD), per_customer (the provider
   * pool, see BasketProvider.promoPool), unlimited (every domain of the TLD, outside the pool).
   * null: no promo.
   */
  promoScope: 'per_tld' | 'per_customer' | 'unlimited' | null;
  /** promoDomains × each + the rest × eachRegular (else each × count); null unless status ok. */
  subtotal: Cents | null;
  /** Missing inputs from computeTco; empty unless status missing. */
  missing: string[];
  /** The offer makes no VAT statement: amounts as stated. */
  vatNotStated: boolean;
  /** FX rate used (foreign-currency offers only). */
  fx: FxRate | null;
  /**
   * Transfer mode: the offer's price.transfer_includes_term (true: the transfer covers 1 year, first
   * renewal in year 2; false/null: renewal from year 1). null in new mode and for a TLD not
   * offered. true with a renewal term other than 1 year: status missing, `transfer_term_unclear`.
   */
  transferIncludesTerm: boolean | null;
}

export interface BasketProvider {
  provider: string;
  /** Sum of all subtotals; null if any line is not ok. */
  total: Cents | null;
  /** One line per basket item, in basket order. */
  lines: BasketLine[];
  /** Some line makes no VAT statement. */
  vatNotStated: boolean;
  /** The provider's shared promo budget across TLDs (null: no pooled promo in the basket). */
  promoPool: BasketPromoPool | null;
}

export interface BasketPromoPool {
  /** Promo domains in total across the pooled TLDs. */
  budget: number;
  /** Where the promo is counted (smallest saving first, ties by TLD id). */
  credited: { tld: string; domains: number }[];
  /** More pooled domains than the budget: some pay the list price in year 1. */
  limited: boolean;
}

export interface BasketMixLine {
  tld: string;
  count: number;
  /** Providers with the lowest complete subtotal for this TLD (several on a tie, id order). */
  providers: string[];
  subtotal: Cents | null;
  vatNotStated: boolean;
  /** A chosen line counts year 1 at the renewal price (list price not stated). */
  regularFromRenewal: boolean;
}

export interface BasketResult {
  years: number;
  mode: BasketMode;
  price: PriceMode;
  currency: 'EUR';
  /** Providers with an offer for at least one basket TLD, cheapest total first. */
  providers: BasketProvider[];
  /** Cheapest provider per TLD; total null if some TLD has no complete line anywhere. */
  mix: { total: Cents | null; lines: BasketMixLine[]; vatNotStated: boolean };
}

/**
 * Year 1 is a promo: below the list price, or a promo with conditions or an end date (same rule as
 * the table's promo badge and footnote).
 */
export function isPromo(offer: Offer): boolean {
  const { year1, year1_regular: regular } = offer.price;
  const belowList = typeof year1 === 'number' && typeof regular === 'number' && year1 < regular;
  const promo = offer.promo;
  return belowList || Boolean(promo && (promo.conditions || promo.valid_until));
}

/** Code-unit order of provider ids (unique here, so never 0). */
const ids = (a: string, b: string) => (a < b ? -1 : 1);
const TLD = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

function checkBasket(basket: readonly BasketItem[]): void {
  const seen = new Set<string>();
  for (const { tld, count } of basket) {
    if (!TLD.test(tld)) throw new RangeError(`basket: invalid TLD "${tld}"`);
    if (seen.has(tld)) throw new RangeError(`basket: .${tld} listed twice`);
    seen.add(tld);
    if (!Number.isInteger(count) || count < 1 || count > MAX_BASKET_COUNT) {
      throw new RangeError(`basket: count for .${tld} must be an integer 1..${MAX_BASKET_COUNT}`);
    }
  }
}

interface Draft {
  line: BasketLine;
  /** eachRegular is computed with the renewal price as year 1 (year1_regular not stated). */
  assumed?: boolean;
  /** Promo in the provider pool: its limit (stated per-customer number, else 1). null: no pool. */
  poolLimit: number | null;
}

/**
 * Promo pool of one provider (owner decision 2026-11-15): promos limited per customer, or with the
 * limit or the scope not stated, share ONE budget across all basket TLDs of the provider: the
 * smallest stated limit, 1 if any is not stated. The promo domains go to the TLD with the
 * SMALLEST saving per domain (eachRegular - each) first, ties by TLD id ascending, so the total is
 * never undercounted. Sets line.promoDomains of the pooled lines.
 */
function allocatePool(drafts: Draft[]): BasketPromoPool | null {
  const pooled = drafts.filter((d) => d.poolLimit !== null);
  if (pooled.length === 0) return null;
  const budget = Math.min(...pooled.map((d) => d.poolLimit as number));
  const ok = pooled.filter((d) => d.line.status === 'ok').map((d) => d.line);
  const domains = ok.reduce((n, l) => n + l.count, 0);
  const limited = domains > budget;
  // a pooled line without list price and without renewal price has no known saving: with a limit
  // that bites, the allocation cannot be decided, so that line is missing (k. A.)
  const known = ok.filter((l) => {
    if (!limited || l.eachRegular !== null) return true;
    l.status = 'missing';
    l.missing.push('price.year1_regular');
    return false;
  });
  const saving = (l: BasketLine) => (l.eachRegular as Cents) - (l.each as Cents);
  const byTld = (a: BasketLine, b: BasketLine) => Number(a.tld > b.tld) - Number(a.tld < b.tld);
  known.sort((a, b) => (limited ? saving(a) - saving(b) : 0) || byTld(a, b));
  let remaining = budget;
  const credited: { tld: string; domains: number }[] = [];
  for (const l of known) {
    const give = Math.min(l.count, remaining);
    l.promoDomains = give;
    remaining -= give;
    if (give > 0) credited.push({ tld: l.tld, domains: give });
  }
  return { budget, credited, limited };
}

/**
 * Cost of a domain portfolio per provider over `years` (1..10), in EUR cents, gross by default.
 * `offers` are all offers (any provider, any TLD); only the basket TLDs are used.
 */
export function computeBasket(
  offers: readonly Offer[],
  basket: readonly BasketItem[],
  years: number,
  mode: BasketMode,
  options: BasketOptions = {},
): BasketResult {
  if (!Number.isInteger(years) || years < 1 || years > MAX_TCO_YEARS) {
    throw new RangeError(`years must be an integer 1..${MAX_TCO_YEARS}, got ${years}`);
  }
  if (mode !== 'new' && mode !== 'transfer') throw new RangeError(`unknown basket mode ${mode}`);
  checkBasket(basket);
  const price = options.price ?? 'gross';
  const start: TcoStart = mode === 'transfer' ? 'transfer' : 'registration';
  const wanted = new Set(basket.map((b) => b.tld));

  const byProvider = new Map<string, Map<string, Offer>>();
  for (const o of offers) {
    if (!wanted.has(o.tld)) continue;
    const m = byProvider.get(o.provider) ?? new Map<string, Offer>();
    if (m.has(o.tld)) throw new RangeError(`offers: ${o.provider}/${o.tld} listed twice`);
    m.set(o.tld, o);
    byProvider.set(o.provider, m);
  }

  const providers: BasketProvider[] = [...byProvider].map(([provider, tlds]) => {
    const drafts = basket.map(({ tld, count }): Draft => {
      const offer = tlds.get(tld);
      if (!offer) {
        const line: BasketLine = {
          tld,
          count,
          status: 'not_offered',
          each: null,
          eachRegular: null,
          regularFromRenewal: false,
          promoDomains: null,
          promoScope: null,
          subtotal: null,
          missing: [],
          vatNotStated: false,
          fx: null,
          transferIncludesTerm: null,
        };
        return { line, poolLimit: null };
      }
      const fx =
        offer.currency === 'EUR'
          ? undefined
          : fxRateFor(options.fx ?? [], offer.currency, offer.evidence.fetched_at);
      const p = options.providers?.[provider];
      const tcoOptions = {
        mode: price,
        start,
        ...(p ? { provider: p } : {}),
        ...(fx ? { fx } : {}),
      };
      const tco = computeTco(offer, years, tcoOptions);
      // new mode only: transfers never get a promo
      const promo = mode === 'new' && isPromo(offer);
      let eachRegular: Cents | null = null;
      // year 1 without promo: year1_regular; not stated: the renewal price (assumption), but only
      // when the first term equals the renewal term (else one renewal term's price would pay for a
      // longer first term: too low); otherwise unknown (k. A. where it is needed)
      const statedRegular = offer.price.year1_regular ?? null;
      const sameTerms = (offer.price.term_years ?? 1) === (offer.price.renewal_term_years ?? 1);
      const regularYear1 = statedRegular ?? (sameTerms ? offer.price.renewal : null);
      if (promo && regularYear1 !== null) {
        const regular = { ...offer, price: { ...offer.price, year1: regularYear1 } };
        eachRegular = computeTco(regular, years, tcoOptions).sum;
      }
      const assumed = promo && statedRegular === null && eachRegular !== null;
      const max = offer.promo?.max_per_customer ?? null;
      const scope = offer.promo?.limit_scope ?? null;
      // per_tld with a stated number: that TLD on its own. unlimited (owner decision 2026-11-15):
      // every domain of the TLD, outside the pool, but only with the provider's verbatim quote and
      // no number (else fail closed: the TLD joins the pool). Everything else joins the pool.
      const perTld = promo && scope === 'per_tld' && max !== null;
      const unlimited =
        promo &&
        scope === 'unlimited' &&
        max === null &&
        Boolean(offer.promo?.max_per_customer_source?.quote?.trim());
      const line: BasketLine = {
        tld,
        count,
        status: tco.sum === null ? 'missing' : 'ok',
        each: tco.sum,
        eachRegular,
        regularFromRenewal: false,
        promoDomains: unlimited ? count : perTld ? Math.min(count, max) : promo ? 0 : null,
        promoScope: unlimited ? 'unlimited' : perTld ? 'per_tld' : promo ? 'per_customer' : null,
        subtotal: null,
        missing: [...tco.missing],
        vatNotStated: tco.vatNotStated,
        fx: tco.fx,
        transferIncludesTerm:
          mode === 'transfer' ? (offer.price.transfer_includes_term ?? null) : null,
      };
      // pool limit: a stated per-customer number, else (limit or scope not stated) ONE in total
      const poolLimit =
        promo && !perTld && !unlimited
          ? scope === 'per_customer' && max !== null
            ? max
            : 1
          : null;
      return { line, poolLimit, assumed };
    });

    const promoPool = allocatePool(drafts);

    for (const { line, assumed } of drafts) {
      if (line.status !== 'ok') continue;
      const atPromo = line.promoDomains ?? line.count;
      const rest = line.count - atPromo;
      if (rest > 0 && line.eachRegular === null) {
        // some domains pay the list price in year 1, but neither it nor the renewal is known
        line.status = 'missing';
        line.missing.push('price.year1_regular');
        continue;
      }
      line.regularFromRenewal = rest > 0 && assumed === true;
      line.subtotal = (line.each as Cents) * atPromo + (line.eachRegular ?? 0) * rest;
    }
    const lines = drafts.map((d) => d.line);
    const complete = lines.every((l) => l.status === 'ok');
    return {
      provider,
      total: complete ? lines.reduce((acc, l) => acc + (l.subtotal as Cents), 0) : null,
      lines,
      vatNotStated: lines.some((l) => l.vatNotStated),
      promoPool,
    };
  });

  const okCount = (p: BasketProvider) => p.lines.filter((l) => l.status === 'ok').length;
  providers.sort((a, b) => {
    if (a.total !== b.total) {
      if (a.total === null) return 1;
      if (b.total === null) return -1;
      return a.total - b.total;
    }
    return okCount(b) - okCount(a) || ids(a.provider, b.provider);
  });

  const mixLines = basket.map(({ tld, count }, i): BasketMixLine => {
    let subtotal: Cents | null = null;
    let best: BasketLine[] = [];
    for (const p of providers) {
      const line = p.lines[i] as BasketLine;
      if (line.subtotal === null) continue;
      if (subtotal === null || line.subtotal < subtotal) {
        subtotal = line.subtotal;
        best = [line];
      } else if (line.subtotal === subtotal) best.push(line);
    }
    const names = providers
      .filter((p) => best.includes(p.lines[i] as BasketLine))
      .map((p) => p.provider)
      .sort(ids);
    return {
      tld,
      count,
      providers: names,
      subtotal,
      vatNotStated: best.some((l) => l.vatNotStated),
      regularFromRenewal: best.some((l) => l.regularFromRenewal),
    };
  });
  const mixComplete = mixLines.length > 0 && mixLines.every((l) => l.subtotal !== null);
  return {
    years,
    mode,
    price,
    currency: 'EUR',
    providers,
    mix: {
      total: mixComplete ? mixLines.reduce((acc, l) => acc + (l.subtotal as Cents), 0) : null,
      lines: mixLines,
      vatNotStated: mixLines.some((l) => l.vatNotStated),
    },
  };
}
