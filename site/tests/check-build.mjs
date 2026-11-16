// Post-build checks of the static output. Usage:
//   node tests/check-build.mjs <dist dir> <data dir> [<dist dir> <data dir> ...]
// For each pair:
//   - openapi.json is a valid OpenAPI 3.1 document, and every /api/v1 file matches its response
//     schema (all.json, tlds.json, offers/<tld>.json);
//   - all.json carries exactly the raw data from <data dir> (loadData);
//   - every TLD with an offer has /tld/<tld>/index.html and /api/v1/offers/<tld>.json, and no page
//     or file exists for a TLD without offers;
//   - sitemap.xml lists every built HTML page except 404.html and the /api/v1/ index (both
//     noindex), and robots.txt points to it; /api/v1/index.html exists (archive issue 59);
//   - every provider country has its flag (/flags/<cc>.svg, flag-icons copied into public/flags/)
//     and the flag licence is served;
//   - no page needs an inline script or style (tests/check-csp.mjs; the CSP allows 'self' only);
//   - the English version (Archiv-Issue 33): page pairs, hreflang, canonical, html lang, no German UI text on
//     English pages (tests/check-i18n.mjs).
// Needs the built @tldcost/core (npm run build:core).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadData } from '@tldcost/core/load';
import { responseValidator, validateOpenApi } from './api-validator.mjs';
import { cspFindings } from './check-csp.mjs';
import { checkI18n } from './check-i18n.mjs';

const SITE = 'https://tldcost.io';
const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error('usage: node tests/check-build.mjs <dist> <data> [<dist> <data> ...]');
  process.exit(2);
}

function htmlFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.html'))
    .map((d) => join(d.parentPath, d.name));
}

function check(distArg, dataArg) {
  const dist = resolve(distArg);
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const api = join(dist, 'api', 'v1');
  const read = (rel) => JSON.parse(readFileSync(join(api, rel), 'utf8'));

  const openapi = read('openapi.json');
  for (const e of validateOpenApi(openapi)) fail(`openapi.json: ${e}`);
  const schemas = ['offer', 'provider', 'fx'].map((n) => read(`schema/${n}.schema.json`));
  const validate = responseValidator(openapi, schemas);

  const all = read('all.json');
  for (const e of validate('AllResponse', all)) fail(`all.json: ${e}`);
  const tlds = read('tlds.json');
  for (const e of validate('TldsResponse', tlds)) fail(`tlds.json: ${e}`);

  const data = loadData(resolve(dataArg));
  for (const key of ['providers', 'offers', 'fx']) {
    if (!isDeepStrictEqual(all[key], data[key])) fail(`all.json: ${key} differs from ${dataArg}`);
  }

  for (const country of [...new Set(data.providers.map((p) => p.country))].sort()) {
    const flag = join(dist, 'flags', `${country.toLowerCase()}.svg`);
    if (!existsSync(flag)) {
      fail(
        `flags/${country.toLowerCase()}.svg missing for provider country ${country}: copy it from flag-icons (flags/4x3/) into site/public/flags/`,
      );
    }
  }
  if (!existsSync(join(dist, 'flags', 'LICENSE.txt')))
    fail('flags/LICENSE.txt missing (MIT notice of flag-icons)');

  const expected = [...new Set(data.offers.map((o) => o.tld))].sort();
  const files = readdirSync(join(api, 'offers'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
  checkI18n(dist, htmlFiles(dist), expected, fail);

  const pages = existsSync(join(dist, 'tld'))
    ? readdirSync(join(dist, 'tld')).filter((t) => existsSync(join(dist, 'tld', t, 'index.html')))
    : [];
  if (!isDeepStrictEqual(files, expected))
    fail(`offers/*.json: ${files} != TLDs in data ${expected}`);
  if (!isDeepStrictEqual(pages.sort(), expected))
    fail(`tld/*/: ${pages} != TLDs in data ${expected}`);
  if (!isDeepStrictEqual(tlds.tlds.map((t) => t.tld).sort(), expected)) fail('tlds.json: TLD list');
  for (const tld of files) {
    const doc = read(`offers/${tld}.json`);
    for (const e of validate('TldResponse', doc)) fail(`offers/${tld}.json: ${e}`);
    if (doc.tld !== tld) fail(`offers/${tld}.json: tld is ${doc.tld}`);
    if (doc.data_version !== all.data_version) fail(`offers/${tld}.json: data_version`);
  }

  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const htmlPages = htmlFiles(dist)
    .map((f) => relative(dist, f).split(sep).join('/'))
    .filter((p) => p !== '404.html' && p !== 'api/v1/index.html')
    .map((p) => `${SITE}/${p.replace(/index\.html$/, '')}`)
    .sort();
  if (!isDeepStrictEqual(locs, htmlPages)) {
    fail(`sitemap.xml: ${JSON.stringify(locs)} != pages ${JSON.stringify(htmlPages)}`);
  }
  if (!existsSync(join(dist, '404.html'))) fail('404.html missing');
  if (!existsSync(join(api, 'index.html'))) fail('api/v1/index.html missing');
  for (const f of htmlFiles(dist)) {
    for (const e of cspFindings(readFileSync(f, 'utf8'))) {
      fail(`${relative(dist, f)}: ${e} (blocked by the CSP, script-src/style-src 'self' only)`);
    }
  }
  const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
  if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('robots.txt: no Sitemap line');

  return {
    errors,
    summary: `${files.length} TLD files, ${pages.length} TLD pages, ${locs.length} sitemap URLs`,
  };
}

let failed = false;
for (let i = 0; i < args.length; i += 2) {
  const { errors, summary } = check(args[i], args[i + 1]);
  if (errors.length) {
    failed = true;
    console.error(`${args[i]}: ${errors.length} problem(s)`);
    for (const e of errors.slice(0, 50)) console.error(`  ${e}`);
  } else {
    console.log(`${args[i]}: ok (${summary})`);
  }
}
process.exit(failed ? 1 : 0);
