// The table payload of one TLD page (/tld/<tld>/): the full payload from buildPayload() (rows.ts)
// reduced to the rows of that TLD and the providers behind them. The footnote texts (`notes`) stay
// complete: rows refer to them from several places (row notes, per-cell notes), and the island only
// renders the ones its rows use. Fields this file does not know (added by later changes to
// SitePayload) are passed through unchanged.
import type { SitePayload } from './payload';

export function payloadForTld(payload: SitePayload, tld: string): SitePayload {
  const rows = payload.rows.filter((r) => r.tld === tld);
  const providerIds = new Set(rows.map((r) => r.providerId));
  return {
    ...payload,
    tlds: payload.tlds.filter((t) => t === tld),
    rows,
    providers: Object.fromEntries(
      Object.entries(payload.providers).filter(([id]) => providerIds.has(id)),
    ),
  };
}
