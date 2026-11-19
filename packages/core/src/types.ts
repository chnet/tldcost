// Types mirroring schema/offer.schema.json (schema_version 2) and schema/provider.schema.json
// (schema_version 1).
// All amounts are integer minor units (cents); VAT rates are basis points (1900 = 19 %).

/** Integer minor units (cents). */
export type Cents = number;

/** VAT rate in basis points (1900 = 19 %). */
export type BasisPoints = number;

export type PriceUnit = 'year' | 'month';
export type BillingCycle = 'monthly' | 'yearly' | 'multi-year';
export type EvidenceMethod = 'api' | 'scrape' | 'manual';
export type Confidence = 'high' | 'medium' | 'low';

export interface OfferPrice {
  /** Billing unit of the recurring amounts; `month` amounts are multiplied by 12. */
  unit: PriceUnit;
  setup: Cents | null;
  /**
   * Where the setup fee is stated when that is not the price itself on evidence.source_url (e.g.
   * a table further down or another page of the provider): page URL and verbatim quote. Set by
   * the adapter; a run that takes the fee from the price itself removes it.
   */
  setup_source?: SetupSource;
  /** Payment for the first term: actual price incl. a public promo, never a coupon code. */
  year1: Cents | null;
  /** List price of year 1 without promo. */
  year1_regular?: Cents | null;
  /** Payment for every renewal term, unless year2/year3 differ. */
  renewal: Cents | null;
  /** Years covered by the year1 payment (registration only possible for N years). Default 1. */
  term_years?: number;
  /** Years covered by each renewal payment. Default 1. */
  renewal_term_years?: number;
  year2?: Cents | null;
  year3?: Cents | null;
  transfer_in?: Cents | null;
  /**
   * true: the provider states that the transfer_in payment includes one renewal term (source in
   * transfer_includes_term_source). false or null (unknown): the transfer includes no term, so a
   * renewal is due in year 1 as well (methodik, owner decision 2026-11-15).
   */
  transfer_includes_term?: boolean | null;
  /** Where the provider says so: page URL and/or verbatim quote. */
  transfer_includes_term_source?: TransferTermSource | null;
  transfer_out?: Cents | null;
  icann_fee_included?: boolean | null;
}

/** Where the provider states something: page URL and/or verbatim quote. */
export interface StatementSource {
  url?: string;
  quote?: string;
}

export type TransferTermSource = StatementSource;

/** Source of the setup fee: page URL and verbatim quote, both required. */
export interface SetupSource {
  url: string;
  quote: string;
}

export interface OfferPromo {
  conditions?: string | null;
  valid_until?: string | null;
  /**
   * Most domains per customer at the promo price, as stated by the provider (source in
   * max_per_customer_source). null or missing: not stated (see limit_scope).
   */
  max_per_customer?: number | null;
  max_per_customer_source?: StatementSource | null;
  /**
   * per_tld: max_per_customer applies per TLD. per_customer: across all TLDs of the provider.
   * unlimited: no limit per customer for this TLD, stated by the provider (verbatim quote in
   * max_per_customer_source, max_per_customer null; owner decision 2026-11-15). null or missing:
   * not stated (the calculator then counts ONE promo domain per provider in total).
   */
  limit_scope?: 'per_tld' | 'per_customer' | 'unlimited' | null;
}

/**
 * Contract terms of one offer. Precedence (see effectiveContract): a value here wins unless it is
 * null or missing; then provider.terms applies; else unknown (null).
 */
export interface OfferContract {
  min_term_months?: number | null;
  notice_period_days?: number | null;
  billing_cycle?: BillingCycle | null;
  auto_renew_default?: boolean | null;
  price_change_notice?: boolean | null;
}

/**
 * Value of a feature field that may cost extra (owner decision 2026-11-15, Archiv-Issue 124): true = included,
 * "paid" = offered only for a fee (source in Offer.feature_costs), false = not offered, null =
 * unknown.
 */
export type FeatureValue = boolean | 'paid' | null;

/** The feature fields that accept "paid" (FeatureValue). */
export const PAYABLE_FEATURES = [
  'ssl_free',
  'forward_301',
  'forward_302',
  'dns_editor',
  'custom_ns',
  'dnssec',
  'email_forwarding',
  'api',
] as const;
export type PayableFeature = (typeof PAYABLE_FEATURES)[number];

/** Fields that may carry a feature_costs entry: the payable ones plus whois_privacy ("paid"). */
export type CostedFeature = PayableFeature | 'whois_privacy';

export interface OfferFeatures {
  ssl_free?: FeatureValue;
  forward_301?: FeatureValue;
  forward_302?: FeatureValue;
  dns_editor?: FeatureValue;
  custom_ns?: FeatureValue;
  dnssec?: FeatureValue;
  email_forwarding?: FeatureValue;
  /** none: the provider does not offer it; n/a: not possible for this TLD (e.g. .de); null: unknown. */
  whois_privacy?: 'free' | 'paid' | 'none' | 'n/a' | null;
  api?: FeatureValue;
  two_factor?: boolean | null;
  payment_methods?: string[];
}

