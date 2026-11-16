// Static build only (concept section 3.4). TLDCOST_DATA_DIR / TLDCOST_OUT_DIR let the e2e tests
// build fixture variants; defaults are ../data and ./dist.
import { satteri } from '@astrojs/markdown-satteri';
import preact from '@astrojs/preact';
import { defineConfig } from 'astro/config';
import externalizeInline from './integrations/externalize-inline.mjs';
import sitemap from './integrations/sitemap.mjs';
import { stripHtmlComments } from './src/lib/strip-html-comments.mjs';
import { providerSources } from './src/lib/provider-sources.mjs';
import { repoBlocks } from './src/lib/repo-blocks.mjs';
import { reportLinks } from './src/lib/report-links.mjs';
import { tableRegions } from './src/lib/table-regions.mjs';

/** Island entries (client:load components) per group; see manualChunks below. */
const ISLAND_GROUPS = [
  ['table', /[\\/]src[\\/]components[\\/]PriceTable(De|En)\.tsx$/],
  ['basket', /[\\/]src[\\/]components[\\/]BasketCalculator(De|En)\.tsx$/],
];

/** Island groups whose entries import `id`, directly or transitively (static imports). */
function islandGroups(id, getModuleInfo, seen = new Set()) {
  const out = new Set();
  if (seen.has(id)) return out;
  seen.add(id);
  for (const [group, re] of ISLAND_GROUPS) if (re.test(id)) out.add(group);
  for (const importer of getModuleInfo(id)?.importers ?? []) {
    for (const g of islandGroups(importer, getModuleInfo, seen)) out.add(g);
  }
  return out;
}

export default defineConfig({
  site: 'https://tldcost.io',
  output: 'static',
  trailingSlash: 'always',
  outDir: process.env.TLDCOST_OUT_DIR ?? './dist',
  // No inline <style>/<script> in the pages: the CSP allows 'self' only (no 'unsafe-inline', no
  // hashes). Stylesheets are files ('never'); externalize-inline moves what Astro still inlines
  // (island runtime and island style) into files after the build.
  build: { format: 'directory', inlineStylesheets: 'never' },
  integrations: [preact(), sitemap(), externalizeInline()],
  // docs/pages/*.md: reviewer notes in HTML comments never reach the build; tables become
  // focusable scroll regions; tldcost:report/... and tldcost:repo/... links and the
  // :::nur-oeffentlich / :::nur-privat blocks follow REPORT_VIA and REPO_PUBLIC (src/lib/report.mjs);
  // ::erhebung-je-anbieter becomes the provider table built from data/ (src/lib/provider-sources.mjs)
  markdown: {
    // no Shiki: it writes the colours as style="" attributes, which the CSP blocks; code blocks use
    // the .tc-prose pre styles instead
    syntaxHighlight: false,
    processor: satteri({
      features: { directive: true },
      mdastPlugins: [stripHtmlComments, repoBlocks, providerSources, tableRegions, reportLinks],
    }),
  },
  devToolbar: { enabled: false },
  // One shared chunk for preact (core, hooks, jsx-runtime) and every module that both island
  // groups load (price table, portfolio calculator), e.g. i18n format/context, Badge, columns,
  // filters. Without it the islands load these over extra request levels (entry -> table ->
  // shared lib -> preact/hooks), which delays hydration under mobile throttling (Lighthouse TBT,
  // Archiv-Issue 125). The rule follows the import graph, so new shared modules need no list entry. The
  // catalogues (i18n/de, i18n/en) stay apart: each page loads only its language.
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id, { getModuleInfo }) {
            if (/[\\/]node_modules[\\/]preact[\\/]/.test(id)) return 'shared';
            if (/[\\/]src[\\/]i18n[\\/](de|en)\.ts$/.test(id)) return undefined;
            const groups = islandGroups(id, getModuleInfo);
            return groups.has('table') && groups.has('basket') ? 'shared' : undefined;
          },
        },
      },
    },
  },
});
