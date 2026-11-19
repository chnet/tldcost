import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendHistory,
  FOREIGN_MARKET_CURRENCIES,
  HISTORY_STATE_FIELDS,
  type FxRates,
  type Offer,
} from '@tldcost/core';
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import {
  FOREIGN_MARKET_CURRENCIES as VALIDATE_MARKET_CURRENCIES,
  HISTORY_STATE_FIELDS as VALIDATE_STATE_FIELDS,
  validateDir,
} from '../../scripts/validate-data.mjs';
import { ADAPTERS } from '../src/adapters/index.js';
import { ECB_DAILY } from '../src/ecb.js';
import {
  checkDerivedListPrice,
  checkPlausibility,
  compareOffer,
  exitCode,
  gate,
  historyFile,
  mergeOffer,
  plausibilityLines,
  unknownFees,
  run,
  summarize,
  syncHistory,
  type RunOptions,
} from '../src/run.js';
import type { Adapter, AdapterResult, ScrapedOffer } from '../src/types.js';
import { newResult } from '../src/types.js';
import { fixture, testHttp } from './helpers.js';

const scraped = (tld: string, over: Partial<ScrapedOffer['price']> = {}): ScrapedOffer => ({
  tld,
  currency: 'EUR',
  vat_included: false,
  price: {
    unit: 'year',
    setup: 0,
    year1: 1000,
    year1_regular: 1000,
    renewal: 1000,
    term_years: 1,
    renewal_term_years: 1,
    transfer_in: 1000,
    ...over,
  },
  promo: null,
  evidence: {
    source_url: 'https://reg.example/prices',
    source_endpoint: 'https://reg.example/api',
    fetched_at: '2026-11-13T06:00:00Z',
    method: 'api',
    evidence_hash: `sha256:${'a'.repeat(64)}`,
    confidence: 'high',
  },
});

const adapter = (id: string, result: Partial<AdapterResult> | Error): Adapter => ({
  id,
  fetch: async () => {
    if (result instanceof Error) throw result;
    return { ...newResult(), ...result };
  },
});

let dir: string;
const provider = (id: string, country = 'DE') => {
  mkdirSync(join(dir, 'providers'), { recursive: true });
  writeFileSync(
    join(dir, 'providers', `${id}.json`),
    JSON.stringify({
      schema_version: 1,
      id,
      name: id,
      website: 'https://reg.example',
      country,
      vat_rate: 1900,
    }),
  );
};
const writeOffer = (o: Offer) => {
  mkdirSync(join(dir, 'offers', o.provider), { recursive: true });
  writeFileSync(join(dir, 'offers', o.provider, `${o.tld}.json`), JSON.stringify(o));
};
const readOffer = (p: string, tld: string) =>
  JSON.parse(readFileSync(join(dir, 'offers', p, `${tld}.json`), 'utf8')) as Offer;
const opts = (adapters: Adapter[], over: Partial<RunOptions> = {}): RunOptions => ({
  dataDir: dir,
  adapters,
  http: testHttp({}).http,
  tlds: ['de', 'com'],
  dryRun: false,
  fx: false,
  now: () => new Date('2026-11-13T06:00:00Z'),
  ...over,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tldcost-run-'));
});

describe('ADAPTERS', () => {
  it('registers the adapters in id order, each for a provider in data/', () => {
    const ids = ADAPTERS.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'all-inkl',
        'checkdomain',
        'domainfactory',
        'hetzner',
        'inwx',
        'netcup',
        'one-com',
        'porkbun',
        'strato',
        'united-domains',
      ]),
    );
    expect(ids).toEqual([...new Set(ids)].sort());
    for (const id of ids) {
      expect(existsSync(new URL(`../../data/providers/${id}.json`, import.meta.url)), id).toBe(
        true,
      );
    }
  });
});

describe('mergeOffer', () => {
  it('replaces scraped fields and keeps manual ones', () => {
    const existing: Offer = {
      ...mergeOffer('reg', undefined, scraped('de')),
      vat_rate: 2000,
      price: { ...scraped('de').price, transfer_out: 0, icann_fee_included: false },
      contract: { min_term_months: 12 },
      features: { dnssec: true },
      provider_verified: true,
    };
    const merged = mergeOffer('reg', existing, scraped('de', { renewal: 1100 }));
    expect(merged).toMatchObject({
      vat_rate: 2000,
      price: { renewal: 1100, transfer_out: 0, icann_fee_included: false },
      contract: { min_term_months: 12 },
      features: { dnssec: true },
      provider_verified: true,
    });
    expect(Object.keys(merged)).toEqual([
      'schema_version',
      'provider',
      'tld',
      'currency',
      'vat_included',
      'vat_rate',
      'price',
      'promo',
      'contract',
      'features',
      'evidence',
      'provider_verified',
    ]);
    expect(Object.keys(mergeOffer('reg', undefined, scraped('de')))).not.toContain('contract');
  });

  it('keeps feature_costs (sources of "paid" features, Archiv-Issue 124) unchanged, after features', () => {
    const costs: Offer['feature_costs'] = {
      dns_editor: {
        source: { url: 'https://reg.example/agb', quote: 'DNS-Verwaltung 1,90 € je Jahr' },
        price_cents: 190,
        unit: 'year',
        note: 'je Domain',
      },
      whois_privacy: {
        source: { url: 'https://reg.example/whois', quote: 'Whois Privacy 4,99 €' },
      },
    };
    const existing: Offer = {
      ...mergeOffer('reg', undefined, scraped('de')),
      features: { dns_editor: 'paid', whois_privacy: 'paid' },
      feature_costs: costs,
    };
    const merged = mergeOffer('reg', existing, scraped('de', { renewal: 1100 }));
    expect(merged.features).toEqual({ dns_editor: 'paid', whois_privacy: 'paid' });
    expect(merged.feature_costs).toEqual(costs);
    const keys = Object.keys(merged);
    expect(keys.slice(keys.indexOf('features'), keys.indexOf('features') + 3)).toEqual([
      'features',
      'feature_costs',
      'evidence',
    ]);
    expect(Object.keys(mergeOffer('reg', undefined, scraped('de')))).not.toContain('feature_costs');
  });

  it('keeps transfer_includes_term and its source when the source does not set them', () => {
    const existing: Offer = {
      ...mergeOffer('reg', undefined, scraped('de')),
    };
    existing.price = {
      ...existing.price,
      transfer_includes_term: true,
      transfer_includes_term_source: { quote: 'inklusive einem Jahr Laufzeit' },
    };
    const merged = mergeOffer('reg', existing, scraped('de', { renewal: 1100 }));
    expect(merged.price).toMatchObject({
      renewal: 1100,
      transfer_includes_term: true,
      transfer_includes_term_source: { quote: 'inklusive einem Jahr Laufzeit' },
    });
  });
});

describe('mergeOffer: price.setup_source belongs to the run', () => {
  const source = { url: 'https://registrar.example/domains/', quote: 'Einrichtung: 0 €' };
  const withSource = (setup_source: typeof source) => {
    const s = scraped('de');
    return { ...s, price: { ...s.price, setup_source } };
  };

  it('stores the source the adapter sets, and replaces a stored one', () => {
    expect(mergeOffer('reg', undefined, withSource(source)).price.setup_source).toEqual(source);
    const stored = mergeOffer('reg', undefined, withSource(source));
    const other = {
      url: 'https://registrar.example/de-domain/',
      quote: 'Einrichtungsgebühr | 0 €',
    };
    expect(mergeOffer('reg', stored, withSource(other)).price.setup_source).toEqual(other);
  });

  it('removes a stored source when the run takes the fee from the price itself', () => {
    const stored = mergeOffer('reg', undefined, withSource(source));
    const merged = mergeOffer('reg', stored, scraped('de'));
    expect(merged.price).not.toHaveProperty('setup_source');
    expect(compareOffer(stored, merged).fields.map((f) => f.path)).toEqual(['price.setup_source']);
  });
});

