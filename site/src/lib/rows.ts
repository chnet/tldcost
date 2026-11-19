// Build time only: data/ (via @tldcost/core) -> SitePayload. All price maths is in @tldcost/core;
// this file only maps core results to table columns. No own rounding or VAT logic.
import {
  computeTco,
  isPromo,
  effectiveContract,
  fxRateFor,
  offerMarket,
  normalizePrice,
  type Cents,
  type ContractField,
  type CostedFeature,
  type FxRate,
  type Offer,
  type PriceMode,
  type Provider,
} from '@tldcost/core';
import type { TldcostData } from '@tldcost/core/load';
import { LOCALES, type SiteLocale } from '../i18n';
import type {
  NoteText,
  PaidFeature,
  PayloadRow,
  ProviderMeta,
  RowDetail,
  SitePayload,
} from './payload';
import { compareIds, type SortKey } from './sort';

/** TLD order of the concept (section 3.5); TLDs not listed follow alphabetically. */
export const TLD_ORDER = [
  'de', 'com', 'net', 'org', 'eu', 'io', 'dev', 'app', 'shop', 'info',
  'at', 'ch', 'me', 'co', 'online', 'berlin', 'xyz', 'ai', 'biz', 'cloud',
]; // prettier-ignore

export function orderTlds(tlds: Iterable<string>): string[] {
  const rank = (t: string) => {
    const i = TLD_ORDER.indexOf(t);
    return i === -1 ? TLD_ORDER.length : i;
  };
  return [...new Set(tlds)].sort((a, b) => rank(a) - rank(b) || compareIds(a, b));
}

