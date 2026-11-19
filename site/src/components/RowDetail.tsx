// RowDetail (design system): everything behind the numbers of one row. Raw prices in the
// provider's own unit and VAT mode next to what the table shows, the promo conditions (quoted),
// the contract terms with their source and the provider's terms notes, paid features (price, note,
// quoted source; Archiv-Issue 124), the price history from 3 entries on (RowHistory; Archiv-Issue 51),
// the evidence, and at the end the tc-source line: source link, fetch date,
// "Fehler melden". Display only: nothing here feeds into sorting.
import { Fragment } from 'preact';
import { useLocale } from '../i18n/context';
import type { Locale } from '../i18n/de';
import { COLUMN_BY_ID } from '../lib/columns';
import type { PayloadRow, ProviderMeta, StatedPrice } from '../lib/payload';
import { REPORT_EMAIL, REPORT_VIA } from '../lib/report.mjs';
import type { SortKey } from '../lib/sort';
import type { Vat } from '../lib/url-state';
import { columnText, contractNote, formatPerMonth, formatValue, reportUrl } from '../lib/view';
import NoteBody from './NoteBody';
import RowHistory from './RowHistory';

const EXTERNAL = 'noopener noreferrer nofollow';

const CONTRACT_COLUMNS: readonly string[] = [
  'min_term_months',
  'notice_days',
  'billing_cycle',
  'auto_renew',
];

/** "brutto" / "netto" / "ohne USt.-Angabe" plus "/Monat" for monthly prices. */
function statedSuffix(L: Locale, s: StatedPrice): string {
  const vat = L.m.detail.statedVat[s.vat];
  return s.unit === 'month' ? `${L.m.detail.perMonthUnit} ${vat}` : ` ${vat}`;
}

/** Display text of a contract value with its unit ("30 Tage", "12 Monate", "jährlich"). */
function contractText(L: Locale, col: string, v: SortKey): string {
  const def = COLUMN_BY_ID.get(col);
  if (!def) return String(v);
  const text = formatValue(L, def, v);
  const { unit, unitOne, zero } = columnText(L, def);
  if (typeof v !== 'number' || !unit || (v === 0 && zero)) return text;
  return `${text} ${v === 1 ? (unitOne ?? unit) : unit}`;
}

