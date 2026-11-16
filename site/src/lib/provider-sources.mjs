// Markdown (Sätteri mdast) plugin: the leaf directive `::erhebung-je-anbieter` in
// docs/pages/methodik.md becomes a table of every provider in data/ (TLDCOST_DATA_DIR, as
// src/lib/site-data.ts): how its offers are collected and, without offers, why. Built from the data
// at build time, so the list cannot drift:
// - the method comes from evidence.method of the provider's offers (api, scrape, manual), with the
//   number of TLDs per method;
// - a provider without offers says why in data/providers/<id>.json `collection` (status excluded
//   or pending, reason, optional issue); validate-data requires that status.
// Issue numbers become links only while the repository is public (REPO_PUBLIC). Runs before
// table-regions, so the table gets its scroll region like every other table.
// English (Archiv-Issue 33): `::erhebung-je-anbieter{lang=en}` in docs/pages/en/methodik.md gives English
// labels; the reasons are German data text, quoted verbatim and marked lang="de".
import { resolve } from 'node:path';
import { loadData } from '@tldcost/core/load';
import { REPO_PUBLIC, repoLink } from './report.mjs';

export const DIRECTIVE = 'erhebung-je-anbieter';

/** @typedef {import('@tldcost/core').Provider} Provider */
/** @typedef {import('@tldcost/core').Offer} Offer */
/** @typedef {{ type: string; value?: string; url?: string; children?: Phrasing[] }} Phrasing */

/** Texts per language. Methods in display order, the same wording as the `method` row in
 * „Quellen und Belege“ / "Sources and evidence". */
const TEXT = {
  de: {
    methods: [
      ['api', 'Preisliste/Schnittstelle des Anbieters'],
      ['scrape', 'automatisch von der Webseite gelesen'],
      ['manual', 'von Hand erfasst'],
    ],
    tlds: (/** @type {number} */ n) => `${n} ${n === 1 ? 'TLD' : 'TLDs'}`,
    pending: 'keine Angebote, manuelle Erfassung ausstehend',
    excluded: 'keine Angebote, nicht aufgenommen',
    none: 'keine Angebote',
    see: ' (siehe ',
    selection: ['#anbieterauswahl', 'Anbieterauswahl'],
    header: ['Anbieter', 'Erhebung', 'Anmerkung'],
  },
  en: {
    methods: [
      ['api', 'provider’s price list or interface'],
      ['scrape', 'read automatically from the website'],
      ['manual', 'entered by hand'],
    ],
    tlds: (/** @type {number} */ n) => `${n} ${n === 1 ? 'TLD' : 'TLDs'}`,
    pending: 'no offers, manual entry pending',
    excluded: 'no offers, not included',
    none: 'no offers',
    see: ' (see ',
    selection: ['#provider-selection', 'Provider selection'],
    header: ['Provider', 'Collection', 'Note'],
  },
};

/** @typedef {'de' | 'en'} Lang */

const text = (/** @type {string} */ value) => ({ type: 'text', value });
const code = (/** @type {string} */ value) => ({ type: 'inlineCode', value });
const link = (/** @type {string} */ url, /** @type {string} */ label) => ({
  type: 'link',
  url,
  children: [text(label)],
});
/** German data text: plain on German pages, a span lang="de" on English ones. */
const german = (/** @type {string} */ value, /** @type {Lang} */ lang) =>
  lang === 'de'
    ? text(value)
    : {
        type: 'emphasis',
        data: { hName: 'span', hProperties: { lang: 'de' } },
        children: [text(value)],
      };

/**
 * One row per provider, sorted by name: [Anbieter, Erhebung, Anmerkung] as phrasing nodes.
 * @param {{ providers: Provider[]; offers: Offer[] }} data
 * @param {boolean} [repoPublic]
 * @param {Lang} [lang]
 * @returns {Phrasing[][][]}
 */
export function providerRows(data, repoPublic = REPO_PUBLIC, lang = 'de') {
  const t = TEXT[lang];
  const providers = [...data.providers].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return providers.map((p) => {
    const offers = data.offers.filter((o) => o.provider === p.id);
    /** @type {Phrasing[]} */
    const how = [];
    for (const [method, label] of t.methods) {
      const n = offers.filter((o) => o.evidence.method === method).length;
      if (n === 0) continue;
      if (how.length) how.push(text('; '));
      how.push(text(`${label} (`), code(method), text(`), ${t.tlds(n)}`));
    }
    const c = p.collection;
    if (offers.length === 0) {
      how.push(
        text(c?.status === 'pending' ? t.pending : c?.status === 'excluded' ? t.excluded : t.none),
      );
    }
    /** @type {Phrasing[]} */
    const note = [];
    if (c) {
      note.push(german(c.reason, lang));
      if (c.status === 'excluded') {
        note.push(text(t.see), link(t.selection[0], t.selection[1]), text(')'));
      }
      const issue = c.issue ? repoLink(`issues/${c.issue}`, null, repoPublic) : null;
      if (issue) note.push(text(' ('), link(issue, `#${c.issue}`), text(')'));
    } else {
      note.push(text('–'));
    }
    return [[text(p.name)], how, note];
  });
}

/**
 * The mdast table for the directive.
 * @param {{ providers: Provider[]; offers: Offer[] }} data
 * @param {boolean} [repoPublic]
 * @param {Lang} [lang]
 */
export function providerTable(data, repoPublic = REPO_PUBLIC, lang = 'de') {
  const h = TEXT[lang].header;
  const row = (/** @type {Phrasing[][]} */ cells) => ({
    type: 'tableRow',
    children: cells.map((children) => ({ type: 'tableCell', children })),
  });
  return {
    type: 'table',
    align: [null, null, null],
    children: [
      row([[text(h[0])], [text(h[1])], [text(h[2])]]),
      ...providerRows(data, repoPublic, lang).map(row),
    ],
  };
}

/**
 * Plugin for given data (tests) or, by default, the site's data dir (loaded once per build).
 * @param {() => { providers: Provider[]; offers: Offer[] }} getData
 * @param {boolean} [repoPublic]
 */
export function providerSourcesFor(getData, repoPublic = REPO_PUBLIC) {
  return {
    name: 'provider-sources',
    /**
     * @param {{ name: string; attributes?: Record<string, string | null | undefined> | null }} node
     * @param {{ replaceNode(n: unknown, m: unknown[]): void }} ctx
     */
    leafDirective(node, ctx) {
      if (node.name !== DIRECTIVE) return;
      const lang = node.attributes?.lang === 'en' ? 'en' : 'de';
      ctx.replaceNode(node, [providerTable(getData(), repoPublic, lang)]);
    },
  };
}

// Own cache, not src/lib/site-data.ts: this plugin is imported by astro.config.mjs and runs in the
// Markdown pipeline, outside the page/endpoint modules that share siteData(). Same dir and loader,
// so both see the same data; loaded once per build, not once per page.
/** @type {{ providers: Provider[]; offers: Offer[] } | undefined} */
let cached;
const siteData = () =>
  (cached ??= loadData(resolve(process.cwd(), process.env.TLDCOST_DATA_DIR ?? '../data')));

export const providerSources = providerSourcesFor(siteData);
