#!/usr/bin/env node
// validate-data.mjs — every JSON file under data/ (and the schema examples) must match
// schema/provider.schema.json, schema/offer.schema.json or schema/fx.schema.json (ajv, JSON Schema
// 2020-12 + formats), file names must match the ids/dates inside, every offer must reference an
// existing provider, only providers outside the EU may have offers without VAT statement
// (vat_included null, methodik) or a provider vat_rate of null, offers with stated VAT (gross or
// net) need a VAT rate (offer or provider), at most one provider is the portal operator, a
// provider without offers says why (collection.status excluded or pending, Methodik list), while a
// provider with such a status has no offers, and price.transfer_includes_term true and
// promo.max_per_customer need their source (url or quote). Every offer has a price history
// (schema/history.schema.json) whose dates ascend strictly, whose entries share the offer's
// currency, price unit and VAT mode, and whose last entry is the offer's current price state; a
// history without an offer is a finding too (`npm run history:sync` writes them).
//
// Usage: node scripts/validate-data.mjs [dir ...]   (default: data schema/examples)
// Layout of each dir: providers/<id>.json, offers/<provider>/<tld>.json, fx/<ECB date>.json,
// history/<provider>/<tld>.json.
// Missing dirs are fine; anything else (a non-.json file, a stray file or dir) is a finding, so a
// typo never drops data silently. Dotfiles (.DS_Store, .gitkeep) are ignored.
// Exit 0 = ok, 1 = findings.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function makeValidators(root = ROOT) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return {
    provider: ajv.compile(readJson(join(root, 'schema/provider.schema.json'))),
    offer: ajv.compile(readJson(join(root, 'schema/offer.schema.json'))),
    fx: ajv.compile(readJson(join(root, 'schema/fx.schema.json'))),
    history: ajv.compile(readJson(join(root, 'schema/history.schema.json'))),
  };
}

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const visible = (dir) => readdirSync(dir).filter((n) => !n.startsWith('.'));
const TOP_LEVEL = new Set(['providers', 'offers', 'fx', 'history']);
/** Plain files allowed directly in data/: the data license (CC BY 4.0). */
const TOP_LEVEL_FILES = new Set(['LICENSE']);

// EU member states (ISO 3166-1 alpha-2; Greece is GR here, EL only in VAT ids)
export const EU = new Set(
  'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' '),
);

/** Feature fields that accept "paid" (packages/core PAYABLE_FEATURES; schema $defs/featureValue). */
export const PAYABLE_FEATURES = [
  'ssl_free',
  'forward_301',
  'forward_302',
  'dns_editor',
  'custom_ns',
  'dnssec',
  'email_forwarding',
  'api',
];

/** Fields whose "paid" needs a feature_costs entry: the payable ones plus whois_privacy. */
export const COSTED_FEATURES = [...PAYABLE_FEATURES, 'whois_privacy'];

/**
 * Cross-field rules of feature "paid" (Archiv-Issue 124) for one schema-valid offer. A payable feature or
 * whois_privacy with "paid" needs feature_costs.<field> with a non-blank quote. Every
 * feature_costs entry needs the value "paid".
 */
export function featureCostFindings(doc) {
  const out = [];
  const features = doc.features ?? {};
  const costs = doc.feature_costs ?? {};
  for (const f of COSTED_FEATURES) {
    if (features[f] === 'paid' && !costs[f]) {
      out.push(`features.${f} "paid" needs feature_costs.${f} (source url and verbatim quote)`);
    }
  }
  for (const [f, cost] of Object.entries(costs)) {
    if (features[f] !== 'paid') {
      out.push(`feature_costs.${f} is only allowed when features.${f} is "paid"`);
    }
    if (!cost.source.quote.trim()) out.push(`feature_costs.${f}.source.quote is blank`);
    if (cost.note !== undefined && !cost.note.trim()) out.push(`feature_costs.${f}.note is blank`);
  }
  return out;
}

/**
 * Price state fields of a history entry (packages/core HISTORY_STATE_FIELDS; schema
 * $defs/entry besides date and source; the optional market is compared as well).
 */
export const HISTORY_STATE_FIELDS = [
  'currency',
  'vat_included',
  'unit',
  'setup',
  'year1',
  'renewal',
  'transfer_in',
];

/** The price state of an offer as a history entry records it. */
export function offerPriceState(offer) {
  const p = offer.price;
  const m = offer.foreign_market;
  return {
    currency: offer.currency,
    vat_included: offer.vat_included,
    unit: p.unit,
    setup: p.setup,
    year1: p.year1,
    renewal: p.renewal,
    transfer_in: p.transfer_in ?? null,
    ...(m && m.currency === offer.currency ? { market: m.country } : {}),
  };
}