describe('mergeOffer: unknown fields and promos', () => {
  const stored: Offer = {
    ...mergeOffer('reg', undefined, scraped('de', { year1: 500 })),
    promo: { conditions: 'nur im ersten Jahr', valid_until: '2026-12-31' },
  };
  it('keeps fields and promo the source does not know', () => {
    const s = scraped('de', { year1: 400 });
    delete s.price.year1_regular;
    delete s.promo;
    const merged = mergeOffer('reg', stored, s);
    expect(merged.price).toMatchObject({ year1: 400, year1_regular: 1000 });
    expect(merged.promo).toEqual(stored.promo);
    expect(mergeOffer('reg', undefined, s).promo).toBeNull();
  });
  it('keeps hand-written conditions of the same promo only', () => {
    const same = mergeOffer('reg', stored, {
      ...scraped('de'),
      promo: { conditions: null, valid_until: '2026-12-31' },
    });
    expect(same.promo).toEqual({ conditions: 'nur im ersten Jahr', valid_until: '2026-12-31' });
    const other = mergeOffer('reg', stored, {
      ...scraped('de'),
      promo: { conditions: null, valid_until: '2027-01-31' },
    });
    expect(other.promo).toEqual({ conditions: null, valid_until: '2027-01-31' });
    const own = mergeOffer('reg', stored, {
      ...scraped('de'),
      promo: { conditions: 'limitiert', valid_until: '2026-12-31' },
    });
    expect(own.promo?.conditions).toBe('limitiert');
    expect(mergeOffer('reg', stored, scraped('de')).promo).toBeNull();
  });
  it('keeps the hand-maintained promo limit of the same promo only', () => {
    const limit = {
      max_per_customer: 3,
      max_per_customer_source: { quote: 'max. 3 Domains je Kunde' },
      limit_scope: 'per_customer' as const,
    };
    const withLimit: Offer = { ...stored, promo: { ...stored.promo, ...limit } };
    const same = mergeOffer('reg', withLimit, {
      ...scraped('de', { year1: 500 }),
      promo: { conditions: 'nur im ersten Jahr', valid_until: '2026-12-31' },
    });
    expect(same.promo).toEqual({
      conditions: 'nur im ersten Jahr',
      valid_until: '2026-12-31',
      ...limit,
    });
    // a limit the source states itself wins
    const stated = mergeOffer('reg', withLimit, {
      ...scraped('de', { year1: 500 }),
      promo: { conditions: null, valid_until: '2026-12-31', max_per_customer: 5 },
    });
    expect(stated.promo?.max_per_customer).toBe(5);
    // so do a source and scope the source states itself
    const statedScope = mergeOffer('reg', withLimit, {
      ...scraped('de', { year1: 500 }),
      promo: {
        conditions: null,
        valid_until: '2026-12-31',
        max_per_customer_source: { url: 'https://reg.example/aktion' },
        limit_scope: 'per_tld',
      },
    });
    expect(statedScope.promo).toMatchObject({
      max_per_customer: 3,
      max_per_customer_source: { url: 'https://reg.example/aktion' },
      limit_scope: 'per_tld',
    });
    // same date but a new year-1 price: a new promo, the limit is dropped (fail-safe)
    const repriced = mergeOffer('reg', withLimit, {
      ...scraped('de', { year1: 450 }),
      promo: { conditions: null, valid_until: '2026-12-31' },
    });
    expect(repriced.promo).toEqual({ conditions: 'nur im ersten Jahr', valid_until: '2026-12-31' });
    // a different or ended promo drops it
    const other = mergeOffer('reg', withLimit, {
      ...scraped('de'),
      promo: { conditions: null, valid_until: '2027-01-31' },
    });
    expect(other.promo).toEqual({ conditions: null, valid_until: '2027-01-31' });
    expect(mergeOffer('reg', withLimit, scraped('de')).promo).toBeNull();
  });
  it('valid_until null: "unlimited" stays only while year 1 is unchanged (Archiv-Issue 128 review)', () => {
    const unlimited = {
      conditions: 'Alle anderen TLDs unbegrenzt.',
      valid_until: null,
      max_per_customer: null,
      max_per_customer_source: { quote: 'Alle anderen TLDs unbegrenzt.' },
      limit_scope: 'unlimited' as const,
    };
    const base = mergeOffer('reg', undefined, scraped('de', { year1: 500 }));
    const held: Offer = { ...base, promo: unlimited };
    const promo = { conditions: null, valid_until: null };
    const unchanged = mergeOffer('reg', held, { ...scraped('de', { year1: 500 }), promo });
    expect(unchanged.promo).toEqual(unlimited);
    const newPrice = mergeOffer('reg', held, { ...scraped('de', { year1: 300 }), promo });
    expect(newPrice.promo).toEqual({
      conditions: 'Alle anderen TLDs unbegrenzt.',
      valid_until: null,
    });
    expect(newPrice.promo).not.toHaveProperty('limit_scope');
    expect(newPrice.promo).not.toHaveProperty('max_per_customer_source');
    // the same year-1 number in another currency, price unit or VAT mode is a new promo too
    const changed: Partial<ScrapedOffer>[] = [
      { currency: 'USD' },
      { vat_included: true },
      { price: { ...scraped('de', { year1: 500 }).price, unit: 'month' } },
    ];
    for (const over of changed) {
      const other = mergeOffer('reg', held, { ...scraped('de', { year1: 500 }), promo, ...over });
      expect(other.promo, JSON.stringify(over)).not.toHaveProperty('limit_scope');
      expect(other.promo, JSON.stringify(over)).not.toHaveProperty('max_per_customer');
      expect(other.promo, JSON.stringify(over)).not.toHaveProperty('max_per_customer_source');
    }
  });
  it('leaves default term years (1) out of the file', () => {
    expect(mergeOffer('reg', undefined, scraped('de')).price).not.toHaveProperty('term_years');
    const twoYears = mergeOffer(
      'reg',
      undefined,
      scraped('de', { term_years: 2, renewal_term_years: 2 }),
    );
    expect(twoYears.price).toMatchObject({ term_years: 2, renewal_term_years: 2 });
  });
});

