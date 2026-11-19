// Node-only entry (@tldcost/core/load): reads data/ from disk. Kept out of the main entry so client
// bundles never pull in node:fs. Parses only; schema validation is scripts/validate-data.mjs.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { PriceHistory } from './history.js';
import type { FxRates, Offer, Provider } from './types.js';

export interface TldcostData {
  /** Sorted by id. */
  providers: Provider[];
  /** Sorted by provider id, then TLD. */
  offers: Offer[];
  /** ECB rate tables, sorted by date. */
  fx: FxRates[];
}

/** Code-unit order, not localeCompare: ids are [a-z0-9-] and the order must not depend on the locale. */
export const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a: Provider, b: Provider) => compareIds(a.id, b.id);
const byProviderTld = (a: Offer, b: Offer) =>
  compareIds(a.provider, b.provider) || compareIds(a.tld, b.tld);

function jsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (err) {
    throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * Loads <dir>/providers/<id>.json, <dir>/offers/<provider>/<tld>.json and <dir>/fx/<date>.json.
 * File names must match the ids/dates inside (throws otherwise); missing directories yield empty
 * lists.
 */
export function loadData(dir: string): TldcostData {
  const providers = jsonFiles(join(dir, 'providers')).map((f) => {
    const file = join(dir, 'providers', f);
    const p = readJson<Provider>(file);
    if (p.id !== basename(f, '.json')) throw new Error(`${file}: id '${p.id}' != file name`);
    return p;
  });
  const offers: Offer[] = [];
  for (const provider of subdirs(join(dir, 'offers'))) {
    for (const f of jsonFiles(join(dir, 'offers', provider))) {
      const file = join(dir, 'offers', provider, f);
      const o = readJson<Offer>(file);
      if (o.provider !== provider || o.tld !== basename(f, '.json')) {
        throw new Error(`${file}: provider/tld '${o.provider}/${o.tld}' != path`);
      }
      offers.push(o);
    }
  }
  const fx = jsonFiles(join(dir, 'fx')).map((f) => {
    const file = join(dir, 'fx', f);
    const t = readJson<FxRates>(file);
    if (t.date !== basename(f, '.json')) throw new Error(`${file}: date '${t.date}' != file name`);
    return t;
  });
  fx.sort((a, b) => compareIds(a.date, b.date));
  return { providers: providers.sort(byId), offers: offers.sort(byProviderTld), fx };
}

/**
 * Loads <dir>/history/<provider>/<tld>.json (schema/history.schema.json), keyed `<provider>/<tld>`.
 * Provider and TLD must match the path (throws otherwise); a missing directory yields an empty map.
 * Parses only; validate-data checks the entries against the offers.
 */
export function loadHistories(dir: string): Map<string, PriceHistory> {
  const out = new Map<string, PriceHistory>();
  for (const provider of subdirs(join(dir, 'history'))) {
    for (const f of jsonFiles(join(dir, 'history', provider))) {
      const file = join(dir, 'history', provider, f);
      const h = readJson<PriceHistory>(file);
      if (h.provider !== provider || h.tld !== basename(f, '.json')) {
        throw new Error(`${file}: provider/tld '${h.provider}/${h.tld}' != path`);
      }
      out.set(`${provider}/${h.tld}`, h);
    }
  }
  return out;
}