function Pair({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export default function RowDetail({
  row,
  meta,
  values,
  vat,
}: {
  row: PayloadRow;
  meta: ProviderMeta | undefined;
  values: Record<string, SortKey>;
  vat: Vat;
}) {
  const L = useLocale();
  const t = L.m.detail;
  const d = row.detail;
  const s = d.stated;
  const name = meta?.name ?? row.providerId;
  const mode = vat === 'gross' ? L.m.common.gross : L.m.common.net;
  const regular = values['year1_regular'];
  const regularMonth = values['year1_regular_month'];
  const raw: Array<[string, number | null]> = [
    [t.raw.year1, s.year1],
    [t.raw.year1Regular, s.year1Regular],
    [t.raw.renewal, s.renewal],
    [t.raw.setup, s.setup],
  ];
  return (
    <div class="tc-detail">
      <section>
        <h2>{t.pricesHeading}</h2>
        <dl>
          {raw
            .filter(([, v]) => v !== null)
            .map(([label, v]) => (
              <Fragment key={label}>
                <Pair label={label}>
                  <span class="tc-code">
                    {L.f.amount(v as number, s.currency)}
                    {label === t.raw.setup
                      ? statedSuffix(L, { ...s, unit: 'year' })
                      : statedSuffix(L, s)}
                  </span>
                </Pair>
              </Fragment>
            ))}
          {s.termYears > 1 && <Pair label={t.term}>{t.termText(s.termYears)}</Pair>}
          {s.renewalTermYears > 1 && (
            <Pair label={t.renewalTerm}>{t.renewalTermText(s.renewalTermYears)}</Pair>
          )}
          {d.promo && (
            <>
              <Pair label={d.promo.expired ? t.promoExpired : t.promo}>
                {d.promo.conditions ? (
                  <NoteBody text={L.m.quote.conditions(d.promo.conditions)} />
                ) : (
                  t.conditionsMissing
                )}
              </Pair>
              <Pair label={t.validUntil}>
                {d.promo.validUntil ? L.f.date(d.promo.validUntil) : t.notStated}
                {d.promo.expired && <span class="tc-stale">{t.expiredNote}</span>}
              </Pair>
              {typeof regular === 'number' && (
                <Pair label={t.regularYear1}>
                  <span class="tc-code">
                    {L.f.eur(regular)} {mode}
                    {typeof regularMonth === 'number' && `, ${formatPerMonth(L, regularMonth)}`}
                  </span>
                </Pair>
              )}
            </>
          )}
        </dl>
      </section>

      {d.history && <RowHistory h={d.history} vat={vat} />}

      <section>
        <h2>{t.contractHeading}</h2>
        <dl>
          {meta && (
            <Pair label={t.country}>
              {meta.countryName}
              {meta.countryNote && (
                <span class="tc-unit">
                  <NoteBody text={L.m.quote.data(meta.countryNote)} />
                </span>
              )}
            </Pair>
          )}
          {CONTRACT_COLUMNS.map((col) => {
            const def = COLUMN_BY_ID.get(col);
            const v = values[col] ?? null;
            const source = t.sources[d.contractSource[col] ?? ''];
            // editorial note of the provider's terms, as the table footnote of that cell
            const note = contractNote(row, meta, col);
            return (
              <Fragment key={col}>
                <Pair label={def ? columnText(L, def).label : col}>
                  {contractText(L, col, v)}
                  {v !== null && source && <span class="tc-unit">{source}</span>}
                  {note && (
                    <span class="tc-unit">
                      <NoteBody text={L.m.quote.data(note)} />
                    </span>
                  )}
                </Pair>
              </Fragment>
            );
          })}
          {meta?.terms.url && (
            <Pair label={t.terms}>
              <a href={meta.terms.url} rel={EXTERNAL}>
                {t.termsOf(name)}
              </a>
            </Pair>
          )}
          {meta?.terms.section && (
            <Pair label={t.section}>
              <NoteBody text={L.m.quote.data(meta.terms.section)} />
            </Pair>
          )}
          {meta?.terms.reviewedAt && (
            <Pair label={t.reviewed}>{L.f.date(meta.terms.reviewedAt)}</Pair>
          )}
        </dl>
      </section>

      {d.paidFeatures && (
        <section>
          <h2>{t.paidHeading}</h2>
          <dl>
            {d.paidFeatures.map((p) => {
              const def = COLUMN_BY_ID.get(p.col);
              return (
                <Fragment key={p.col}>
                  <Pair label={def ? columnText(L, def).label : p.col}>
                    {L.m.enums.paid}
                    {p.price !== null && p.unit !== null && (
                      <>
                        {', '}
                        <span class="tc-code">
                          {L.f.amount(p.price, s.currency)}
                          {t.paidUnit[p.unit]} {t.statedVat[s.vat]}
                        </span>
                      </>
                    )}
                    {p.note && (
                      <span class="tc-unit">
                        <NoteBody text={L.m.quote.data(p.note)} />
                      </span>
                    )}
                    <span class="tc-unit">
                      <NoteBody text={L.m.quote.statement(p.quote, p.quoteLang)} /> (
                      <a href={p.url} rel={EXTERNAL}>
                        {t.paidSource}
                      </a>
                      )
                    </span>
                  </Pair>
                </Fragment>
              );
            })}
          </dl>
        </section>
      )}

      <section>
        <h2>{t.evidenceHeading}</h2>
        <dl>
          <Pair label={t.method}>{t.methods[d.method] ?? d.method}</Pair>
          <Pair label={t.confidence}>{t.confidences[d.confidence] ?? d.confidence}</Pair>
          {d.sourceEndpoint && (
            <Pair label={t.endpoint}>
              <span class="tc-code">{d.sourceEndpoint}</span>
            </Pair>
          )}
          {d.evidenceHash && (
            <Pair label={t.hash}>
              <span class="tc-code">{d.evidenceHash}</span>
            </Pair>
          )}
          {d.screenshotUrl && (
            <Pair label={t.screenshot}>
              <a href={d.screenshotUrl} rel={EXTERNAL}>
                {t.screenshotLink}
              </a>
            </Pair>
          )}
          <Pair label={t.verified}>{d.providerVerified ? t.verifiedYes : L.m.common.no}</Pair>
        </dl>
      </section>

      <p class="tc-source">
        {t.source}{' '}
        <a href={d.sourceUrl} rel={EXTERNAL}>
          {t.priceSourceOf(name)}
        </a>{' '}
        · {t.fetchedOn} <time dateTime={d.fetchedAt}>{L.f.date(d.fetchedAt)}</time>
        {d.dataStale && <span class="tc-stale">{L.m.common.stale}</span>} ·{' '}
        <a href={reportUrl(row, name)} rel="noopener noreferrer">
          {t.report}
        </a>{' '}
        {REPORT_VIA === 'github'
          ? `${t.reportGithub(t.noGithubHint(REPORT_EMAIL))} ${t.reportPrivacy}`
          : t.reportMail(REPORT_EMAIL)}
      </p>
    </div>
  );
}