describe('compareOffer / gate', () => {
  const base = mergeOffer('reg', undefined, scraped('de'));
  const next = (over: Partial<ScrapedOffer['price']>, top: Partial<ScrapedOffer> = {}) =>
    mergeOffer('reg', base, { ...scraped('de', over), ...top });

  it('classifies added, refreshed and changed offers', () => {
    expect(compareOffer(undefined, base).kind).toBe('added');
    const refreshed = mergeOffer('reg', base, {
      ...scraped('de'),
      evidence: { ...scraped('de').evidence, fetched_at: '2026-11-14T06:00:00Z' },
    });
    expect(compareOffer(base, refreshed)).toMatchObject({ kind: 'refreshed', fields: [] });
    const changed = next(
      { year1: 500 },
      { promo: { conditions: null, valid_until: '2026-12-31' } },
    );
    expect(compareOffer(base, changed).fields).toEqual([
      { path: 'price.year1', from: 1000, to: 500 },
      { path: 'promo', from: null, to: { conditions: null, valid_until: '2026-12-31' } },
    ]);
    const withYear2 = { ...base, price: { ...base.price, year2: 500 } };
    expect(compareOffer(withYear2, base).fields).toEqual([
      { path: 'price.year2', from: 500, to: null },
    ]);
    expect(compareOffer(base, withYear2).fields).toEqual([
      { path: 'price.year2', from: null, to: 500 },
    ]);
  });

  it('lists evidence changes beyond fetched_at and evidence_hash, without making the offer changed', () => {
    expect(compareOffer(undefined, base).evidence).toEqual([]);
    const ev = scraped('de').evidence;
    const moved = mergeOffer('reg', base, {
      ...scraped('de'),
      evidence: {
        ...ev,
        fetched_at: '2026-11-14T06:00:00Z',
        evidence_hash: `sha256:${'b'.repeat(64)}`,
        source_url: 'https://reg.example/new-prices',
        confidence: 'medium',
      },
    });
    expect(compareOffer(base, moved)).toEqual({
      provider: 'reg',
      tld: 'de',
      kind: 'refreshed',
      fields: [],
      evidence: [
        { path: 'evidence.confidence', from: 'high', to: 'medium' },
        {
          path: 'evidence.source_url',
          from: 'https://reg.example/prices',
          to: 'https://reg.example/new-prices',
        },
      ],
    });
    // a field the new evidence no longer has is listed as well
    const noEndpoint: typeof ev = { ...ev };
    delete noEndpoint.source_endpoint;
    const noApi = mergeOffer('reg', base, {
      ...scraped('de', { year1: 900 }),
      evidence: noEndpoint,
    });
    expect(compareOffer(base, noApi)).toMatchObject({
      kind: 'changed',
      fields: [{ path: 'price.year1', from: 1000, to: 900 }],
      evidence: [{ path: 'evidence.source_endpoint', from: 'https://reg.example/api', to: null }],
    });
  });

  it('blocks increases of setup and transfer_in from 0 or above 30 %, never decreases', () => {
    expect(gate(base, next({ setup: 2500 }))).toEqual(['setup 0 -> 2500 (from 0)']);
    expect(gate(base, next({ transfer_in: 1300 }))).toEqual([]);
    expect(gate(base, next({ transfer_in: 1301 }))).toEqual([
      'transfer_in 1000 -> 1301 (+30 %, end of a transfer promotion or a price increase (the data records no transfer promotion: compare with the source))',
    ]);
    expect(gate(base, next({ transfer_in: 1301 }), 0.5)).toEqual([]);
    expect(gate(base, next({ transfer_in: 0 }))).toEqual([]);
    expect(gate(base, next({ transfer_in: null }))).toEqual([]);
    const withSetup = mergeOffer('reg', undefined, scraped('de', { setup: 1000 }));
    expect(gate(withSetup, mergeOffer('reg', withSetup, scraped('de', { setup: 0 })))).toEqual([]);
    expect(gate(withSetup, mergeOffer('reg', withSetup, scraped('de', { setup: 2000 })))).toEqual([
      'setup 1000 -> 2000 (+100 %)',
    ]);
  });

  it('blocks list/renewal changes above 30 %, never year1', () => {
    expect(gate(undefined, base)).toEqual([]);
    expect(gate(base, next({ year1: 1 }))).toEqual([]);
    expect(gate(base, next({ renewal: 1300 }))).toEqual([]);
    expect(gate(base, next({ renewal: 1301 }))).toEqual(['renewal 1000 -> 1301 (30 %)']);
    expect(gate(base, next({ year1_regular: 600 }))).toEqual(['year1_regular 1000 -> 600 (40 %)']);
    expect(gate(base, next({ year1_regular: 600 }), 0.5)).toEqual([]);
    // a stored (year-1) promo that ends is named as the cause of a year1_regular jump only
    const onSale = { ...base, promo: { conditions: 'Sale', valid_until: null } };
    expect(gate(onSale, next({ year1_regular: 1400, renewal: 1400, transfer_in: 1400 }))).toEqual([
      'year1_regular 1000 -> 1400 (40 %, stored promo ended)',
      'renewal 1000 -> 1400 (40 %)',
      'transfer_in 1000 -> 1400 (+40 %, end of a transfer promotion or a price increase (the data records no transfer promotion: compare with the source))',
    ]);
    // the promo stays (undefined in the source): no hint
    expect(
      gate(
        onSale,
        mergeOffer('reg', onSale, { ...scraped('de', { renewal: 1400 }), promo: undefined }),
      ),
    ).toEqual(['renewal 1000 -> 1400 (40 %)']);
    expect(gate(base, next({ renewal: null }))).toEqual([]);
  });

  it('lets a setup/year1 re-split through (INWX .de: seed 111 + 391, API 0 + 502)', () => {
    const seed = mergeOffer(
      'reg',
      undefined,
      scraped('de', { setup: 111, year1: 391, year1_regular: null, renewal: 391 }),
    );
    const api = mergeOffer(
      'reg',
      seed,
      scraped('de', { setup: 0, year1: 502, year1_regular: 502, renewal: 391 }),
    );
    expect(gate(seed, api)).toEqual([]);
    expect(compareOffer(seed, api).fields.map((f) => f.path)).toEqual([
      'price.setup',
      'price.year1',
      'price.year1_regular',
    ]);
  });

  it('treats 0 specially and blocks changes of the price basis', () => {
    const zero = mergeOffer('reg', undefined, scraped('de', { renewal: 0 }));
    expect(gate(zero, mergeOffer('reg', zero, scraped('de', { renewal: 0 })))).toEqual([]);
    expect(gate(zero, mergeOffer('reg', zero, scraped('de', { renewal: 100 })))).toEqual([
      'renewal 0 -> 100 (from 0)',
    ]);
    expect(gate(base, next({}, { currency: 'USD' }))).toEqual(['currency EUR -> USD']);
    expect(gate(base, next({ unit: 'month' }))).toEqual(['unit year -> month']);
    expect(gate(base, next({ term_years: 2 }))).toEqual(['term years changed']);
    expect(gate(base, next({ renewal_term_years: 2 }))).toEqual(['term years changed']);
    expect(gate(base, next({}, { vat_included: true }))).toEqual(['vat_included changed']);
    const noTerms = { ...base.price };
    delete noTerms.term_years;
    delete noTerms.renewal_term_years;
    expect(gate({ ...base, price: noTerms }, base)).toEqual([]);
    expect(gate(base, { ...base, price: noTerms })).toEqual([]);
  });
});

