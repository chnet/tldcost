// Shape of the data the page embeds for the table island (built at build time by rows.ts).
import type { Cents, Confidence, EvidenceMethod, FeatureCostUnit, PriceUnit } from '@tldcost/core';
import type { SortKey } from './sort';

/** Where the provider's contract terms are (AGB citation in the row detail). */
export interface ProviderTermsMeta {
  url: string | null;
  section: string | null;
  /** Date the terms were last reviewed (YYYY-MM-DD). */
  reviewedAt: string | null;
  /**
   * Editorial note per contract column id (provider.terms.notes, German data text); shown in the
   * row detail where the provider value is used. Missing when the provider has none.
   */
  notes?: Record<string, string>;
}

export interface ProviderMeta {
  id: string;
  name: string;
  website: string;
  /** Portal operator's own offer: badge only. Never passed to sorting. */
  operator: boolean;
  /** ISO 3166-1 alpha-2 code of the contracting entity, e.g. "DE". Display only. */
  country: string;
  /** Country name in the page language, e.g. "Deutschland" (accessible name of the flag). */
  countryName: string;
  /** Note on the contracting party or invoicing (provider.country_note); null without one. */
  countryNote: string | null;
  terms: ProviderTermsMeta;
}

/** Price as the provider states it, before VAT, currency and unit normalisation. */
export interface StatedPrice {
  currency: string;
  /** gross / net / none (no VAT statement, vat_included null). */
  vat: 'gross' | 'net' | 'none';
  unit: PriceUnit;
  setup: Cents | null;
  year1: Cents | null;
  year1Regular: Cents | null;
  renewal: Cents | null;
  /** Years covered by the year-1 and each renewal payment (default 1). */
  termYears: number;
  renewalTermYears: number;
}

/** A feature offered only for a fee (value "paid", Archiv-Issue 124), as the provider states it. */
export interface PaidFeature {
  /** Table column of the feature, e.g. dns_editor, email_fwd, whois_privacy. */
  col: string;
  /** Minor units of the offer currency (StatedPrice.currency), in its VAT mode; null: not stated. */
  price: Cents | null;
  unit: FeatureCostUnit | null;
  /** German note of the data (bundle, first-year price, ...). */
  note: string | null;
  /** Verbatim quote of the provider, its language and its page. */
  quote: string;
  quoteLang: 'de' | 'en';
  url: string;
}

/** Content of the expandable row. Display only: never read by sorting. */
export interface RowDetail {
  sourceUrl: string;
  sourceEndpoint: string | null;
  fetchedAt: string;
  /** fetched_at is older than STALE_DATA_DAYS at build time (shown as "veraltet"). */
  dataStale: boolean;
  method: EvidenceMethod;
  confidence: Confidence;
  evidenceHash: string | null;
  screenshotUrl: string | null;
  providerVerified: boolean;
  /** Set when year 1 is a promotional price; `expired`: valid_until is before the build date. */
  promo: { conditions: string | null; validUntil: string | null; expired: boolean } | null;
  stated: StatedPrice;
  /** Per contract column: value from the offer itself or from the provider's terms. */
  contractSource: Record<string, 'offer' | 'provider' | null>;
  /** Paid features with source and price, in column order; missing when there is none. */
  paidFeatures?: PaidFeature[];
  /** Price history (data/history/, Archiv-Issue 51); missing below 3 entries (payload size). */
  history?: RowHistory;
}

/** SVG path data of the sparkline in one VAT mode (price-history.ts, viewBox HISTORY_SVG). */
export interface HistoryPath {
  year1: string;
  year1Dots: string;
  renewal: string;
  renewalDots: string;
  /** Dashed vertical lines at the breaks between segments. */
  breaks: string;
}

/** Year-1 and renewal amounts per entry in one VAT mode: EUR cents per year, null when unknown. */
export interface HistorySeries {
  year1: (Cents | null)[];
  renewal: (Cents | null)[];
  /** Missing in `net` when it equals the gross path (one VAT rate scales all amounts alike). */
  path?: HistoryPath;
}

/** The price history of a row: entry dates (oldest first, at most 12) and the amounts per VAT mode. */
export interface RowHistory {
  dates: string[];
  /**
   * Entries that start a new segment (another currency, VAT mode, unit or market than the entry
   * before): not connected to the earlier ones. `market`: country of a foreign market display,
   * null for the German display.
   */
  breaks: { index: number; currency: string; market: string | null }[];
  gross: HistorySeries;
  net: HistorySeries;
  /** Set when older entries were left out: only the newest MAX_HISTORY_POINTS are shown. */
  capped?: true;
}

/** Badges shown next to the provider name. The operator badge lives in ProviderMeta. */
export interface RowBadges {
  /** Year 1 is a current promotional price (promo data or year1 below year1_regular), not expired. */
  promo: boolean;
  /** provider_verified: the provider confirmed the data (affiliation checked). */
  verified: boolean;
}

export interface PayloadRow {
  /** `<providerId>/<tld>` */
  key: string;
  providerId: string;
  tld: string;
  /** Values that do not depend on the VAT mode (contract, features, provider name, date). */
  common: Record<string, SortKey>;
  /** Money and TCO values per VAT mode, plus `avg_2y`/`avg_3y`/`avg_5y` for display. */
  gross: Record<string, SortKey>;
  net: Record<string, SortKey>;
  /** Footnote ids that apply to the whole row (shown at the provider name). */
  notes: string[];
  /** Footnote ids per VAT mode and column id (shown in that cell). */
  cellNotes: { gross: Record<string, string[]>; net: Record<string, string[]> };
  badges: RowBadges;
  detail: RowDetail;
}

export interface SitePayload {
  version: 1;
  /** TLDs with at least one offer, display order. */
  tlds: string[];
  providers: Record<string, ProviderMeta>;
  /** Sorted by key; display order comes from sortRows(). */
  rows: PayloadRow[];
  /** Footnote id -> text. */
  notes: Record<string, NoteText>;
}

/**
 * A part of a text: plain, or data text quoted verbatim in another language than the page:
 * `{ de }` German data text on English pages (lang="de"), `{ en }` an English provider quote on
 * German pages (lang="en").
 */
export type NotePart = string | { de: string } | { en: string };
/**
 * Footnote or quote text: plain or parts (src/components/NoteBody.tsx). German pages use parts
 * only for an English provider quote (quote.statement).
 */
export type NoteText = string | NotePart[];
