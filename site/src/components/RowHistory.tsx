// Price history of a row (Archiv-Issue 51), in the selected VAT mode: a sparkline drawn from path
// data built at build time (lib/price-history.ts; no chart code in the page) and the same values
// as a list. The sparkline is decorative (aria-hidden); the list carries the values, and an entry
// of another market its market note, as in the table.
import { useLocale } from '../i18n/context';
import { HISTORY_SVG } from '../lib/history-svg';
import type { RowHistory as History } from '../lib/payload';
import type { Vat } from '../lib/url-state';

export default function RowHistory({ h, vat }: { h: History; vat: Vat }) {
  const L = useLocale();
  const t = L.m.detail;
  const s = h[vat];
  // net without its own path: the same lines as gross (price-history.ts)
  const p = s.path ?? h.gross.path;
  const { width, height } = HISTORY_SVG;
  const amount = (v: number | null | undefined) =>
    v === null || v === undefined ? t.historyUnknown : L.f.eur(v);
  const line = (cls: string, d: string | undefined) => d && <path class={cls} d={d} />;
  return (
    <section class="tc-history">
      <h2>{t.historyHeading}</h2>
      <svg
        class="tc-spark"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
        focusable="false"
      >
        {line('tc-spark-break', p?.breaks)}
        {line('tc-spark-renewal', p?.renewal)}
        {line('tc-spark-renewal tc-spark-dots', p?.renewalDots)}
        {line('tc-spark-year1', p?.year1)}
        {line('tc-spark-year1 tc-spark-dots', p?.year1Dots)}
      </svg>
      <p class="tc-spark-legend">
        <span class="tc-spark-key tc-spark-year1" aria-hidden="true" /> {t.raw.year1}{' '}
        <span class="tc-spark-key tc-spark-renewal" aria-hidden="true" /> {t.raw.renewal}
      </p>
      <p class="tc-unit">
        {t.historyCaption(vat === 'gross' ? L.m.common.gross : L.m.common.net, h.capped === true)}
      </p>
      <ol class="tc-history-list">
        {h.dates.map((d, i) => (
          <li key={d}>
            {h.breaks.includes(i) && (
              <span class="tc-history-note">{t.historyBreak(L.f.date(d))}</span>
            )}
            <time dateTime={d}>{L.f.date(d)}</time>: {t.raw.year1}{' '}
            <span class="tc-code">{amount(s.year1[i])}</span>, {t.raw.renewal}{' '}
            <span class="tc-code">{amount(s.renewal[i])}</span>
            {/* another market's prices: the table's market note, never a bare converted value */}
            {s.notes?.[i] && <span class="tc-history-note">{s.notes[i]}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