describe('run', () => {
  it('writes new offers as valid, prettier-formatted data', async () => {
    provider('reg');
    const report = await run(opts([adapter('reg', { offers: [scraped('de'), scraped('com')] })]));
    expect(report.changes.map((c) => `${c.kind}:${c.tld}`)).toEqual(['added:de', 'added:com']);
    // two offers plus their price histories
    expect(report.written).toEqual([
      join(dir, 'offers', 'reg', 'de.json'),
      historyFile(dir, 'reg', 'de'),
      join(dir, 'offers', 'reg', 'com.json'),
      historyFile(dir, 'reg', 'com'),
    ]);
    expect(exitCode(report)).toBe(0);
    expect(validateDir(dir)).toEqual([]);
    const text = readFileSync(join(dir, 'offers', 'reg', 'de.json'), 'utf8');
    expect(text).toMatch(/^\{\n {2}"schema_version": 2,\n/);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('a run keeps "paid" features with their sources: the data stays valid (Archiv-Issue 124)', async () => {
    provider('reg');
    const costs: Offer['feature_costs'] = {
      custom_ns: { source: { url: 'https://reg.example/agb', quote: 'Eigene Nameserver 1,90 €' } },
    };
    writeOffer({
      ...mergeOffer('reg', undefined, scraped('de')),
      features: { custom_ns: 'paid' },
      feature_costs: costs,
    });
    const report = await run(
      opts([adapter('reg', { offers: [scraped('de', { renewal: 1100 })] })]),
    );
    // the offer and its history (seeded: the stored offer had none)
    expect(report.written).toEqual([
      join(dir, 'offers', 'reg', 'de.json'),
      historyFile(dir, 'reg', 'de'),
    ]);
    expect(readOffer('reg', 'de').feature_costs).toEqual(costs);
    expect(validateDir(dir)).toEqual([]);
  });

  it('price history: an entry only when the price state changes, none on an unchanged run', async () => {
    provider('reg');
    const at = (fetched_at: string, over: Partial<ScrapedOffer['price']> = {}) => {
      const s = scraped('de', over);
      return { ...s, evidence: { ...s.evidence, fetched_at } };
    };
    const history = () => JSON.parse(readFileSync(historyFile(dir, 'reg', 'de'), 'utf8'));
    await run(opts([adapter('reg', { offers: [at('2026-11-13T06:00:00Z')] })]));
    expect(history().entries.map((e: { date: string }) => e.date)).toEqual(['2026-11-13']);
    const first = readFileSync(historyFile(dir, 'reg', 'de'), 'utf8');

    // no change, no entry: the offer's evidence is refreshed, the history file is not written
    const same = await run(opts([adapter('reg', { offers: [at('2026-11-20T06:00:00Z')] })]));
    expect(same.written).toEqual([join(dir, 'offers', 'reg', 'de.json')]);
    expect(readFileSync(historyFile(dir, 'reg', 'de'), 'utf8')).toBe(first);
    expect(readOffer('reg', 'de').evidence.fetched_at).toBe('2026-11-20T06:00:00Z');

    // a renewal change: one entry, dated with the fetch day, source = the offer's evidence
    await run(opts([adapter('reg', { offers: [at('2026-11-27T06:00:00Z', { renewal: 1100 })] })]));
    const h = history();
    expect(h.entries).toHaveLength(2);
    expect(h.entries[1]).toEqual({
      date: '2026-11-27',
      currency: 'EUR',
      vat_included: false,
      unit: 'year',
      setup: 0,
      year1: 1000,
      renewal: 1100,
      transfer_in: 1000,
      source: { url: 'https://reg.example/prices', fetched_at: '2026-11-27T06:00:00Z' },
    });
    expect(validateDir(dir)).toEqual([]);
    // a dry run writes no history either
    await run(
      opts([adapter('reg', { offers: [at('2026-11-28T06:00:00Z', { renewal: 1200 })] })], {
        dryRun: true,
      }),
    );
    expect(history().entries).toHaveLength(2);
  });

  it('a history error skips only that offer and is reported; the run goes on', async () => {
    provider('reg');
    // stored history with a later entry than this run's evidence (e.g. a hand-entered date)
    const stored = mergeOffer('reg', undefined, scraped('de', { renewal: 900 }));
    writeOffer(stored);
    mkdirSync(join(dir, 'history', 'reg'), { recursive: true });
    const later = {
      ...stored,
      evidence: { ...stored.evidence, fetched_at: '2026-12-01T06:00:00Z' },
    };
    const { history } = appendHistory(undefined, later);
    writeFileSync(historyFile(dir, 'reg', 'de'), JSON.stringify(history));
    const report = await run(opts([adapter('reg', { offers: [scraped('de'), scraped('com')] })]));
    expect(report.violations).toEqual([
      {
        provider: 'reg',
        tld: 'de',
        kind: 'history',
        reason: expect.stringMatching(/older than the last history entry 2026-12-01/),
      },
    ]);
    expect(report.providers[0]?.warnings).toEqual([
      expect.stringMatching(/^\.de: .*older than the last history entry.*, offer not written$/),
    ]);
    expect(exitCode(report)).toBe(0); // not a gate: the update report lists it as not updated
    expect(report.written).toEqual([
      join(dir, 'offers', 'reg', 'com.json'),
      historyFile(dir, 'reg', 'com'),
    ]);
    expect(readOffer('reg', 'de').price.renewal).toBe(900); // stored offer untouched
  });

  it('syncHistory seeds missing histories, appends hand edits, then stays unchanged', async () => {
    provider('reg');
    const offer = mergeOffer('reg', undefined, scraped('de'));
    writeOffer(offer);
    expect(await syncHistory(dir, { dryRun: true })).toEqual({
      written: [historyFile(dir, 'reg', 'de')],
      unchanged: 0,
    });
    expect(existsSync(historyFile(dir, 'reg', 'de'))).toBe(false);
    expect(await syncHistory(dir)).toEqual({
      written: [historyFile(dir, 'reg', 'de')],
      unchanged: 0,
    });
    expect(validateDir(dir)).toEqual([]);
    expect(await syncHistory(dir)).toEqual({ written: [], unchanged: 1 });
    // a hand edit of the price with a newer fetch date: one more entry
    writeOffer({
      ...offer,
      price: { ...offer.price, renewal: 1290 },
      evidence: { ...offer.evidence, method: 'manual', fetched_at: '2026-11-30T10:00:00Z' },
    });
    expect(validateDir(dir).join('\n')).toMatch(/last entry differs from the offer \(renewal\)/);
    expect((await syncHistory(dir)).written).toHaveLength(1);
    expect(validateDir(dir)).toEqual([]);
  });

  it('the price state fields agree in core, validate-data and the history schema', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../../schema/history.schema.json', import.meta.url), 'utf8'),
    );
    const required = (schema.$defs.entry.required as string[]).filter(
      (f) => f !== 'date' && f !== 'source',
    );
    expect([...HISTORY_STATE_FIELDS]).toEqual(required);
    expect([...VALIDATE_STATE_FIELDS]).toEqual(required);
    // and the currencies of a foreign market display (owner decision 2026-11-19)
    expect([...VALIDATE_MARKET_CURRENCIES]).toEqual([...FOREIGN_MARKET_CURRENCIES]);
  });

  it('dry run writes nothing but reports everything', async () => {
    provider('reg');
    const report = await run(opts([adapter('reg', { offers: [scraped('de')] })], { dryRun: true }));
    expect(report.changes).toHaveLength(1);
    expect(report.written).toEqual([]);
    expect(existsSync(join(dir, 'offers'))).toBe(false);
    expect(summarize(report)).toMatch(/dry run: nothing written/);
  });

  it('keeps gate-blocked offers unchanged and fails the run', async () => {
    provider('reg');
    writeOffer(mergeOffer('reg', undefined, scraped('de')));
    writeOffer(mergeOffer('reg', undefined, scraped('com')));
    const report = await run(
      opts([
        adapter('reg', {
          offers: [scraped('de', { renewal: 2000 }), scraped('com', { year1: 900 })],
        }),
      ]),
    );
    expect(report.violations).toEqual([
      { provider: 'reg', tld: 'de', kind: 'gate', reason: 'renewal 1000 -> 2000 (100 %)' },
    ]);
    expect(readOffer('reg', 'de').price.renewal).toBe(1000);
    expect(readOffer('reg', 'com').price.year1).toBe(900);
    expect(exitCode(report)).toBe(1);
    expect(summarize(report)).toMatch(/! GATE reg\/de: renewal 1000 -> 2000/);
  });

  it('never writes blocked offers (fail closed) and reports them', async () => {
    provider('reg');
    writeOffer(mergeOffer('reg', undefined, scraped('de')));
    const report = await run(
      opts([
        adapter('reg', {
          offers: [
            { ...scraped('de', { year1: 1 }), blocked: 'CSV promo?' },
            { ...scraped('com'), blocked: 'CSV promo?' },
          ],
        }),
      ]),
    );
    expect(report.violations.map((v) => `${v.tld} ${v.kind}: ${v.reason}`)).toEqual([
      'de blocked: CSV promo?',
      'com blocked: CSV promo?',
    ]);
    expect(report.providers[0]?.warnings).toEqual([
      '.de: CSV promo?, offer not written',
      '.com: CSV promo?, offer not written',
    ]);
    expect(readOffer('reg', 'de').price.year1).toBe(1000);
    expect(existsSync(join(dir, 'offers', 'reg', 'com.json'))).toBe(false);
    // stored data untouched, nothing wrong written: reported only
    expect(exitCode(report)).toBe(0);
    expect(summarize(report)).toContain('! BLOCKED reg/de: CSV promo?');
  });

  it('reports every kind of an offer; one gate kind fails the run', async () => {
    provider('reg');
    writeOffer(mergeOffer('reg', undefined, scraped('de')));
    const report = await run(
      opts([
        adapter('reg', {
          offers: [{ ...scraped('de', { renewal: 5000 }), blocked: 'CSV promo?' }],
        }),
      ]),
    );
    expect(report.violations.map((v) => v.kind)).toEqual(['blocked', 'gate']);
    expect(report.providers[0]?.warnings).toEqual(['.de: CSV promo?, offer not written']);
    expect(exitCode(report)).toBe(1);
  });

  it('writes a sale price only when the stored offer has a promo for it', async () => {
    provider('reg');
    writeOffer({
      ...mergeOffer('reg', undefined, scraped('de')),
      promo: { conditions: 'Sale', valid_until: null },
    });
    writeOffer(mergeOffer('reg', undefined, scraped('com')));
    const sale = (tld: string) => {
      const s: ScrapedOffer = {
        ...scraped(tld, { year1: 500 }),
        promoRequired: 'first-year sale without a stored promo',
      };
      delete s.price.year1_regular;
      delete s.promo;
      return s;
    };
    const report = await run(opts([adapter('reg', { offers: [sale('de'), sale('com')] })]));
    expect(readOffer('reg', 'de')).toMatchObject({
      price: { year1: 500, year1_regular: 1000 },
      promo: { conditions: 'Sale' },
    });
    expect(readOffer('reg', 'com').price.year1).toBe(1000);
    expect(report.violations).toEqual([
      {
        provider: 'reg',
        tld: 'com',
        kind: 'promo-required',
        reason: 'first-year sale without a stored promo',
      },
    ]);
    expect(report.providers[0]?.warnings).toEqual([
      '.com: first-year sale without a stored promo, offer not written',
    ]);
    expect(exitCode(report)).toBe(0);
  });

  it('flags offers the provider no longer lists, keeping the file', async () => {
    provider('reg');
    writeOffer(mergeOffer('reg', undefined, scraped('de')));
    const report = await run(opts([adapter('reg', { notOffered: ['de', 'com'] })]));
    expect(report.violations).toEqual([
      {
        provider: 'reg',
        tld: 'de',
        kind: 'delisted',
        reason: expect.stringMatching(/no longer listed/),
      },
    ]);
    expect(report.providers[0]?.warnings).toEqual([
      '.de: offer no longer listed by the provider (file kept)',
    ]);
    expect(existsSync(join(dir, 'offers', 'reg', 'de.json'))).toBe(true);
    expect(exitCode(report)).toBe(0);
  });

  it('isolates adapters: missing provider file, a throwing adapter, failed TLDs', async () => {
    provider('ok');
    provider('broken');
    provider('partial');
    const logs: string[] = [];
    const report = await run(
      opts(
        [
          adapter('nofile', { offers: [scraped('de')] }),
          adapter('broken', new Error('boom')),
          adapter('partial', {
            offers: [scraped('de')],
            failed: [{ tld: 'com', reason: 'bad' }],
            skipped: [{ tld: 'ai', reason: 'why' }],
            warnings: ['w'],
            notOffered: ['at'],
          }),
          adapter('ok', { offers: [scraped('com')] }),
        ],
        { log: (m) => logs.push(m) },
      ),
    );
    expect(report.providers.map((p) => `${p.id}:${p.status}`)).toEqual([
      'nofile:no-provider-file',
      'broken:failed',
      'partial:ok',
      'ok:ok',
    ]);
    expect(readdirSync(join(dir, 'offers'))).toEqual(['ok', 'partial']);
    // failures leave stored data untouched: reported, not a failed run
    expect(exitCode(report)).toBe(0);
    expect(logs).toEqual(['nofile: skipped, no data/providers/nofile.json', 'broken: FAILED boom']);
    const summary = summarize(report);
    for (const line of [
      'broken: failed (boom), 0 offers',
      '  not offered: at',
      '  skipped .ai: why',
      '  FAILED .com: bad',
      '  warning: w',
      '+ ok/com (new)',
    ]) {
      expect(summary).toContain(line);
    }
  });

  it('summarises changed and refreshed offers', async () => {
    provider('reg');
    writeOffer(mergeOffer('reg', undefined, scraped('de')));
    writeOffer(mergeOffer('reg', undefined, scraped('com')));
    const report = await run(
      opts([adapter('reg', { offers: [scraped('de', { year1: 990 }), scraped('com')] })]),
    );
    expect(summarize(report)).toContain(
      '~ reg/de\n    price.year1: 1000 -> 990\n= 1 offers unchanged (evidence refreshed)',
    );
    expect(exitCode(report)).toBe(0);
  });

  it('summarises evidence changes of changed and refreshed offers', async () => {
    provider('reg');
    writeOffer(mergeOffer('reg', undefined, scraped('de')));
    writeOffer(mergeOffer('reg', undefined, scraped('com')));
    const csv = (s: ScrapedOffer): ScrapedOffer => ({
      ...s,
      evidence: { ...s.evidence, method: 'csv', confidence: 'medium' },
    });
    const report = await run(
      opts([adapter('reg', { offers: [csv(scraped('de', { year1: 990 })), csv(scraped('com'))] })]),
    );
    expect(report.changes.map((c) => [c.tld, c.kind, c.evidence.length])).toEqual([
      ['de', 'changed', 2],
      ['com', 'refreshed', 2],
    ]);
    expect(summarize(report)).toContain(
      [
        '~ reg/de',
        '    price.year1: 1000 -> 990',
        '    evidence.confidence: "high" -> "medium"',
        '    evidence.method: "api" -> "csv"',
        '= reg/com (evidence changed)',
        '    evidence.confidence: "high" -> "medium"',
        '    evidence.method: "api" -> "csv"',
        '= 1 offers unchanged (evidence refreshed)',
      ].join('\n'),
    );
  });

  it('a derived list price below the stored one needs a stored promo (sale at or above renewal)', async () => {
    provider('reg');
    // de: a sale the maintainer recorded; com: no promo stored
    writeOffer({
      ...mergeOffer('reg', undefined, scraped('de', { renewal: 900 })),
      promo: { conditions: 'Sale', valid_until: null },
    });
    writeOffer(mergeOffer('reg', undefined, scraped('com', { renewal: 900 })));
    const derived = (tld: string, year1: number): ScrapedOffer => ({
      ...scraped(tld, { year1, year1_regular: year1, renewal: 900 }),
      derivedListPrice: true,
    });
    const report = await run(
      opts([adapter('reg', { offers: [derived('de', 950), derived('com', 950)] })]),
    );
    expect(readOffer('reg', 'de')).toMatchObject({
      price: { year1: 950, year1_regular: 1000, renewal: 900 },
      promo: { conditions: 'Sale' },
    });
    expect(readOffer('reg', 'de')).not.toHaveProperty('derivedListPrice');
    expect(readOffer('reg', 'com').price).toMatchObject({ year1: 1000, year1_regular: 1000 });
    expect(report.violations).toEqual([
      {
        provider: 'reg',
        tld: 'com',
        kind: 'promo-required',
        reason:
          'year1 950 below the stored list price 1000 without a stored promo (sale at or above renewal, or a new list price: check by hand)',
      },
    ]);
    expect(exitCode(report)).toBe(0);
  });

  it('warns when a derived list price replaces a promo without a stored list price', async () => {
    provider('reg');
    writeOffer({
      ...mergeOffer('reg', undefined, scraped('de', { year1: 500, year1_regular: null })),
      promo: { conditions: 'Sale', valid_until: null },
    });
    const s: ScrapedOffer = {
      ...scraped('de', { year1: 950, year1_regular: 950 }),
      derivedListPrice: true,
    };
    const report = await run(opts([adapter('reg', { offers: [s] })]));
    expect(readOffer('reg', 'de')).toMatchObject({
      price: { year1: 950, year1_regular: 950 },
      promo: null,
    });
    expect(report.violations).toEqual([]);
    expect(report.providers[0]?.warnings).toEqual([
      '.de: year1 950 taken as the list price and the stored promo removed; without a stored list price a sale at or above renewal looks the same: check by hand',
    ]);
  });

  it('does not write an offer whose known setup or transfer fee became unknown', async () => {
    provider('reg');
    writeOffer(mergeOffer('reg', undefined, scraped('de')));
    const report = await run(
      opts([adapter('reg', { offers: [scraped('de', { setup: null, year1: 900 })] })]),
    );
    expect(readOffer('reg', 'de').price).toMatchObject({ setup: 0, year1: 1000 });
    expect(report.violations).toEqual([
      {
        provider: 'reg',
        tld: 'de',
        kind: 'blocked',
        reason: 'setup 0 -> null: a known fee became unknown',
      },
    ]);
    expect(report.providers[0]?.warnings).toEqual([
      '.de: setup 0 -> null: a known fee became unknown, offer not written',
    ]);
    expect(exitCode(report)).toBe(0);
  });

  describe('fx', () => {
    const ecb = (body = fixture('ecb/eurofxref-daily.xml')) =>
      testHttp({
        'https://www.ecb.europa.eu/robots.txt': { body: 'User-agent: *\nCrawl-delay: 5\n' },
        [ECB_DAILY]: { body },
      }).http;

    it('adds the ECB day once', async () => {
      const first = await run(opts([], { fx: true, http: ecb() }));
      expect(first.fx).toEqual({ status: 'added', date: '2026-11-12' });
      expect(first.requests).toBe(2);
      expect(validateDir(dir)).toEqual([]);
      const again = await run(opts([], { fx: true, http: ecb() }));
      expect(again.fx).toEqual({ status: 'unchanged', date: '2026-11-12' });
      expect(summarize(again)).toContain('fx: unchanged 2026-11-12');
    });

    it('reports a broken feed without failing the run', async () => {
      const report = await run(opts([], { fx: true, http: ecb('<html>') }));
      expect(report.fx).toEqual({ status: 'failed', error: 'ECB feed: no <Cube time="...">' });
      expect(exitCode(report)).toBe(0);
      expect(summarize(report)).toContain('fx: failed (ECB feed: no <Cube time="...">)');
    });
  });

  it('uses defaults for clock and log', async () => {
    const report = await run({
      dataDir: dir,
      adapters: [adapter('x', {})],
      http: testHttp({}).http,
      tlds: [],
      dryRun: true,
      fx: false,
    });
    expect(report.providers[0]?.status).toBe('no-provider-file');
  });
});

describe('plausibility check', () => {
  /** Stored EUR gross offer with a yearly renewal price (cents). */
  const stored = (provider: string, renewal: number, tld = 'de'): Offer => ({
    ...mergeOffer(provider, undefined, scraped(tld, { year1: renewal, renewal })),
    vat_included: true,
  });

  it('lists a monthly price taken as yearly, also in a dry run, without changing the exit code', async () => {
    for (const id of ['a', 'b', 'c', 'reg']) provider(id);
    writeOffer(stored('a', 500));
    writeOffer(stored('b', 550));
    writeOffer(stored('c', 600));
    // a NEW offer (a changed stored one would already stop at the 30 % gate): net 0.35 €/month read
    // as a yearly price, 35 net = 42 gross per year against a median of 550
    const wrong = scraped('de', { year1: 35, year1_regular: 35, renewal: 35 });
    const report = await run(opts([adapter('reg', { offers: [wrong] })], { dryRun: true }));
    expect(report.plausibility).toEqual({
      low: 1 / 3,
      high: 3,
      minOthers: 3,
      hits: [
        {
          provider: 'reg',
          tld: 'de',
          field: 'price.renewal',
          value: 42,
          median: 550,
          ratio: 42 / 550,
          direction: 'below',
          others: 3,
        },
      ],
      uncomparable: [],
    });
    expect(summarize(report)).toContain(
      '? PLAUSIBILITY reg/de: 0,42 €/year gross (price.renewal) vs median 5,50 € of 3 other providers = 0.08x (below 0.33x)',
    );
    expect(exitCode(report)).toBe(0);
    expect(report.written).toEqual([]); // dry run: checked, but nothing written
    expect(existsSync(join(dir, 'offers', 'reg', 'de.json'))).toBe(false);
  });

  it('configurable bounds; above the median', async () => {
    for (const id of ['a', 'b', 'c', 'd']) provider(id);
    writeOffer(stored('a', 500));
    writeOffer(stored('b', 500));
    writeOffer(stored('d', 500));
    writeOffer(stored('c', 1200));
    const strict = await run(opts([], { plausibility: { high: 2 } }));
    expect(strict.plausibility?.hits.map((h) => [h.provider, h.direction])).toEqual([
      ['c', 'above'],
    ]);
    expect(plausibilityLines(strict.plausibility)).toEqual([
      'plausibility: 1 hit(s) (outside 0.33x..2x of the TLD median)',
      '? PLAUSIBILITY c/de: 12,00 €/year gross (price.renewal) vs median 5,00 € of 3 other providers = 2.40x (above 2x)',
    ]);
    const lax = await run(opts([]));
    expect(lax.plausibility?.hits).toEqual([]);
    expect(summarize(lax)).toContain(
      'plausibility: 0 hit(s) (outside 0.33x..3x of the TLD median)',
    );
  });

  it('uses the ECB day fetched in this run for foreign currencies', () => {
    for (const id of ['a', 'b', 'c', 'u']) provider(id);
    writeOffer(stored('a', 500));
    writeOffer(stored('b', 500));
    writeOffer(stored('c', 500));
    const usd: Offer = { ...stored('u', 5500), currency: 'USD', vat_included: null };
    const fx: FxRates = {
      schema_version: 1,
      source: 'ECB',
      date: '2026-11-12',
      base: 'EUR',
      rates: { USD: 1.1 },
    };
    // without any rate the USD offer is not comparable: the three EUR offers agree, no hit
    expect(checkPlausibility({ dataDir: dir }, [usd]).hits).toEqual([]);
    // with the fetched day: 50 € against 5 € -> above
    expect(checkPlausibility({ dataDir: dir }, [usd], fx).hits.map((h) => h.provider)).toEqual([
      'u',
    ]);
    // the same day already stored: the stored table is used, not added twice
    mkdirSync(join(dir, 'fx'), { recursive: true });
    writeFileSync(join(dir, 'fx', '2026-11-12.json'), JSON.stringify(fx));
    expect(checkPlausibility({ dataDir: dir }, [usd], fx).hits).toHaveLength(1);
  });

  it('counts the offers that cannot be compared, by reason', () => {
    for (const id of ['a', 'b', 'c', 'm']) provider(id);
    writeOffer(stored('a', 500));
    writeOffer(stored('b', 550));
    writeOffer(stored('c', 600));
    // a monthly price with a 12-year term: the TCO rejects it, so the check leaves it out
    writeOffer({
      ...stored('m', 50),
      price: { ...stored('m', 50).price, unit: 'month', term_years: 12 },
    });
    const p = checkPlausibility({ dataDir: dir }, []);
    expect(p.uncomparable).toEqual([{ provider: 'm', tld: 'de', reason: 'term' }]);
    expect(plausibilityLines(p)[0]).toBe(
      'plausibility: 0 hit(s) (outside 0.33x..3x of the TLD median), 1 offer(s) not comparable (1 term)',
    );
    // several reasons: counted per reason, sorted by name
    writeOffer({ ...stored('c', 600), price: { ...stored('c', 600).price, renewal: 0 } });
    writeOffer({
      ...stored('b', 550),
      price: { ...stored('b', 550).price, renewal: null, year1_regular: null },
    });
    expect(plausibilityLines(checkPlausibility({ dataDir: dir }, []))[0]).toBe(
      'plausibility: 0 hit(s) (outside 0.33x..3x of the TLD median), 3 offer(s) not comparable (1 no-price, 1 term, 1 zero)',
    );
  });

  it('reports a check that cannot run instead of failing', () => {
    mkdirSync(join(dir, 'offers', 'a'), { recursive: true });
    writeFileSync(join(dir, 'offers', 'a', 'de.json'), '{');
    const p = checkPlausibility({ dataDir: dir }, []);
    expect(p.hits).toEqual([]);
    expect(p.uncomparable).toEqual([]);
    expect(p.error).toMatch(/de\.json/);
    expect(plausibilityLines(p)).toEqual([`? PLAUSIBILITY check failed: ${p.error}`]);
    expect(plausibilityLines(undefined)).toEqual([]);
  });
});

describe('checkDerivedListPrice', () => {
  const TODAY = '2026-11-16';
  const stored = mergeOffer('reg', undefined, scraped('de', { renewal: 900 }));
  const derived = (year1: number, over: Partial<ScrapedOffer> = {}): ScrapedOffer => ({
    ...scraped('de', { year1, year1_regular: year1, renewal: 900 }),
    derivedListPrice: true,
    ...over,
  });
  const check = (existing: Offer | undefined, s: ScrapedOffer) =>
    checkDerivedListPrice(existing, s, TODAY);

  it('passes a stated list price, a new offer and an equal or higher derived list price', () => {
    const stated = { ...derived(950) };
    delete stated.derivedListPrice;
    expect(check(stored, stated)).toEqual({ offer: stated });
    expect(check(undefined, derived(950))).toEqual({ offer: derived(950) });
    expect(check(stored, derived(1000))).toEqual({ offer: derived(1000) });
    expect(check(stored, derived(1100))).toEqual({ offer: derived(1100) });
    const noList = { ...stored, price: { ...stored.price, year1_regular: null } };
    expect(check(noList, derived(950))).toEqual({ offer: derived(950) });
  });

  it('keeps the stored list price and promo for a current recorded sale, else asks for a human', () => {
    const withPromo = (valid_until: string | null): Offer => ({
      ...stored,
      promo: { conditions: 'Sale', valid_until },
    });
    for (const until of [null, TODAY, '2026-12-31']) {
      const kept = check(withPromo(until), derived(950));
      expect(kept.promoRequired).toBeUndefined();
      expect(kept.offer.price).toMatchObject({ year1: 950, year1_regular: 1000 });
      expect(kept.offer).not.toHaveProperty('promo');
    }
    expect(check(stored, derived(950)).promoRequired).toBe(
      'year1 950 below the stored list price 1000 without a stored promo (sale at or above renewal, or a new list price: check by hand)',
    );
    // an expired promo is not the current sale
    expect(check(withPromo('2026-11-15'), derived(950))).toEqual({
      offer: derived(950),
      promoRequired:
        'year1 950 below the stored list price 1000 without a current promo (stored promo ended 2026-11-15) (sale at or above renewal, or a new list price: check by hand)',
    });
  });

  it('writes an offer without a stored list price but with a stored promo, with a warning', () => {
    const saleOnly: Offer = {
      ...stored,
      price: { ...stored.price, year1: 500, year1_regular: null },
      promo: { conditions: 'Sale', valid_until: null },
    };
    expect(check(saleOnly, derived(950))).toEqual({
      offer: derived(950),
      warning:
        'year1 950 taken as the list price and the stored promo removed; without a stored list price a sale at or above renewal looks the same: check by hand',
    });
    const noDerived = { ...derived(950) };
    delete noDerived.price.year1_regular;
    expect(check(saleOnly, noDerived)).toEqual({ offer: noDerived });
  });
});

describe('unknownFees', () => {
  const base = mergeOffer('reg', undefined, scraped('de'));
  const next = (over: Partial<ScrapedOffer['price']>) =>
    mergeOffer('reg', base, scraped('de', over));

  it('flags a stored setup or transfer fee that becomes null, nothing else', () => {
    expect(unknownFees(undefined, base)).toEqual([]);
    expect(unknownFees(base, base)).toEqual([]);
    expect(unknownFees(base, next({ setup: null, transfer_in: null }))).toEqual([
      'setup 0 -> null: a known fee became unknown',
      'transfer_in 1000 -> null: a known fee became unknown',
    ]);
    // a sale start may hide the list price: not a one-time fee, not flagged
    expect(unknownFees(base, next({ year1_regular: null }))).toEqual([]);
    const unknown = next({ transfer_in: null });
    expect(unknownFees(unknown, next({ transfer_in: null }))).toEqual([]);
    expect(unknownFees(unknown, next({ transfer_in: 1500 }))).toEqual([]);
  });
});

describe('market switch (owner decision 2026-11-19, Fremdmarkt)', () => {
  const US = { country: 'US', currency: 'USD', quote: 'Domainpreise in USD: .de 9,99 9,99' };
  /** The German display: EUR, gross. */
  const german = (over: Partial<ScrapedOffer['price']> = {}): ScrapedOffer => ({
    ...scraped('de', over),
    vat_included: true,
  });
  /** The US display: USD, net, foreign_market. */
  const us = (
    over: Partial<ScrapedOffer['price']> = {},
    market: ScrapedOffer['foreign_market'] | null = US,
  ): ScrapedOffer => ({
    ...scraped('de', over),
    currency: 'USD',
    vat_included: false,
    ...(market ? { foreign_market: market } : {}),
  });
  const deOffer = mergeOffer('reg', undefined, german());
  const usOffer = mergeOffer('reg', undefined, us());

  it('mergeOffer takes foreign_market from the scraped offer and drops a stored one', () => {
    expect(usOffer.foreign_market).toEqual(US);
    expect(Object.keys(usOffer)).toEqual([
      'schema_version',
      'provider',
      'tld',
      'currency',
      'vat_included',
      'price',
      'promo',
      'foreign_market',
      'evidence',
      'provider_verified',
    ]);
    expect(mergeOffer('reg', usOffer, german()).foreign_market).toBeUndefined();
  });

  it('the gate lets the switch through only with foreign_market, in both directions', () => {
    const toUs = mergeOffer('reg', deOffer, us({ renewal: 5000 }));
    expect(gate(deOffer, toUs)).toEqual([]);
    expect(compareOffer(deOffer, toUs).market).toBe('DE -> US');
    const back = mergeOffer('reg', usOffer, german({ renewal: 5000 }));
    expect(gate(usOffer, back)).toEqual([]);
    expect(compareOffer(usOffer, back).market).toBe('US -> DE');
    // the same currency and VAT change without foreign_market: blocked as before
    const plainUsd = mergeOffer('reg', deOffer, us({}, null));
    expect(gate(deOffer, plainUsd)).toEqual(['currency EUR -> USD', 'vat_included changed']);
    expect(compareOffer(deOffer, plainUsd).market).toBeUndefined();
    expect(gate(plainUsd, mergeOffer('reg', plainUsd, german()))).toEqual([
      'currency USD -> EUR',
      'vat_included changed',
    ]);
  });

  it('the gate keeps every other rule on a switch and within a market', () => {
    // unit change on a switch
    expect(gate(deOffer, mergeOffer('reg', deOffer, us({ unit: 'month' })))).toEqual([
      'currency EUR -> USD',
      'foreign_market changed without a market switch (EUR/vat_included true -> USD/vat_included false/foreign_market US; only EUR gross <-> USD net with foreign_market)',
      'unit year -> month',
      'vat_included changed',
    ]);
    // term change on a switch
    expect(gate(deOffer, mergeOffer('reg', deOffer, us({ renewal_term_years: 2 })))).toEqual([
      'term years changed',
    ]);
    // foreign_market whose currency is not the offer's: no switch
    const wrong = mergeOffer('reg', deOffer, us({}, { ...US, currency: 'GBP' }));
    expect(gate(deOffer, wrong)).toEqual(['currency EUR -> USD', 'vat_included changed']);
    // a foreign market display in EUR or gross is no switch either
    const eurNet = mergeOffer('reg', deOffer, {
      ...us(),
      currency: 'EUR',
      foreign_market: { ...US, currency: 'EUR' },
    });
    expect(gate(deOffer, eurNet)).toEqual([
      'foreign_market changed without a market switch (EUR/vat_included true -> EUR/vat_included false/foreign_market US; only EUR gross <-> USD net with foreign_market)',
      'vat_included changed',
    ]);
    // > 30 % within the same market still blocks
    expect(gate(usOffer, mergeOffer('reg', usOffer, us({ renewal: 1400 })))).toEqual([
      'renewal 1000 -> 1400 (40 %)',
    ]);
    // USD net without foreign_market -> USD net with it: a market change that is no switch
    const plainUsd = mergeOffer('reg', undefined, us({}, null));
    // the real reason, not "DE -> US": the stored offer was not the German display
    expect(gate(plainUsd, mergeOffer('reg', plainUsd, us()))).toEqual([
      'foreign_market changed without a market switch (USD/vat_included false -> USD/vat_included false/foreign_market US; only EUR gross <-> USD net with foreign_market)',
    ]);
  });

  it('a run writes the switch, starts a history segment and reports "Markt DE -> US"', async () => {
    provider('reg');
    writeOffer(deOffer);
    await syncHistory(dir);
    const report = await run(
      opts([
        adapter('reg', {
          offers: [
            {
              ...us({ renewal: 5000 }),
              evidence: { ...scraped('de').evidence, fetched_at: '2026-11-20T06:00:00Z' },
            },
          ],
        }),
      ]),
    );
    expect(report.violations).toEqual([]);
    expect(readOffer('reg', 'de')).toMatchObject({
      currency: 'USD',
      vat_included: false,
      foreign_market: US,
    });
    const history = JSON.parse(readFileSync(historyFile(dir, 'reg', 'de'), 'utf8'));
    expect(
      history.entries.map((e: { currency: string; market?: string }) => [e.currency, e.market]),
    ).toEqual([
      ['EUR', undefined],
      ['USD', 'US'],
    ]);
    expect(validateDir(dir)).toEqual([]);
    expect(summarize(report)).toMatch(/~ reg\/de\n {4}Markt DE -> US\n/);
    // and back: a new segment without market
    const back = await run(
      opts([
        adapter('reg', {
          offers: [
            {
              ...german(),
              evidence: { ...scraped('de').evidence, fetched_at: '2026-11-27T06:00:00Z' },
            },
          ],
        }),
      ]),
    );
    expect(back.violations).toEqual([]);
    expect(back.changes[0]?.market).toBe('US -> DE');
    const after = JSON.parse(readFileSync(historyFile(dir, 'reg', 'de'), 'utf8'));
    expect(after.entries.map((e: { market?: string }) => e.market ?? 'DE')).toEqual([
      'DE',
      'US',
      'DE',
    ]);
    expect(validateDir(dir)).toEqual([]);
  });

  it('a currency or VAT change within a market still stops the history', () => {
    const later = (o: Offer, over: Partial<Offer>) => ({
      ...o,
      ...over,
      evidence: { ...o.evidence, fetched_at: '2026-11-20T06:00:00Z' },
    });
    const usHistory = appendHistory(undefined, usOffer).history;
    // US market, but gross
    expect(() => appendHistory(usHistory, later(usOffer, { vat_included: true }))).toThrow(
      /currency, price unit or VAT mode changed \(USD\/year\/vat_included false\/market US -> USD\/year\/vat_included true\/market US\)/,
    );
    // German market, net EUR
    const deHistory = appendHistory(undefined, deOffer).history;
    expect(() => appendHistory(deHistory, later(deOffer, { vat_included: false }))).toThrow(
      /VAT mode changed/,
    );
    // USD without foreign_market: no switch
    expect(() =>
      appendHistory(deHistory, later(deOffer, { currency: 'USD', vat_included: false })),
    ).toThrow(/EUR\/year\/vat_included true -> USD\/year\/vat_included false\)/);
  });
});
