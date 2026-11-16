// Moves the inline <script> and <style> blocks that Astro always writes into the pages (island
// runtime, island style) into files under the assets directory, after the build. The site's
// Content-Security-Policy (infra/lib/content-security-policy.json) allows scripts and styles from
// 'self' only, without 'unsafe-inline' and without hashes, so the header never has to change when
// Astro or the CSS changes. The page stylesheets themselves are external via
// build.inlineStylesheets 'never'.
//
// A script keeps its attributes and its place in the page: an external classic script without
// async/defer runs at the same point as the inline one did. Data blocks (type="application/json",
// "application/ld+json", ...) are not run, CSP does not apply to them, so they stay inline.
// File names carry a content hash, so they are cached like the other assets.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const STYLE = /<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi;
const SCRIPT_TYPES_RUN = new Set(['', 'text/javascript', 'application/javascript', 'module']);

const scriptType = (attrs) =>
  (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? '').toLowerCase();

/**
 * Returns the page with its inline scripts and styles replaced by references to external files.
 * `emit(content, ext)` stores one file and returns its public URL.
 */
export function externalizeInline(html, emit) {
  return html
    .replace(SCRIPT, (tag, attrs = '', body) => {
      if (/\ssrc\s*=/i.test(attrs) || !SCRIPT_TYPES_RUN.has(scriptType(attrs))) return tag;
      return `<script${attrs} src="${emit(body, 'js')}"></script>`;
    })
    .replace(STYLE, (_tag, attrs = '', body) => {
      const media = /\smedia\s*=\s*("[^"]*"|'[^']*')/i.exec(attrs)?.[1];
      const rest = attrs.replace(/\smedia\s*=\s*("[^"]*"|'[^']*')/i, '').trim();
      if (rest) throw new Error(`externalize-inline: unsupported <style${attrs}>`);
      return `<link rel="stylesheet" href="${emit(body, 'css')}"${media ? ` media=${media}` : ''}>`;
    });
}

function htmlFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.html'))
    .map((d) => join(d.parentPath, d.name));
}

export default function externalizeInlineIntegration() {
  let assets = '_astro';
  let base = '/';
  return {
    name: 'tldcost-externalize-inline',
    hooks: {
      'astro:config:done': ({ config }) => {
        assets = config.build.assets;
        base = config.base.endsWith('/') ? config.base : `${config.base}/`;
      },
      'astro:build:done': ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        mkdirSync(join(out, assets), { recursive: true });
        const written = new Set();
        const emit = (content, ext) => {
          const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
          const name = `inline.${hash}.${ext}`;
          if (!written.has(name)) {
            writeFileSync(join(out, assets, name), content);
            written.add(name);
          }
          return `${base}${assets}/${name}`;
        };
        let pages = 0;
        for (const file of htmlFiles(out)) {
          const html = readFileSync(file, 'utf8');
          const next = externalizeInline(html, emit);
          if (next !== html) {
            writeFileSync(file, next);
            pages++;
          }
        }
        logger.info(`${written.size} inline block(s) moved to files, ${pages} page(s) changed`);
      },
    },
  };
}