/**
 * Currencies of foreign market displays the data may record (owner decision 2026-11-19: USD only;
 * packages/core FOREIGN_MARKET_CURRENCIES, kept equal by a test).
 */
export const FOREIGN_MARKET_CURRENCIES = ['USD'];

/**
 * Hand-entered multi-year offers entered before evidence.quote existed (#28), by
 * `<provider>/<tld>` with their exact evidence.fetched_at. Their source is in
 * docs/research/providers.md. The exception holds only for that fetched_at: a new manual check
 * (another fetched_at) needs the quote. No other offer is exempt.
 */
export const QUOTE_EXEMPT = new Map([['dynadot/ai', '2026-11-15T09:06:21Z']]);

/** Fields that must be equal within one segment of a history (one market). */
const SEGMENT_FIELDS = ['currency', 'unit', 'vat_included', 'market'];

/**
 * The switch between the German display (EUR, gross, no market) and a foreign market display
 * (USD, net, market set) in either direction: it starts a new segment of the history (owner
 * decision 2026-11-19; packages/core isMarketSwitch).
 */
export function isMarketSwitch(a, b) {
  if (a.unit !== b.unit) return false;
  const german = (x) => x.market === undefined && x.currency === 'EUR' && x.vat_included === true;
  const foreign = (x) =>
    x.market !== undefined &&
    x.market !== 'DE' &&
    FOREIGN_MARKET_CURRENCIES.includes(x.currency) &&
    x.vat_included === false;
  return (german(a) && foreign(b)) || (foreign(a) && german(b));
}

/** Cross-field rules of one schema-valid history against its schema-valid offer. */
export function historyFindings(history, offer) {
  const out = [];
  const entries = history.entries;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].date <= entries[i - 1].date) {
      out.push(`entries[${i}].date ${entries[i].date} is not after ${entries[i - 1].date}`);
    }
  }
  const state = offerPriceState(offer);
  // segments: a market switch starts a new one. The last segment matches the offer, every earlier
  // one is consistent with its own last entry (currency, unit, VAT mode and market).
  const starts = [0];
  for (let i = 1; i < entries.length; i++) {
    if (isMarketSwitch(entries[i - 1], entries[i])) starts.push(i);
  }
  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : entries.length;
    const lastSegment = end === entries.length;
    const ref = lastSegment ? state : entries[end - 1];
    const refName = lastSegment ? 'offer' : `entries[${end - 1}]`;
    for (let i = start; i < end; i++) {
      for (const f of SEGMENT_FIELDS) {
        if (entries[i][f] !== ref[f]) {
          out.push(
            `entries[${i}].${f} ${JSON.stringify(entries[i][f])} != ${refName} ${JSON.stringify(ref[f])}`,
          );
        }
      }
    }
  });
  const last = entries.at(-1);
  const differs = [...HISTORY_STATE_FIELDS, 'market'].filter((f) => last[f] !== state[f]);
  if (differs.length) {
    out.push(`last entry differs from the offer (${differs.join(', ')}); run npm run history:sync`);
  }
  return out;
}

