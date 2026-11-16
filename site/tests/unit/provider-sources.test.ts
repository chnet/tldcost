// ::erhebung-je-anbieter on the Methodik page (provider-sources.mjs): one row per provider, built
// from the data.
import { describe, expect, it } from 'vitest';
import type { Offer, Provider } from '@tldcost/core';
import {
  DIRECTIVE,
  providerRows,
  providerSourcesFor,
  providerTable,
} from '../../src/lib/provider-sources.mjs';

const provider = (id: string, name: string, collection?: Provider['collection']): Provider => ({
  schema_version: 1,
  id,
  name,
  website: `https://${id}.example/`,
  country: 'DE',
  vat_rate: 1900,
  ...(collection ? { collection } : {}),
});
const offer = (p: string, tld: string, method: Offer['evidence']['method']): Offer =>
  ({ provider: p, tld, evidence: { method } }) as Offer;

type Node = { type: string; value?: string; url?: string; children?: Node[] };
const plain = (nodes: Node[]): string =>
  nodes.map((n) => (n.value !== undefined ? n.value : plain(n.children ?? []))).join('');
const links = (nodes: Node[]): string[] =>
  nodes.flatMap((n) => (n.type === 'link' ? [n.url as string] : links(n.children ?? [])));

const data = {
  providers: [
    provider('zeta', 'Zeta', { reason: 'Zusatz-TLDs nicht aufgenommen' }),
    provider('alpha', 'Älpha'),
    provider('beta', 'Beta', { status: 'excluded', reason: 'nur mit Hosting-Tarif' }),
    provider('gamma', 'Gamma', { status: 'pending', reason: 'Bot-Schutz', issue: 77 }),
    provider('delta', 'Delta'),
  ],
  offers: [
    offer('alpha', 'de', 'scrape'),
    offer('alpha', 'com', 'scrape'),
    offer('alpha', 'net', 'manual'),
    offer('zeta', 'de', 'api'),
  ],
};

describe('provider sources (Methodik)', () => {
  it('lists every provider by name with method, TLD count and reason', () => {
    const rows = providerRows(data, false).map((r) => r.map((c) => plain(c as Node[])));
    expect(rows).toEqual([
      [
        'Älpha',
        'automatisch von der Webseite gelesen (scrape), 2 TLDs; von Hand erfasst (manual), 1 TLD',
        '–',
      ],
      [
        'Beta',
        'keine Angebote, nicht aufgenommen',
        'nur mit Hosting-Tarif (siehe Anbieterauswahl)',
      ],
      ['Delta', 'keine Angebote', '–'],
      ['Gamma', 'keine Angebote, manuelle Erfassung ausstehend', 'Bot-Schutz'],
      [
        'Zeta',
        'Preisliste/Schnittstelle des Anbieters (api), 1 TLD',
        'Zusatz-TLDs nicht aufgenommen',
      ],
    ]);
  });

  it('links the selection criteria; the issue only while the repository is public', () => {
    const note = (repoPublic: boolean, name: string) =>
      providerRows(data, repoPublic).find((r) => plain(r[0] as Node[]) === name)?.[2] as Node[];
    expect(links(note(false, 'Beta'))).toEqual(['#anbieterauswahl']);
    expect(links(note(false, 'Gamma'))).toEqual([]);
    expect(links(note(true, 'Gamma'))).toEqual(['https://github.com/chnet/tldcost/issues/77']);
    expect(plain(note(true, 'Gamma'))).toBe('Bot-Schutz (#77)');
  });

  it('replaces only its own directive with a three-column table', () => {
    const replaced: unknown[][] = [];
    const plugin = providerSourcesFor(() => data, false);
    const ctx = { replaceNode: (_n: unknown, m: unknown[]) => replaced.push(m) };
    plugin.leafDirective({ name: 'anderes' }, ctx);
    expect(replaced).toEqual([]);
    plugin.leafDirective({ name: DIRECTIVE }, ctx);
    expect(replaced).toEqual([[providerTable(data, false)]]);
    const table = providerTable(data, false);
    expect(table.align).toEqual([null, null, null]);
    expect(table.children).toHaveLength(1 + data.providers.length);
    expect(plain(table.children[0]?.children.flatMap((c) => c.children) as Node[])).toBe(
      'AnbieterErhebungAnmerkung',
    );
  });

  it('English (Archiv-Issue 33): labels and anchors in English, German reasons marked lang="de"', () => {
    const rows = providerRows(data, false, 'en');
    const beta = rows.find((r) => plain(r[0] as Node[]) === 'Beta');
    expect(plain(beta?.[1] as Node[])).toBe('no offers, not included');
    expect(plain(beta?.[2] as Node[])).toBe('nur mit Hosting-Tarif (see Provider selection)');
    expect(links(beta?.[2] as Node[])).toEqual(['#provider-selection']);
    const reason = (beta?.[2] as Array<Node & { data?: { hProperties?: { lang?: string } } }>)[0];
    expect(reason?.data?.hProperties?.lang).toBe('de');
    expect(plain(rows[0]?.[1] as Node[])).toBe(
      'read automatically from the website (scrape), 2 TLDs; entered by hand (manual), 1 TLD',
    );
    const table = providerTable(data, false, 'en');
    expect(plain(table.children[0]?.children.flatMap((c) => c.children) as Node[])).toBe(
      'ProviderCollectionNote',
    );
    const replaced: unknown[][] = [];
    const ctx = { replaceNode: (_n: unknown, m: unknown[]) => replaced.push(m) };
    providerSourcesFor(() => data, false).leafDirective(
      { name: DIRECTIVE, attributes: { lang: 'en' } },
      ctx,
    );
    expect(replaced).toEqual([[providerTable(data, false, 'en')]]);
  });
});
