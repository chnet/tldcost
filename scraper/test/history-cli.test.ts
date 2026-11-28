import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Offer } from '@tldcost/core';
import { describe, expect, it } from 'vitest';
import { main } from '../src/history-cli.js';
import { historyFile, mergeOffer, syncHistory } from '../src/run.js';

const offer = (tld: string): Offer =>
  mergeOffer('reg', undefined, {
    tld,
    currency: 'EUR',
    vat_included: false,
    price: {
      unit: 'year',
      setup: 0,
      year1: 1000,
      year1_regular: 1000,
      renewal: 1000,
      transfer_in: 1000,
    },
    promo: null,
    evidence: {
      source_url: 'https://reg.example/prices',
      fetched_at: '2026-11-13T06:00:00Z',
      method: 'manual',
      confidence: 'medium',
    },
  });

/** A data dir with provider "reg" and the given offers. */
function dataDir(offers: Offer[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'tldcost-history-cli-'));
  mkdirSync(join(dir, 'providers'));
  writeFileSync(
    join(dir, 'providers', 'reg.json'),
    JSON.stringify({
      schema_version: 1,
      id: 'reg',
      name: 'reg',
      website: 'https://reg.example',
      country: 'DE',
      vat_rate: 1900,
    }),
  );
  mkdirSync(join(dir, 'offers', 'reg'), { recursive: true });
  for (const o of offers) {
    writeFileSync(join(dir, 'offers', 'reg', `${o.tld}.json`), JSON.stringify(o));
  }
  return dir;
}

const io = () => {
  const out = { log: [] as string[], error: [] as string[] };
  return {
    out,
    io: { log: (l: string) => out.log.push(l), error: (l: string) => out.error.push(l) },
  };
};

describe('history:sync CLI (#52)', () => {
  it('reports every offer it cannot continue, syncs the rest of every dir, and exits 1', async () => {
    // dir 1: A (VAT mode changed) before B (renewal changed)
    const a = offer('com');
    const b = offer('de');
    const one = dataDir([a, b]);
    await syncHistory(one);
    const later = { method: 'manual' as const, fetched_at: '2026-11-30T10:00:00Z' };
    writeFileSync(
      join(one, 'offers', 'reg', 'com.json'),
      JSON.stringify({ ...a, vat_included: true, evidence: { ...a.evidence, ...later } }),
    );
    writeFileSync(
      join(one, 'offers', 'reg', 'de.json'),
      JSON.stringify({
        ...b,
        price: { ...b.price, renewal: 1290 },
        evidence: { ...b.evidence, ...later },
      }),
    );
    // dir 2: unreadable offer file; dir 3: a new offer to seed
    const two = dataDir([]);
    writeFileSync(join(two, 'offers', 'reg', 'net.json'), '{ not json');
    const three = dataDir([offer('org')]);

    const { out, io: sink } = io();
    expect(await main([one, two, three], sink)).toBe(1);
    expect(out.log).toEqual([
      `${one}: wrote 1 history file(s), 0 unchanged, 1 not continued`,
      `${three}: wrote 1 history file(s), 0 unchanged`,
    ]);
    expect(out.error).toEqual([
      expect.stringMatching(/^history:sync: reg\/com: currency, price unit or VAT mode changed/),
      expect.stringMatching(new RegExp(`^history:sync failed for ${two}: .*net\\.json`)),
    ]);
    const historyB = JSON.parse(readFileSync(historyFile(one, 'reg', 'de'), 'utf8'));
    expect(historyB.entries.at(-1)).toMatchObject({ date: '2026-11-30', renewal: 1290 });
    expect(JSON.parse(readFileSync(historyFile(three, 'reg', 'org'), 'utf8')).entries).toHaveLength(
      1,
    );
  });

  it('exits 0 when every offer is synced; --dry-run writes nothing', async () => {
    const dir = dataDir([offer('de')]);
    const { out, io: sink } = io();
    expect(await main(['--dry-run', dir], sink)).toBe(0);
    expect(out.log).toEqual([`${dir}: would write 1 history file(s), 0 unchanged`]);
    expect(existsSync(historyFile(dir, 'reg', 'de'))).toBe(false);
    expect(out.error).toEqual([]);
    expect(await main([dir], sink)).toBe(0);
    expect(await main([dir], sink)).toBe(0);
    expect(out.log.at(-1)).toBe(`${dir}: wrote 0 history file(s), 1 unchanged`);
  });
});