/** Findings (strings) for one data dir; empty = valid. */
export function validateDir(dir, validators = makeValidators()) {
  const findings = [];
  const rel = (f) => relative(process.cwd(), f) || f;
  const load = (file) => {
    try {
      return readJson(file);
    } catch (err) {
      findings.push(`${rel(file)}: invalid JSON (${err.message})`);
      return undefined;
    }
  };
  const check = (validate, file, doc) => {
    if (validate(doc)) return true;
    for (const e of validate.errors) {
      findings.push(`${rel(file)}: ${e.instancePath || '/'} ${e.message}`);
    }
    return false;
  };

  // .json files of a dir; everything else there is a finding
  const jsonFiles = (d) =>
    visible(d).filter((n) => {
      if (n.endsWith('.json') && !isDir(join(d, n))) return true;
      findings.push(`${rel(join(d, n))}: unexpected entry (only .json files belong here)`);
      return false;
    });

  if (!isDir(dir)) return findings; // no data yet (e.g. data/ before the first seed)
  for (const n of visible(dir)) {
    if (TOP_LEVEL_FILES.has(n) && !isDir(join(dir, n))) continue;
    if (!TOP_LEVEL.has(n) || !isDir(join(dir, n))) {
      findings.push(
        `${rel(join(dir, n))}: unexpected entry (only providers/, offers/, fx/, history/, LICENSE)`,
      );
    }
  }

  const providers = new Map();
  /** provider id -> file, for findings on the provider file */
  const providerFiles = new Map();
  const providersDir = join(dir, 'providers');
  if (isDir(providersDir)) {
    for (const f of jsonFiles(providersDir)) {
      const file = join(providersDir, f);
      const doc = load(file);
      if (doc === undefined || !check(validators.provider, file, doc)) continue;
      if (doc.id !== basename(f, '.json')) findings.push(`${rel(file)}: id != file name`);
      if (doc.vat_rate === null && EU.has(doc.country)) {
        findings.push(`${rel(file)}: vat_rate null is only allowed for non-EU providers`);
      }
      providers.set(doc.id, doc);
      providerFiles.set(doc.id, file);
    }
  }
  const operators = [...providers.values()].filter((p) => p.operator === true);
  if (operators.length > 1) {
    findings.push(`${rel(providersDir)}: ${operators.length} providers with operator true (max 1)`);
  }

  const offersDir = join(dir, 'offers');
  /** provider id -> number of offer files (valid or not: a broken file is reported on its own) */
  const offerCount = new Map();
  /** `<provider>/<tld>` -> schema-valid offer and its file, for the history checks */
  const validOffers = new Map();
  if (isDir(offersDir)) {
    for (const p of visible(offersDir)) {
      const pDir = join(offersDir, p);
      if (!isDir(pDir)) {
        findings.push(`${rel(pDir)}: expected offers/<provider>/<tld>.json`);
        continue;
      }
      offerCount.set(p, jsonFiles(pDir).length);
      for (const f of jsonFiles(pDir)) {
        const file = join(pDir, f);
        const doc = load(file);
        if (doc === undefined || !check(validators.offer, file, doc)) continue;
        if (doc.provider !== p || doc.tld !== basename(f, '.json')) {
          findings.push(`${rel(file)}: provider/tld != path`);
        }
        validOffers.set(`${p}/${basename(f, '.json')}`, { doc, file });
        // a source for the setup fee belongs to a stated setup amount
        if (doc.price.setup_source && typeof doc.price.setup !== 'number') {
          findings.push(`${rel(file)}: price.setup_source without a setup amount`);
        }
        // methodik: a transfer includes a term only when the provider says so, with the source
        const tSource = doc.price.transfer_includes_term_source;
        if (
          doc.price.transfer_includes_term === true &&
          !(tSource && (tSource.url || tSource.quote))
        ) {
          findings.push(
            `${rel(file)}: price.transfer_includes_term true needs transfer_includes_term_source (url or quote)`,
          );
        }
        // limit_scope unlimited (owner decision 2026-11-15): only with the provider's verbatim quote,
        // and without a number
        const pSource = doc.promo?.max_per_customer_source;
        if (doc.promo?.limit_scope === 'unlimited') {
          if (!pSource?.quote?.trim()) {
            findings.push(
              `${rel(file)}: promo.limit_scope unlimited needs max_per_customer_source.quote (verbatim)`,
            );
          }
          if (typeof doc.promo.max_per_customer === 'number') {
            findings.push(`${rel(file)}: promo.limit_scope unlimited needs max_per_customer null`);
          }
        }
        // feature value "paid" (owner decision 2026-11-15, Archiv-Issue 124): only with the provider's source
        // (URL and verbatim quote) in feature_costs; a feature_costs entry only for a paid value
        findings.push(...featureCostFindings(doc).map((m) => `${rel(file)}: ${m}`));
        // a promo limit per customer is a provider statement: it needs its source
        if (
          typeof doc.promo?.max_per_customer === 'number' &&
          !(pSource && (pSource.url || pSource.quote))
        ) {
          findings.push(
            `${rel(file)}: promo.max_per_customer needs max_per_customer_source (url or quote)`,
          );
        }
        // a hand-entered price with a multi-year term (e.g. .ai, 2 years): only with the verbatim
        // source text, which shows whether the amount is per year or per term (#28). Only the
        // offers in QUOTE_EXEMPT, with exactly their fetched_at, are exempt
        const quote = doc.evidence.quote;
        if (quote !== undefined && !quote.trim()) {
          findings.push(`${rel(file)}: evidence.quote is blank`);
        }
        const multiYear =
          (doc.price.term_years ?? 1) > 1 || (doc.price.renewal_term_years ?? 1) > 1;
        if (
          doc.evidence.method === 'manual' &&
          multiYear &&
          quote === undefined &&
          QUOTE_EXEMPT.get(`${doc.provider}/${doc.tld}`) !== doc.evidence.fetched_at
        ) {
          findings.push(
            `${rel(file)}: a hand-entered offer with a multi-year term needs evidence.quote (verbatim source text: per year or per term)`,
          );
        }
        // another market's prices (owner decision 2026-11-19): in that market's currency, one of
        // FOREIGN_MARKET_CURRENCIES (no decision for EUR or others), and net, so the site converts and
        // adds German VAT
        const market = doc.foreign_market;
        if (market) {
          if (market.currency !== doc.currency) {
            findings.push(
              `${rel(file)}: foreign_market.currency ${market.currency} differs from currency ${doc.currency}`,
            );
          }
          if (!FOREIGN_MARKET_CURRENCIES.includes(market.currency)) {
            findings.push(
              `${rel(file)}: foreign_market.currency ${market.currency} is not one of ${FOREIGN_MARKET_CURRENCIES.join(', ')}`,
            );
          }
          if (doc.vat_included !== false) {
            findings.push(`${rel(file)}: foreign_market needs vat_included false (net prices)`);
          }
        }
        const provider = providers.get(doc.provider);
        if (!provider) {
          findings.push(`${rel(file)}: provider '${doc.provider}' has no providers/ file`);
        } else if (doc.vat_included === null && EU.has(provider.country)) {
          findings.push(`${rel(file)}: vat_included null is only allowed for non-EU providers`);
        } else if (
          doc.vat_included !== null &&
          doc.vat_rate === undefined &&
          provider.vat_rate === null
        ) {
          findings.push(
            `${rel(file)}: stated VAT (vat_included true/false) needs a vat_rate (offer or provider)`,
          );
        }
      }
    }
  }

  // Methodik list (site/src/lib/provider-sources.mjs): every provider either has offers or says
  // why not, so the list cannot drift from the data.
  for (const [id, doc] of providers) {
    const n = offerCount.get(id) ?? 0;
    const status = doc.collection?.status;
    if (n === 0 && !status) {
      findings.push(
        `${rel(providerFiles.get(id))}: no offers in offers/${id}/ – needs collection.status (excluded or pending) and a reason`,
      );
    } else if (n > 0 && status) {
      findings.push(
        `${rel(providerFiles.get(id))}: collection.status '${status}' but ${n} offer file(s) in offers/${id}/`,
      );
    }
  }

  // price history: one per offer, consistent with it (npm run history:sync writes them)
  const historyDir = join(dir, 'history');
  const withHistory = new Set();
  if (isDir(historyDir)) {
    for (const p of visible(historyDir)) {
      const pDir = join(historyDir, p);
      if (!isDir(pDir)) {
        findings.push(`${rel(pDir)}: expected history/<provider>/<tld>.json`);
        continue;
      }
      for (const f of jsonFiles(pDir)) {
        const file = join(pDir, f);
        const key = `${p}/${basename(f, '.json')}`;
        withHistory.add(key);
        const doc = load(file);
        if (doc === undefined || !check(validators.history, file, doc)) continue;
        if (doc.provider !== p || doc.tld !== basename(f, '.json')) {
          findings.push(`${rel(file)}: provider/tld != path`);
        }
        const offer = validOffers.get(key);
        if (!offer) {
          if (!existsSync(join(offersDir, p, f))) {
            findings.push(`${rel(file)}: no offer offers/${key}.json for this history`);
          }
          continue; // a broken offer is reported on its own
        }
        findings.push(...historyFindings(doc, offer.doc).map((m) => `${rel(file)}: ${m}`));
      }
    }
  }
  for (const [key, { file }] of validOffers) {
    if (!withHistory.has(key)) {
      findings.push(`${rel(file)}: no price history history/${key}.json (npm run history:sync)`);
    }
  }

  const fxDir = join(dir, 'fx');
  if (isDir(fxDir)) {
    for (const f of jsonFiles(fxDir)) {
      const file = join(fxDir, f);
      const doc = load(file);
      if (doc === undefined || !check(validators.fx, file, doc)) continue;
      if (doc.date !== basename(f, '.json')) findings.push(`${rel(file)}: date != file name`);
    }
  }
  return findings;
}

export function main(dirs) {
  const targets = dirs.length ? dirs : [join(ROOT, 'data'), join(ROOT, 'schema/examples')];
  const validators = makeValidators();
  const findings = targets.flatMap((d) => validateDir(resolve(d), validators));
  if (findings.length) {
    console.error(`Data validation FAILED:\n  - ${findings.join('\n  - ')}`);
    return 1;
  }
  console.log(`Data valid (${targets.map((d) => relative(ROOT, resolve(d)) || '.').join(', ')})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
