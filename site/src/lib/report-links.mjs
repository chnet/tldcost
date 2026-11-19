// Markdown (Sätteri mdast) plugin: resolves the placeholder links in docs/pages/*.md.
// - `tldcost:report/preis` (wrong data) and `tldcost:report/anbieter` (suggest a provider) become
//   the e-mail or GitHub link chosen by REPORT_VIA; in GitHub mode REPORT_NOTES follow right after
//   the link (issues are public, no personal data; the e-mail route without a GitHub account).
//   English pages add `?lang=en` (`tldcost:report/preis?lang=en`) for the English notes.
// - `tldcost:repo/<path>` links into the repository (REPO_PUBLIC): public, the GitHub URL; private,
//   an equivalent (data: /api/v1/all.json, Apache licence: apache.org) or, for everything else, the
//   link text as plain text. Text that differs by mode uses :::nur-oeffentlich / :::nur-privat
//   blocks (repo-blocks.mjs).
// All of it lives in src/lib/report.mjs.
import {
  REPO_PUBLIC,
  REPORT_NOTES,
  REPORT_VIA,
  correctionUrl,
  repoLink,
  suggestProviderUrl,
} from './report.mjs';

const REPO = 'tldcost:repo/';
/**
 * Targets with the same content for repo paths, used when REPO_PUBLIC is false: the data
 * as JSON on the site, the Apache licence at its official source (a plain link, nothing loaded).
 */
const SITE_EQUIVALENTS = /** @type {Record<string, string>} */ ({
  'tree/main/data': '/api/v1/all.json',
  'tree/main/data/providers': '/api/v1/all.json',
  'blob/main/LICENSE': 'https://www.apache.org/licenses/LICENSE-2.0',
});

/**
 * @param {import('./report.mjs').ReportVia} via
 * @param {boolean} [repoPublic]
 */
export function reportLinksFor(via, repoPublic = REPO_PUBLIC) {
  /** @type {Record<string, () => string>} */
  const targets = {
    'tldcost:report/preis': () => correctionUrl(null, via),
    'tldcost:report/anbieter': () => suggestProviderUrl(via),
  };
  return {
    name: 'report-links',
    /**
     * @param {{ url: string; children: unknown[] }} node
     * @param {{
     *   setField(n: unknown, k: string, v: unknown): void;
     *   insertAfter(n: unknown, m: unknown[]): void;
     *   replaceNode(n: unknown, m: unknown[]): void;
     * }} ctx
     */
    link(node, ctx) {
      if (node.url.startsWith(REPO)) {
        const path = node.url.slice(REPO.length).replace(/\/$/, '');
        const href = repoLink(path, SITE_EQUIVALENTS[path] ?? null, repoPublic);
        if (href) ctx.setField(node, 'url', href);
        else ctx.replaceNode(node, node.children);
        return;
      }
      const [base = '', query = ''] = node.url.split('?');
      const target = targets[base];
      if (!target) return;
      const lang = new URLSearchParams(query).get('lang') === 'en' ? 'en' : 'de';
      ctx.setField(node, 'url', target());
      if (via === 'github') {
        const notes = REPORT_NOTES[lang];
        ctx.insertAfter(node, [{ type: 'text', value: ` (${notes.privacy} ${notes.noGithub})` }]);
      }
    },
  };
}

export const reportLinks = reportLinksFor(REPORT_VIA);