/** Billing unit of a feature price. */
export type FeatureCostUnit = 'year' | 'month' | 'once';

/**
 * What a paid feature costs, as the provider states it. `source` (URL and verbatim quote) is
 * required; price, unit and note only where the source names them.
 */
export interface FeatureCost {
  /** lang: language of the quote (missing = de). */
  source: { url: string; quote: string; lang?: 'de' | 'en' };
  /** Minor units of the offer's `currency`, in the offer's VAT mode (vat_included). */
  price_cents?: Cents;
  /** Billing unit of price_cents; only together with it. */
  unit?: FeatureCostUnit;
  /** Short German note, e.g. bundle, first-year price, "je Hosted Zone" (≤ 200 characters). */
  note?: string;
}

export type FeatureCosts = Partial<Record<CostedFeature, FeatureCost>>;

export interface Evidence {
  /** Public, human-readable provider page with the price. */
  source_url: string;
  /** URL actually fetched when it differs (method api); evidence_hash is over its response body. */
  source_endpoint?: string;
  fetched_at: string;
  method: EvidenceMethod;
  evidence_hash?: string;
  screenshot_url?: string;
  confidence: Confidence;
}

export interface Offer {
  schema_version: 2;
  provider: string;
  tld: string;
  /** ISO 4217 code of all amounts in `price`. */
  currency: string;
  /**
   * true: gross, false: net. null: the provider (outside the EU) makes no VAT statement; the price
   * is used as stated in gross and net mode and flagged (methodik).
   */
  vat_included: boolean | null;
  /** Overrides the provider's VAT rate for this offer. */
  vat_rate?: BasisPoints;
  price: OfferPrice;
  promo?: OfferPromo | null;
  contract?: OfferContract;
  features?: OfferFeatures;
  /** Source and stated price of each feature whose value is "paid" (Archiv-Issue 124). */
  feature_costs?: FeatureCosts;
  /**
   * Set when the price is the display for another market than Germany (owner decision
   * 2026-11-19): the provider's page showed the fetch another country's prices. The amounts are
   * that market's prices as quoted; the site converts them (ECB) and adds German VAT.
   */
  foreign_market?: ForeignMarket;
  evidence: Evidence;
  provider_verified: boolean;
}

/** The market whose prices an offer records instead of the German one (Offer.foreign_market). */
export interface ForeignMarket {
  /** ISO 3166-1 alpha-2 code of the country the page showed prices for, e.g. "US". */
  country: string;
  /** ISO 4217 currency of that market's prices; always the offer's `currency`. */
  currency: string;
  /** Verbatim text of the source that shows market, currency and price (heading and table row). */
  quote: string;
}

export interface ProviderTerms {
  url?: string;
  section?: string;
  min_term_months?: number | null;
  notice_period_days?: number | null;
  billing_cycle?: BillingCycle | null;
  auto_renew_default?: boolean | null;
  /** Editorial note per contract field (footnote on that cell), quotable from the terms. */
  notes?: ProviderTermsNotes;
}

/** Contract fields of ProviderTerms that may carry a note (schema: terms.notes). */
export type ContractField =
  'min_term_months' | 'notice_period_days' | 'billing_cycle' | 'auto_renew_default';

export type ProviderTermsNotes = Partial<Record<ContractField, string>>;

/**
 * excluded: no offers, the provider does not meet the selection criteria. pending: no offers yet,
 * manual entry outstanding. Without status, `reason` is a note on gaps in the collection.
 */
export interface ProviderCollection {
  status?: 'excluded' | 'pending';
  reason: string;
  issue?: number;
}

export interface Provider {
  schema_version: 1;
  id: string;
  name: string;
  website: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Note on the contracting party or invoicing (German, max. 200 characters), e.g. another entity invoicing EU customers. */
  country_note?: string;
  /** null: no VAT statement (non-EU providers only, checked by validate-data). */
  vat_rate: BasisPoints | null;
  /** Portal operator's own offer (badge only, never affects sorting). Default false. */
  operator?: boolean;
  terms?: ProviderTerms;
  /** How tldcost collects this provider (Methodik list); see schema/provider.schema.json. */
  collection?: ProviderCollection;
  reviewed_at?: string;
}

/** Rates of one ECB reference day (schema/fx.schema.json, data/fx/<ECB date>.json). */
export interface FxRates {
  schema_version: 1;
  source: 'ECB';
  /** ECB reference date (Cube time), YYYY-MM-DD; also the file name. */
  date: string;
  base: 'EUR';
  /** Units of each currency per 1 EUR. */
  rates: Record<string, number>;
  source_url: string;
  fetched_at: string;
  evidence_hash?: string;
}

/**
 * ECB euro reference rate: units of `currency` per 1 EUR on `date` (YYYY-MM-DD),
 * e.g. { currency: 'USD', perEur: 1.0834, date: '2026-11-11' }.
 */
export interface FxRate {
  currency: string;
  perEur: number;
  date: string;
}

/** gross = incl. VAT (default, PAngV), net = excl. VAT. */
export type PriceMode = 'gross' | 'net';
