// Badge and Legend (design system). Exactly three badges with fixed wording (src/i18n `badges`); the legend lists only
// the badges of the current rows, in the order Aktionspreis, Anbieter-bestätigt, Angebot des
// Portalbetreibers. Badges state facts, never a ranking; the operator badge is as quiet as the rest.
import { Fragment } from 'preact';
import { useLocale } from '../i18n/context';

export type BadgeKind = 'promo' | 'verified' | 'operator';

export const BADGE_ORDER: readonly BadgeKind[] = ['promo', 'verified', 'operator'];

export function Badge({ kind }: { kind: BadgeKind }) {
  const L = useLocale();
  return <span class={`tc-badge tc-badge--${kind}`}>{L.m.badges.text[kind]}</span>;
}

export function Legend({
  kinds,
  best = null,
  bestTexts,
  paid = false,
}: {
  kinds: ReadonlySet<BadgeKind>;
  /** Scope of the tc-best cells in view, or null when there are none. */
  best?: 'all' | 'filtered' | null;
  /** Wording of the tc-best entry when it differs from the table's (portfolio: no TLD). */
  bestTexts?: Readonly<Record<'all' | 'filtered', string>>;
  /** A visible bool cell says „kostenpflichtig“ (Archiv-Issue 124): plain-text entries for ja and kostenpflichtig. */
  paid?: boolean;
}) {
  const L = useLocale();
  const b = L.m.badges;
  const shown = BADGE_ORDER.filter((k) => kinds.has(k));
  if (shown.length === 0 && !best && !paid) return null;
  return (
    <dl class="tc-legend">
      {shown.map((k) => (
        <Fragment key={k}>
          <dt>
            <Badge kind={k} />
          </dt>
          <dd>{b.legend[k]}</dd>
        </Fragment>
      ))}
      {best && (
        <>
          <dt>
            <span class="tc-best-sample">{b.bestSample}</span>
          </dt>
          <dd>{(bestTexts ?? b.bestLegend)[best]}</dd>
        </>
      )}
      {paid && (
        <>
          <dt>{L.m.common.yes}</dt>
          <dd>{b.paidLegend.yes}</dd>
          <dt>{L.m.enums.paid}</dt>
          <dd>{b.paidLegend.paid}</dd>
        </>
      )}
    </dl>
  );
}
