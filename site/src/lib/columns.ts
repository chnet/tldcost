// Column definitions of the price table (concept section 3.3). The ids are part of the public URL
// (sort, cols): never rename one without a redirect plan.

export type ColumnKind = 'text' | 'money' | 'tco' | 'int' | 'bool' | 'enum' | 'date';

export interface ColumnDef {
  readonly id: string;
  readonly kind: ColumnKind;
  /** Values differ between gross and net mode (money and TCO columns). */
  readonly vatDependent: boolean;
  /** Visible when the URL has no `cols` parameter (desktop). */
  readonly defaultVisible: boolean;
  /** Visible on small screens when the URL has no `cols` parameter. */
  readonly mobileDefault: boolean;
  /** For `tco` columns: N years. */
  readonly years?: 2 | 3 | 5;
  /** Sortable by a header click (default true). Land is not: the country is no ranking signal. */
  readonly sortable?: boolean;
  /** bool columns of a feature that may cost extra: also take the value "paid" (Archiv-Issue 124). */
  readonly paid?: boolean;
}

// Labels, units (with singular) and the text for 0 are per language: src/i18n/*.ts, `columns.<id>`.
const col = (
  id: string,
  kind: ColumnKind,
  opts: Partial<Omit<ColumnDef, 'id' | 'kind'>> = {},
): ColumnDef => ({
  id,
  kind,
  vatDependent: kind === 'money' || kind === 'tco',
  defaultVisible: false,
  mobileDefault: false,
  ...opts,
});

/** All columns in display order. `provider` is always first and always visible. */
export const COLUMNS: readonly ColumnDef[] = [
  col('provider', 'text', { defaultVisible: true, mobileDefault: true }),
  // contracting entity's country (provider.country): filterable, never sorted (CountryFlag README)
  col('country', 'enum', { defaultVisible: true, sortable: false }),
  col('setup', 'money', { defaultVisible: true }),
  col('year1', 'money', { defaultVisible: true, mobileDefault: true }),
  col('year2', 'money', { defaultVisible: true, mobileDefault: true }),
  col('year3', 'money', { defaultVisible: true }),
  col('sum_2y', 'tco', { years: 2, defaultVisible: true }),
  col('sum_3y', 'tco', { years: 3, defaultVisible: true, mobileDefault: true }),
  col('sum_5y', 'tco', { years: 5, defaultVisible: true }),
  col('notice_days', 'int', { defaultVisible: true, mobileDefault: true }),
  col('min_term_months', 'int', { defaultVisible: true }),
  col('ssl_free', 'bool', { defaultVisible: true, paid: true }),
  col('fwd_301', 'bool', { defaultVisible: true, paid: true }),
  col('fwd_302', 'bool', { defaultVisible: true, paid: true }),
  col('dns_editor', 'bool', { defaultVisible: true, paid: true }),
  col('custom_ns', 'bool', { defaultVisible: true, paid: true }),
  col('renewal', 'money'),
  col('transfer_in', 'money'),
  col('transfer_out', 'money'),
  col('billing_cycle', 'enum'),
  col('auto_renew', 'bool'),
  col('dnssec', 'bool', { paid: true }),
  col('email_fwd', 'bool', { paid: true }),
  col('whois_privacy', 'enum'),
  col('api', 'bool', { paid: true }),
  col('two_factor', 'bool'),
  col('payment', 'text'),
  col('fetched_at', 'date'),
];

export const COLUMN_IDS: readonly string[] = COLUMNS.map((c) => c.id);
export const COLUMN_BY_ID: ReadonlyMap<string, ColumnDef> = new Map(COLUMNS.map((c) => [c.id, c]));
export const DEFAULT_COLUMNS: readonly string[] = COLUMNS.filter((c) => c.defaultVisible).map(
  (c) => c.id,
);
export const MOBILE_COLUMNS: readonly string[] = COLUMNS.filter((c) => c.mobileDefault).map(
  (c) => c.id,
);
export const DEFAULT_SORT = 'sum_3y';

/** Sort ranks of enum values (rank, not the label, decides the order; labels: i18n `enums`). */
export const ENUM_RANK: Readonly<Record<string, number>> = {
  monthly: 0,
  yearly: 1,
  'multi-year': 2,
  free: 0,
  // n/a: the registry redacts Whois anyway (e.g. .de), as good as free; ties go to the tie-break
  'n/a': 0,
  // also the "paid" of bool feature columns (between ja and nein: sort.ts compareValues)
  paid: 1,
  // none: the provider does not offer Whois privacy (methodik: after "kostenpflichtig")
  none: 2,
};
