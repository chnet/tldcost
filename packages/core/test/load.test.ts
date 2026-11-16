import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareIds, loadData } from '../src/load.js';
import { offer } from './fixtures.js';

function dataDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tldcost-data-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const provider = (id: string) => ({
  schema_version: 1,
  id,
  name: id,
  website: `https://${id}.example`,
  country: 'DE',
  vat_rate: 1900,
});

describe('loadData', () => {
  it('missing directories: empty lists', () => {
    expect(loadData(dataDir({}))).toEqual({ providers: [], offers: [], fx: [] });
  });

  it('sorts providers by id and offers by provider, then tld; ignores non-json', () => {
    const dir = dataDir({
      'providers/zeta.json': provider('zeta'),
      'providers/alpha.json': provider('alpha'),
      'providers/README.md': '# notes',
      'offers/zeta/com.json': offer({}, { provider: 'zeta', tld: 'com' }),
      'offers/alpha/de.json': offer({}, { provider: 'alpha', tld: 'de' }),
      'offers/alpha/com.json': offer({}, { provider: 'alpha', tld: 'com' }),
      'offers/stray.json': '{}',
    });
    const { providers, offers } = loadData(dir);
    expect(providers.map((p) => p.id)).toEqual(['alpha', 'zeta']);
    expect(offers.map((o) => `${o.provider}/${o.tld}`)).toEqual([
      'alpha/com',
      'alpha/de',
      'zeta/com',
    ]);
  });

  it('compareIds: code-unit order (de < de-x, unlike the file names de.json > de-x.json)', () => {
    expect(compareIds('a', 'b')).toBe(-1);
    expect(compareIds('b', 'a')).toBe(1);
    expect(compareIds('a', 'a')).toBe(0);
    const dir = dataDir({
      'offers/a/de.json': offer({}, { provider: 'a', tld: 'de' }),
      'offers/a/de-x.json': offer({}, { provider: 'a', tld: 'de-x' }),
    });
    expect(loadData(dir).offers.map((o) => o.tld)).toEqual(['de', 'de-x']);
  });

  it('equal keys keep a stable order', () => {
    const dir = dataDir({
      'offers/a/de.json': offer({}, { provider: 'a', tld: 'de' }),
      'offers/b/de.json': offer({}, { provider: 'b', tld: 'de' }),
    });
    expect(loadData(dir).offers.map((o) => o.provider)).toEqual(['a', 'b']);
  });

  it('fx tables sorted by date; file name must be the date', () => {
    const fx = (date: string) => ({
      schema_version: 1,
      source: 'ECB',
      date,
      base: 'EUR',
      rates: { USD: 1 },
    });
    const dir = dataDir({
      'fx/2026-11-12.json': fx('2026-11-12'),
      'fx/2026-11-10.json': fx('2026-11-10'),
    });
    expect(loadData(dir).fx.map((t) => t.date)).toEqual(['2026-11-10', '2026-11-12']);
    expect(() => loadData(dataDir({ 'fx/2026-11-12.json': fx('2026-11-11') }))).toThrow(
      /date '2026-11-11' != file name/,
    );
  });

  it('file name must match the id inside', () => {
    expect(() => loadData(dataDir({ 'providers/a.json': provider('b') }))).toThrow(
      /id 'b' != file name/,
    );
    const wrongTld = { 'offers/a/de.json': offer({}, { provider: 'a', tld: 'com' }) };
    expect(() => loadData(dataDir(wrongTld))).toThrow(/'a\/com' != path/);
    const wrongProvider = { 'offers/a/de.json': offer({}, { provider: 'b', tld: 'de' }) };
    expect(() => loadData(dataDir(wrongProvider))).toThrow(/'b\/de' != path/);
  });

  it('invalid JSON names the file', () => {
    expect(() => loadData(dataDir({ 'providers/a.json': '{oops' }))).toThrow(/a\.json: /);
  });

  it('a file where a directory is expected is an error, not empty', () => {
    expect(() => loadData(dataDir({ providers: 'not a dir' }))).toThrow(/ENOTDIR/);
    expect(() => loadData(dataDir({ offers: 'not a dir' }))).toThrow(/ENOTDIR/);
  });
});
