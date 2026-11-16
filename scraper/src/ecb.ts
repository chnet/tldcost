// ECB euro foreign exchange reference rates (daily feed, one request per run; the ECB robots.txt
// sets Crawl-delay 5, which the HTTP client honours). Written as data/fx/<ECB date>.json
// (schema/fx.schema.json): the file name is the ECB reference date, so weekends add no file.
import type { FxRates } from '@tldcost/core';
import { evidenceHash } from './evidence.js';
import type { HttpClient } from './http.js';
import { isoSeconds } from './tlds.js';

export const ECB_DAILY = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/** Parses the eurofxref-daily.xml body; throws unless it has a date and at least a USD rate. */
export function parseEcb(xml: string): { date: string; rates: Record<string, number> } {
  const time = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/.exec(xml);
  if (!time) throw new Error('ECB feed: no <Cube time="...">');
  const rates: Record<string, number> = {};
  for (const m of xml.matchAll(
    /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g,
  )) {
    const rate = Number(m[2]);
    if (!(Number.isFinite(rate) && rate > 0)) throw new Error(`ECB feed: bad rate ${m[1]}=${m[2]}`);
    rates[m[1] as string] = rate;
  }
  if (rates.USD === undefined) throw new Error('ECB feed: no USD rate');
  return { date: time[1] as string, rates };
}

export async function fetchEcb(http: HttpClient, now: () => Date): Promise<FxRates> {
  const res = await http.get(ECB_DAILY, 'application/xml');
  const { date, rates } = parseEcb(res.text);
  return {
    schema_version: 1,
    source: 'ECB',
    date,
    base: 'EUR',
    rates,
    source_url: ECB_DAILY,
    fetched_at: isoSeconds(now()),
    evidence_hash: evidenceHash(res.bytes),
  };
}
