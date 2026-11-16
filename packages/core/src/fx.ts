import type { FxRate, FxRates } from './types.js';

/**
 * The ECB rate for `currency` from the newest table that has it, optionally only tables dated on or
 * before `onOrBefore` (YYYY-MM-DD or a date-time such as offer.evidence.fetched_at; its date part
 * counts). undefined if none matches: computeTco then reports `fx.<CUR>`.
 */
export function fxRateFor(
  tables: readonly FxRates[],
  currency: string,
  onOrBefore?: string,
): FxRate | undefined {
  const until = onOrBefore?.slice(0, 10);
  let best: FxRate | undefined;
  for (const t of tables) {
    const perEur = t.rates[currency];
    if (perEur === undefined) continue;
    if (until !== undefined && t.date > until) continue;
    if (!best || t.date > best.date) best = { currency, perEur, date: t.date };
  }
  return best;
}
