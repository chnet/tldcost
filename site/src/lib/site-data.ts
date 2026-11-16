// Build time only: data/ and schema/ as the pages and API endpoints see them. TLDCOST_DATA_DIR
// lets the e2e tests build fixture variants (default ../data, relative to site/).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadData, type TldcostData } from '@tldcost/core/load';
import type { SchemaName } from './api';

let cached: TldcostData | undefined;

export function siteData(): TldcostData {
  cached ??= loadData(resolve(process.cwd(), process.env.TLDCOST_DATA_DIR ?? '../data'));
  return cached;
}

export function recordSchema(name: SchemaName): Record<string, unknown> {
  const file = resolve(process.cwd(), '../schema', `${name}.schema.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}
