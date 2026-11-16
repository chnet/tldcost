// Writes dist/sitemap.xml after the build from the pages Astro actually built, so new pages
// (methodik, impressum, TLD pages, ...) are listed without being registered here. Lists HTML pages
// only (paths ending in `/`), never the 404 page or the /api/v1/ files. No <lastmod>: the build has
// no reliable per-page date, and a build date would change on every build.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const escapeXml = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );

/** Absolute page URLs for the sitemap, sorted, from Astro's built page pathnames. */
export function sitemapUrls(pathnames, site) {
  const urls = pathnames
    .map((p) => (p.startsWith('/') ? p : `/${p}`))
    .filter((p) => p.endsWith('/') && !/^\/404\/?$/.test(p) && !p.startsWith('/api/v1/'))
    .map((p) => new URL(p, site).href);
  return [...new Set(urls)].sort();
}

export function sitemapXml(urls) {
  const body = urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${body}\n</urlset>\n`
  );
}

export default function sitemap() {
  let site;
  return {
    name: 'tldcost-sitemap',
    hooks: {
      'astro:config:done': ({ config }) => {
        site = config.site;
      },
      'astro:build:done': ({ dir, pages }) => {
        const urls = sitemapUrls(
          pages.map((p) => p.pathname),
          site,
        );
        writeFileSync(new URL('sitemap.xml', dir), sitemapXml(urls));
        // fileURLToPath only for the log line
        console.log(
          `[tldcost-sitemap] ${urls.length} URLs -> ${fileURLToPath(new URL('sitemap.xml', dir))}`,
        );
      },
    },
  };
}
