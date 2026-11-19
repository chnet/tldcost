// Build time only: data/ and schema/ as the pages and API endpoints see them. TLDCOST_DATA_DIR
// lets the e2e tests build fixture variants (default ../data, relative to site/).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PriceHistory } from '@tldcost/core';
import { loadData, loadHistories, type TldcostData } from '@tldcost/core/load';
import type { SchemaName } from './api';

const dataDir = () => resolve(process.cwd(), process.env.TLDCOST_DATA_DIR ?? '../data');

let cached: TldcostData | undefined;
let cachedHistory: Map<string, PriceHistory> | undefined;

export function siteData(): TldcostData {
  cached ??= loadData(dataDir());
  return cached;
}

/** data/history/ by `<provider>/<tld>`, for the price history of the row detail (Archiv-Issue 51). */
export function siteHistory(): Map<string, PriceHistory> {
  cachedHistory ??= loadHistories(dataDir());
  return cachedHistory;
}

export function recordSchema(name: SchemaName): Record<string, unknown> {
  const file = resolve(process.cwd(), '../schema', `${name}.schema.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}
