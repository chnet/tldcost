// Contract with the public API, without live calls: the fixtures follow the record schemas the API
// serves under /api/v1/schema/ (schema/*.schema.json in this repo), and they have the same shape as
// what the site's API builders produce from the current data/. If the API changes shape, this
// fails and the fixtures (scripts/make-fixtures.ts) and the client have to follow.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadData } from '@tldcost/core/load';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { buildAll, buildTld, buildTlds } from '../../../site/src/lib/api';
import { fixture } from './helpers.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const schema = (name: string) =>
  JSON.parse(readFileSync(join(ROOT, 'schema', `${name}.schema.json`), 'utf8')) as object;

/** Key structure of a JSON value (object keys recursively, first array element as sample). */
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .filter((k) => k !== 'tco')
        .sort()
        .map((k) => [k, shape((v as Record<string, unknown>)[k])]),
    );
  }
  return typeof v;
}

describe('API contract', () => {
  it('fixture records are valid against the served record schemas', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const offer = ajv.compile(schema('offer'));
    const provider = ajv.compile(schema('provider'));
    for (const file of ['offers/de.json', 'offers/com.json', 'all.json']) {
      const doc = fixture<{ offers: unknown[]; providers: unknown[] }>(file);
      for (const o of doc.offers) expect(offer(o), JSON.stringify(offer.errors)).toBe(true);
      for (const p of doc.providers)
        expect(provider(p), JSON.stringify(provider.errors)).toBe(true);
    }
  });

  it('fixture documents have the shape the site builds today', () => {
    const data = loadData(join(ROOT, 'data'));
    expect(shape(fixture('tlds.json'))).toEqual(shape(buildTlds(data)));
    expect(Object.keys(fixture('offers/de.json')).sort()).toEqual(
      Object.keys(buildTld(data, 'de')).sort(),
    );
    expect(Object.keys(fixture('all.json')).sort()).toEqual(Object.keys(buildAll(data)).sort());
    const derived = (d: { derived: { tco: Record<string, unknown> } }) =>
      shape(Object.values(d.derived.tco)[0]);
    expect(derived(fixture('offers/de.json'))).toEqual(derived(buildTld(data, 'de')));
    expect(buildTld(data, 'de').api_version).toBe(1);
  });
});