const regionNames = {
  de: new Intl.DisplayNames(['de'], { type: 'region' }),
  en: new Intl.DisplayNames(['en'], { type: 'region' }),
};
/** Country name in `lang` for an ISO 3166-1 alpha-2 code; the code itself if unknown. */
export function countryName(code: string, lang: 'de' | 'en' = 'de'): string {
  try {
    return regionNames[lang].of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const NOTE_VAT_NOT_STATED = 'vat-not-stated';
export const NOTE_MONTHLY = 'unit-month';
export const noteVatNet = (rate: number) => `vat-net-${rate}`;
export const noteVatGross = (rate: number) => `vat-gross-${rate}`;
/** Registration and renewal terms in years; only used when one of them is longer than 1 year. */
export const noteTermYears = (term: number, renewalTerm: number) =>
  `term-years-${term}-${renewalTerm}`;
/** Footnote ids are used as URL fragments and element ids: only [a-z0-9-]. */
export const notePromo = (key: string) => `promo-${key.replace(/[^a-z0-9-]/gi, '-')}`;
export const noteTerms = (providerId: string, field: ContractField) =>
  `terms-${providerId}-${field}`;
export const noteCountry = (providerId: string) => `country-${providerId}`;

/** Money and TCO columns (all VAT-dependent cells). */
const PRICE_COLUMNS = [
  'setup', 'year1', 'year2', 'year3', 'sum_2y', 'sum_3y', 'sum_5y',
  'renewal', 'transfer_in', 'transfer_out',
]; // prettier-ignore
/** Sum cells: monthly prices are annualised there without a monthly second line. */
const SUM_COLUMNS = ['sum_2y', 'sum_3y', 'sum_5y'];
/** Cells whose amounts depend on multi-year terms: the year payments and the sums (the renewal
 * cell only when the renewal term itself is longer than 1 year). */
const TERM_COLUMNS = ['year1', 'year2', 'year3', ...SUM_COLUMNS];
/**
 * Value keys that get the provider's monthly price as a second line (`<key>_month`) when the offer
 * states monthly prices. The annualised value stays the cell value (sorting is unchanged).
 */
export const MONTHLY_COLUMNS = ['year1', 'year2', 'year3', 'renewal', 'year1_regular'] as const;
export const monthKey = (col: string) => `${col}_month`;
/** Cells that contain the year-1 payment, i.e. a promotional price. */
const PROMO_COLUMNS = ['year1', 'sum_2y', 'sum_3y', 'sum_5y'];
/** Contract field of the data -> table column. */
export const CONTRACT_COLUMNS: Readonly<Record<ContractField, string>> = {
  min_term_months: 'min_term_months',
  notice_period_days: 'notice_days',
  billing_cycle: 'billing_cycle',
  auto_renew_default: 'auto_renew',
};
const CONTRACT_FIELDS = Object.keys(CONTRACT_COLUMNS) as ContractField[];

/**
 * Feature field that may carry a feature_costs entry -> table column, in column order (the row
 * detail lists paid features in this order, Archiv-Issue 124).
 */
export const FEATURE_COST_COLUMNS: Readonly<Record<CostedFeature, string>> = {
  ssl_free: 'ssl_free',
  forward_301: 'fwd_301',
  forward_302: 'fwd_302',
  dns_editor: 'dns_editor',
  custom_ns: 'custom_ns',
  dnssec: 'dnssec',
  email_forwarding: 'email_fwd',
  whois_privacy: 'whois_privacy',
  api: 'api',
};

/** Paid features of an offer with their stated source and price (display only, Archiv-Issue 124). */
export function paidFeatures(offer: Offer): PaidFeature[] {
  const out: PaidFeature[] = [];
  for (const [field, col] of Object.entries(FEATURE_COST_COLUMNS) as [CostedFeature, string][]) {
    const cost = offer.feature_costs?.[field];
    if (!cost || offer.features?.[field] !== 'paid') continue;
    out.push({
      col,
      price: cost.price_cents ?? null,
      unit: cost.unit ?? null,
      note: cost.note ?? null,
      quote: cost.source.quote,
      quoteLang: cost.source.lang ?? 'de',
      url: cost.source.url,
    });
  }
  return out;
}

/** Year 1 is a promotional price: one rule in core, shared with the portfolio calculator. */
export { isPromo };

/** The promo has an end date before `today` (YYYY-MM-DD; valid_until is the last valid day). */
export function isPromoExpired(offer: Offer, today: string): boolean {
  const until = offer.promo?.valid_until;
  return typeof until === 'string' && until.slice(0, 10) < today;
}

function promoText(L: SiteLocale, offer: Offer, expired: boolean): NoteText {
  const c = offer.promo?.conditions?.trim();
  const until = offer.promo?.valid_until;
  if (expired && until) {
    return L.s.notes.promoExpired(L.f.date(offer.evidence.fetched_at), L.f.date(until));
  }
  return L.s.notes.promo(c || null, until ? L.f.date(until) : null);
}

function addCellNote(target: Record<string, string[]>, col: string, id: string): void {
  const list = (target[col] ??= []);
  if (!list.includes(id)) list.push(id);
}

/** One amount outside the TCO (renewal list price, transfers), same rules as computeTco. */
function convert(
  amount: Cents | null | undefined,
  offer: Offer,
  provider: Provider,
  mode: PriceMode,
  fx: FxRate | undefined,
  recurring: boolean,
): Cents | null {
  if (amount === null || amount === undefined) return null;
  try {
    return normalizePrice(amount, {
      currency: offer.currency,
      // vat_included null (no VAT statement): the price is used as stated in both modes
      vatIncluded: offer.vat_included ?? mode === 'gross',
      // provider vat_rate null (non-EU, no stated rate): missing, so a needed conversion gives null
      vatRate: offer.vat_rate ?? provider.vat_rate ?? undefined,
      unit: recurring ? offer.price.unit : 'year',
      mode,
      fx,
    });
  } catch {
    return null; // missing VAT rate or FX rate: unknown, never a guess
  }
}

function modeValues(
  offer: Offer,
  provider: Provider,
  mode: PriceMode,
  fx: FxRate | undefined,
): Record<string, SortKey> {
  const opts = { mode, provider, ...(fx ? { fx } : {}) };
  const t2 = computeTco(offer, 2, opts);
  const t3 = computeTco(offer, 3, opts);
  const t5 = computeTco(offer, 5, opts);
  return {
    setup: t3.setup,
    year1: t3.perYear[0] ?? null,
    year2: t3.perYear[1] ?? null,
    year3: t3.perYear[2] ?? null,
    sum_2y: t2.sum,
    sum_3y: t3.sum,
    sum_5y: t5.sum,
    avg_2y: t2.avg,
    avg_3y: t3.avg,
    avg_5y: t5.avg,
    renewal: convert(offer.price.renewal, offer, provider, mode, fx, true),
    year1_regular: convert(offer.price.year1_regular, offer, provider, mode, fx, true),
    transfer_in: convert(offer.price.transfer_in, offer, provider, mode, fx, false),
    transfer_out: convert(offer.price.transfer_out, offer, provider, mode, fx, false),
    ...(offer.price.unit === 'month' ? monthValues(offer, provider, mode, fx) : {}),
  };
}

/**
 * The provider's monthly amounts in the selected VAT mode (EUR cents, not multiplied by 12), for
 * the second line under the annualised value. Same VAT and FX rules as the year values; each
 * monthly amount is rounded on its own, so 12 x monthly can differ from the year value by a few
 * cents.
 */
function monthValues(
  offer: Offer,
  provider: Provider,
  mode: PriceMode,
  fx: FxRate | undefined,
): Record<string, SortKey> {
  const p = offer.price;
  const raw: Record<(typeof MONTHLY_COLUMNS)[number], Cents | null | undefined> = {
    year1: p.year1,
    year2: p.year2 ?? p.renewal,
    year3: p.year3 ?? p.renewal,
    renewal: p.renewal,
    year1_regular: p.year1_regular,
  };
  return Object.fromEntries(
    MONTHLY_COLUMNS.map((col) => [
      monthKey(col),
      convert(raw[col], offer, provider, mode, fx, false),
    ]),
  );
}

/**
 * Data older than this many days at build time is marked "veraltet" (tc-stale). The collection
 * runs weekly, so two missed runs.
 */
export const STALE_DATA_DAYS = 14;

/** YYYY-MM-DD `days` before `isoDate` (UTC). */
function daysBefore(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface BuildOptions {
  /** Reference date for expired promos (YYYY-MM-DD). Default: the build date (UTC). */
  today?: string;
  /** Language of the footnotes and country names (Archiv-Issue 33). Default: German. */
  locale?: SiteLocale;
}

export function buildPayload(data: TldcostData, options: BuildOptions = {}): SitePayload {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const L = options.locale ?? LOCALES.de;
  const pct = (bp: number) => L.f.decimal(bp / 100);
  const staleBefore = daysBefore(today, STALE_DATA_DAYS);
  const providerById = new Map(data.providers.map((p) => [p.id, p]));
  const notes: Record<string, NoteText> = {};
  const rows: PayloadRow[] = [];
  const used = new Set<string>();

  for (const offer of data.offers) {
    const provider = providerById.get(offer.provider);
    if (!provider) continue; // validate-data rejects this; never render an orphan
    used.add(provider.id);

    const rowNotes: string[] = [];
    let fx: FxRate | undefined;
    // another market's prices (owner decision 2026-11-19): a note per VAT mode on the price cells
    // (conversion, and in gross mode the added VAT), in place of the generic FX note and the
    // net-price note
    const market = offerMarket(offer);
    const vatRate = offer.vat_rate ?? provider.vat_rate;
    let marketFx: FxRate | undefined;
    if (offer.currency !== 'EUR') {
      fx = fxRateFor(data.fx, offer.currency, offer.evidence.fetched_at);
      if (market && fx && typeof vatRate === 'number') {
        marketFx = fx;
      } else {
        const id = fx ? `fx-${fx.currency}-${fx.date}` : `fx-missing-${offer.currency}`;
        notes[id] = fx
          ? L.s.notes.fx(fx.currency, L.f.date(fx.date), L.f.decimal(fx.perEur))
          : L.s.notes.fxMissing(offer.currency);
        rowNotes.push(id);
      }
    }
    if (offer.vat_included === null) {
      notes[NOTE_VAT_NOT_STATED] = L.s.notes.vatNotStated;
      rowNotes.push(NOTE_VAT_NOT_STATED);
    }

    const key = `${offer.provider}/${offer.tld}`;
    const gross = modeValues(offer, provider, 'gross', fx);
    const net = modeValues(offer, provider, 'net', fx);
    const cellNotes: PayloadRow['cellNotes'] = { gross: {}, net: {} };
    const promo = isPromo(offer);
    // an expired promo keeps its footnote (the stored year-1 price is still the promo price) but
    // loses the badge
    const promoExpired = promo && isPromoExpired(offer, today);
    for (const mode of ['gross', 'net'] as const) {
      const values = mode === 'gross' ? gross : net;
      const target = cellNotes[mode];
      const has = (col: string) => values[col] !== null && values[col] !== undefined;
      if (promo) {
        notes[notePromo(key)] = promoText(L, offer, promoExpired);
        for (const col of PROMO_COLUMNS) if (has(col)) addCellNote(target, col, notePromo(key));
      }
      const rate = vatRate;
      if (marketFx && typeof rate === 'number') {
        const date = L.f.date(marketFx.date);
        const id =
          mode === 'gross'
            ? `market-${market}-${marketFx.currency}-${marketFx.date}-${rate}`
            : `market-net-${market}-${marketFx.currency}-${marketFx.date}`;
        notes[id] =
          mode === 'gross'
            ? L.s.notes.foreignMarket(market as string, date, pct(rate))
            : L.s.notes.foreignMarketNet(market as string, date);
        for (const col of PRICE_COLUMNS) if (has(col)) addCellNote(target, col, id);
      }
      // net prices of the provider, shown gross: VAT was added (only in gross mode; for another
      // market's prices the market note says so)
      if (
        mode === 'gross' &&
        offer.vat_included === false &&
        typeof rate === 'number' &&
        !marketFx
      ) {
        const id = noteVatNet(rate);
        notes[id] = L.s.notes.vatNet(pct(rate));
        for (const col of PRICE_COLUMNS) if (has(col)) addCellNote(target, col, id);
      }
      // gross prices of the provider, shown net: VAT was taken out (only in net mode)
      if (mode === 'net' && offer.vat_included === true && typeof rate === 'number') {
        const id = noteVatGross(rate);
        notes[id] = L.s.notes.vatGross(pct(rate));
        for (const col of PRICE_COLUMNS) if (has(col)) addCellNote(target, col, id);
      }
      // a payment covers several years: the table shows it in the year it is due (methodik)
      const term = offer.price.term_years ?? 1;
      const renewalTerm = offer.price.renewal_term_years ?? 1;
      if (term > 1 || renewalTerm > 1) {
        const id = noteTermYears(term, renewalTerm);
        notes[id] = L.s.notes.termYears(term, renewalTerm);
        for (const col of TERM_COLUMNS) if (has(col)) addCellNote(target, col, id);
        if (renewalTerm > 1 && has('renewal')) addCellNote(target, 'renewal', id);
      }
      if (offer.price.unit === 'month') {
        // the year cells show the monthly price as a second line; only the sums need the note
        notes[NOTE_MONTHLY] = L.s.notes.monthly;
        for (const col of SUM_COLUMNS) if (has(col)) addCellNote(target, col, NOTE_MONTHLY);
      }
    }

    // editorial notes of the provider's terms, only where the provider value is used
    const contractSource: RowDetail['contractSource'] = {};
    const contract = effectiveContract(offer, provider);
    for (const field of CONTRACT_FIELDS) {
      const col = CONTRACT_COLUMNS[field];
      const own = offer.contract?.[field];
      const fromProvider = provider.terms?.[field];
      contractSource[col] =
        own !== null && own !== undefined
          ? 'offer'
          : fromProvider !== null && fromProvider !== undefined
            ? 'provider'
            : null;
      const text = provider.terms?.notes?.[field];
      if (text && (own === null || own === undefined)) {
        const id = noteTerms(provider.id, field);
        notes[id] = L.s.notes.dataNote(text);
        for (const mode of ['gross', 'net'] as const) addCellNote(cellNotes[mode], col, id);
      }
    }

    // note on the contracting party or invoicing, on the country cell (both VAT modes)
    if (provider.country_note) {
      const id = noteCountry(provider.id);
      notes[id] = L.s.notes.dataNote(provider.country_note);
      for (const mode of ['gross', 'net'] as const) addCellNote(cellNotes[mode], 'country', id);
    }

    const ev = offer.evidence;
    const p = offer.price;
    const f = offer.features ?? {};
    const paid = paidFeatures(offer);
    rows.push({
      key,
      providerId: offer.provider,
      tld: offer.tld,
      common: {
        provider: provider.name,
        country: provider.country,
        notice_days: contract.notice_period_days,
        min_term_months: contract.min_term_months,
        ssl_free: f.ssl_free ?? null,
        fwd_301: f.forward_301 ?? null,
        fwd_302: f.forward_302 ?? null,
        dns_editor: f.dns_editor ?? null,
        custom_ns: f.custom_ns ?? null,
        billing_cycle: contract.billing_cycle,
        auto_renew: contract.auto_renew_default,
        dnssec: f.dnssec ?? null,
        email_fwd: f.email_forwarding ?? null,
        whois_privacy: f.whois_privacy ?? null,
        api: f.api ?? null,
        two_factor: f.two_factor ?? null,
        payment: f.payment_methods?.length ? f.payment_methods.join(', ') : null,
        fetched_at: offer.evidence.fetched_at,
      },
      gross,
      net,
      notes: rowNotes,
      cellNotes,
      badges: { promo: promo && !promoExpired, verified: offer.provider_verified === true },
      detail: {
        sourceUrl: ev.source_url,
        sourceEndpoint: ev.source_endpoint ?? null,
        fetchedAt: ev.fetched_at,
        dataStale: ev.fetched_at.slice(0, 10) < staleBefore,
        method: ev.method,
        confidence: ev.confidence,
        evidenceHash: ev.evidence_hash ?? null,
        screenshotUrl: ev.screenshot_url ?? null,
        providerVerified: offer.provider_verified === true,
        promo: promo
          ? {
              conditions: offer.promo?.conditions ?? null,
              validUntil: offer.promo?.valid_until ?? null,
              expired: promoExpired,
            }
          : null,
        stated: {
          currency: offer.currency,
          vat: offer.vat_included === null ? 'none' : offer.vat_included ? 'gross' : 'net',
          unit: p.unit,
          setup: p.setup,
          year1: p.year1,
          year1Regular: p.year1_regular ?? null,
          renewal: p.renewal,
          termYears: p.term_years ?? 1,
          renewalTermYears: p.renewal_term_years ?? 1,
        },
        contractSource,
        // only rows with a paid feature carry the key (payload size)
        ...(paid.length ? { paidFeatures: paid } : {}),
      },
    });
  }

  const providers: Record<string, ProviderMeta> = {};
  for (const p of data.providers) {
    if (!used.has(p.id)) continue;
    // terms notes by contract column id, only fields with a non-empty note (payload size)
    const termsNotes: Record<string, string> = {};
    for (const field of CONTRACT_FIELDS) {
      const text = p.terms?.notes?.[field];
      if (text) termsNotes[CONTRACT_COLUMNS[field]] = text;
    }
    providers[p.id] = {
      id: p.id,
      name: p.name,
      website: p.website,
      operator: p.operator === true,
      country: p.country,
      countryName: countryName(p.country, L.lang),
      countryNote: p.country_note ?? null,
      terms: {
        url: p.terms?.url ?? null,
        section: p.terms?.section ?? null,
        reviewedAt: p.reviewed_at ?? null,
        ...(Object.keys(termsNotes).length ? { notes: termsNotes } : {}),
      },
    };
  }
  rows.sort((a, b) => compareIds(a.key, b.key));
  return { version: 1, tlds: orderTlds(rows.map((r) => r.tld)), providers, rows, notes };
}
