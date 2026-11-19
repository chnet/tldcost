// validate-data.test.mjs — schema + consistency gate for data/ (concept section 8). Fixtures are
// built from schema/examples in throw-away dirs; scripts/fixtures/no-source-url is the checked-in
// case that must fail (evidence.source_url is mandatory).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  makeValidators,
  offerPriceState,
  PAYABLE_FEATURES,
  QUOTE_REQUIRED_FROM,
  validateDir,
} from './validate-data.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts/validate-data.mjs');
const EXAMPLES = join(ROOT, 'schema/examples');
const read = (p) => JSON.parse(readFileSync(join(EXAMPLES, p), 'utf8'));
const PROVIDER = 'providers/example-registrar.json';
const OFFER = 'offers/example-registrar/de.json';
const V = makeValidators();
/** A provider on its own (no offers) needs a collection status; the tests below use this one. */
const ALONE = { status: 'pending', reason: 'Erfassung ausstehend' };
const alone = () => ({ ...read(PROVIDER), collection: ALONE });

/** A one-entry price history matching the offer (what npm run history:sync seeds). */
function historyOf(offer) {
  return {
    schema_version: 1,
    provider: offer.provider,
    tld: offer.tld,
    entries: [
      {
        date: offer.evidence.fetched_at.slice(0, 10),
        ...offerPriceState(offer),
        source: { url: offer.evidence.source_url, fetched_at: offer.evidence.fetched_at },
      },
    ],
  };
}

/**
 * A throw-away data dir. Every offer that looks complete gets its matching history unless the
 * files name one themselves or `history: false` (the history tests below).
 */
function dataDir(files, { history = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tldcost-validate-'));
  const all = { ...files };
  if (history) {
    for (const [path, doc] of Object.entries(files)) {
      const m = /^offers\/([^/]+\/[^/]+\.json)$/.exec(path);
      const own = m && `history/${m[1]}`;
      if (!own || own in files || typeof doc !== 'object' || doc === null) continue;
      try {
        all[own] = historyOf(doc);
      } catch {
        // an offer too broken for a history: its own findings are what the test is about
      }
    }
  }
  for (const [path, doc] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof doc === 'string' ? doc : JSON.stringify(doc));
  }
  return dir;
}

function withOffer(mutate) {
  const offer = read(OFFER);
  mutate(offer);
  return dataDir({ [PROVIDER]: read(PROVIDER), [OFFER]: offer });
}

test('schema examples and an empty dir are valid', () => {
  assert.deepEqual(validateDir(EXAMPLES, V), []);
  assert.deepEqual(validateDir(dataDir({}), V), []);
  assert.deepEqual(validateDir(join(dataDir({}), 'missing'), V), []);
});

test('offer without evidence.source_url fails (checked-in fixture, CLI exit 1)', () => {
  const fixture = join(ROOT, 'scripts/fixtures/no-source-url');
  const findings = validateDir(fixture, V);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /\/evidence must have required property 'source_url'/);
  const r = spawnSync('node', [SCRIPT, fixture], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /source_url/);
  assert.equal(spawnSync('node', [SCRIPT, EXAMPLES]).status, 0);
});

test('source_url must be an https URI', () => {
  for (const url of ['not a url', 'http://registrar.example/x', '']) {
    const f = validateDir(
      withOffer((o) => (o.evidence.source_url = url)),
      V,
    );
    assert.ok(
      f.some((x) => /source_url/.test(x)),
      `${url}: ${f}`,
    );
  }
});

test('amounts are integer cents: floats and negatives fail, null (unknown) passes', () => {
  let f = validateDir(
    withOffer((o) => (o.price.year1 = 5.04)),
    V,
  );
  assert.ok(
    f.some((x) => /\/price\/year1 must be integer/.test(x)),
    f.join('\n'),
  );
  f = validateDir(
    withOffer((o) => (o.price.renewal = -1)),
    V,
  );
  assert.ok(
    f.some((x) => /\/price\/renewal must be >= 0/.test(x)),
    f.join('\n'),
  );
  assert.deepEqual(
    validateDir(
      withOffer((o) => (o.price.setup = null)),
      V,
    ),
    [],
  );
});

test('unknown fields, bad enums and bad dates fail', () => {
  const cases = [
    (o) => (o.price.year4 = 100),
    (o) => (o.evidence.method = 'guess'),
    (o) => (o.evidence.fetched_at = '01.11.2026'),
    (o) => (o.price.unit = 'week'),
    (o) => (o.tld = '.de'),
    (o) => (o.vat_rate = 0.19), // basis points: 1900 = 19 %
  ];
  for (const mutate of cases) {
    assert.notDeepEqual(validateDir(withOffer(mutate), V), [], mutate.toString());
  }
});

test('whois_privacy: free, paid, none, n/a and null pass; other values fail', () => {
  const source = {
    url: 'https://registrar.example/preise',
    quote: 'Whois-Schutz: 4,99 € pro Jahr',
  };
  for (const value of ['free', 'paid', 'none', 'n/a', null]) {
    assert.deepEqual(
      validateDir(
        withOffer((o) => {
          o.features.whois_privacy = value;
          // "paid" needs its source (featureCostFindings)
          if (value === 'paid') o.feature_costs = { whois_privacy: { source } };
        }),
        V,
      ),
      [],
      String(value),
    );
  }
  for (const value of ['no', 'unknown', '', true]) {
    const f = validateDir(
      withOffer((o) => (o.features.whois_privacy = value)),
      V,
    );
    assert.ok(
      f.some((x) => /\/features\/whois_privacy must be equal to one of the allowed values/.test(x)),
      `${value}: ${f}`,
    );
  }
});

test('provider: operator is optional (default false) and must be boolean', () => {
  const p = alone();
  delete p.operator;
  assert.deepEqual(validateDir(dataDir({ [PROVIDER]: p }), V), []);
  assert.notDeepEqual(validateDir(dataDir({ [PROVIDER]: { ...p, operator: 'yes' } }), V), []);
});

test('provider country_note: optional, non-empty string up to 200 chars', () => {
  const p = alone();
  const withNote = (country_note) => dataDir({ [PROVIDER]: { ...p, country_note } });
  assert.deepEqual(validateDir(withNote('Rechnung über Example EU (LU) mit USt.'), V), []);
  assert.deepEqual(validateDir(withNote('x'.repeat(200)), V), []);
  for (const bad of ['', 'x'.repeat(201), 42]) {
    assert.ok(
      validateDir(withNote(bad), V).some((x) => x.includes('/country_note')),
      JSON.stringify(bad),
    );
  }
});

test('provider terms.notes: only contract field names, non-empty strings up to 300 chars', () => {
  const p = alone();
  const withNotes = (notes) => dataDir({ [PROVIDER]: { ...p, terms: { ...p.terms, notes } } });
  assert.deepEqual(validateDir(withNotes({ notice_period_days: 'AGB § 4: vier Wochen.' }), V), []);
  assert.deepEqual(
    validateDir(
      withNotes({
        min_term_months: 'a',
        notice_period_days: 'b',
        billing_cycle: 'c',
        auto_renew_default: 'd',
      }),
      V,
    ),
    [],
  );
  for (const bad of [
    { price: 'not a contract field' },
    { notice_period_days: '' },
    { notice_period_days: 'x'.repeat(301) },
    { notice_period_days: 30 },
    {},
  ]) {
    assert.notDeepEqual(validateDir(withNotes(bad), V), [], JSON.stringify(bad).slice(0, 60));
  }
});

test('consistency: file names, provider reference, layout, JSON syntax', () => {
  const p = read(PROVIDER);
  const o = read(OFFER);
  const cases = {
    'id != file name': { 'providers/other.json': p },
    'provider/tld != path': { [PROVIDER]: p, 'offers/example-registrar/com.json': o },
    'has no providers/ file': { [OFFER]: o },
    'expected offers/<provider>/<tld>.json': { 'offers/de.json': o },
    'invalid JSON': { [PROVIDER]: '{oops' },
  };
  for (const [msg, files] of Object.entries(cases)) {
    const f = validateDir(dataDir(files), V);
    assert.ok(
      f.some((x) => x.includes(msg)),
      `${msg}: ${f}`,
    );
  }
});

test('vat_included null (no VAT statement) only for providers outside the EU', () => {
  const offer = { ...read(OFFER), vat_included: null };
  const provider = (country) => ({ ...read(PROVIDER), country });
  for (const country of ['US', 'CH', 'GB']) {
    assert.deepEqual(
      validateDir(dataDir({ [PROVIDER]: provider(country), [OFFER]: offer }), V),
      [],
    );
  }
  for (const country of ['DE', 'AT', 'GR']) {
    const f = validateDir(dataDir({ [PROVIDER]: provider(country), [OFFER]: offer }), V);
    assert.ok(
      f.some((x) => x.includes('only allowed for non-EU providers')),
      `${country}: ${f}`,
    );
  }
});

test('provider vat_rate null only outside the EU; offers with stated VAT then need their own vat_rate', () => {
  const provider = (country) => ({ ...read(PROVIDER), country, vat_rate: null });
  const offer = (o) => ({ ...read(OFFER), ...o });
  const us = (o) => validateDir(dataDir({ [PROVIDER]: provider('US'), [OFFER]: offer(o) }), V);
  for (const country of ['US', 'CH']) {
    assert.deepEqual(
      validateDir(
        dataDir({ [PROVIDER]: provider(country), [OFFER]: offer({ vat_included: null }) }),
        V,
      ),
      [],
      country,
    );
  }
  let f;
  for (const vat_included of [true, false]) {
    assert.deepEqual(us({ vat_included, vat_rate: 0 }), [], `${vat_included} with own rate`);
    f = us({ vat_included });
    assert.ok(
      f.some((x) => x.includes('stated VAT (vat_included true/false) needs a vat_rate')),
      `${vat_included}: ${f}`,
    );
  }
  for (const country of ['DE', 'AT']) {
    f = validateDir(dataDir({ [PROVIDER]: provider(country) }), V);
    assert.ok(
      f.some((x) => x.includes('vat_rate null is only allowed for non-EU providers')),
      `${country}: ${f}`,
    );
  }
});

test('evidence.quote: hand-entered offers with a multi-year term need it, never blank (#28)', () => {
  const QUOTE = '.ai Registrierung 2 Jahre 100,00 € inkl. MwSt.';
  const manual = (o, price = {}, evidence = {}) => {
    Object.assign(o.price, price);
    Object.assign(o.evidence, { method: 'manual', fetched_at: '2026-11-20T09:00:00Z' }, evidence);
  };
  // 2-year term, by hand, with the quote: valid
  assert.deepEqual(
    validateDir(
      withOffer((o) => manual(o, { term_years: 2, renewal_term_years: 2 }, { quote: QUOTE })),
      V,
    ),
    [],
  );
  // the same without the quote: rejected, also for a multi-year renewal term alone
  for (const price of [{ term_years: 2 }, { renewal_term_years: 2 }]) {
    const f = validateDir(
      withOffer((o) => manual(o, price)),
      V,
    );
    assert.ok(
      f.some((x) => x.includes('a hand-entered offer with a multi-year term needs evidence.quote')),
      `${JSON.stringify(price)}: ${f}`,
    );
  }
  // 1-year terms by hand, or a scraped multi-year offer: no quote needed (as before)
  assert.deepEqual(
    validateDir(
      withOffer((o) => manual(o)),
      V,
    ),
    [],
  );
  assert.deepEqual(
    validateDir(
      withOffer((o) => {
        Object.assign(o.price, { term_years: 2 });
        o.evidence.method = 'scrape';
      }),
      V,
    ),
    [],
  );
  // read before the rule applies (the hand-entered .ai offers of 2026-11-15): no quote needed yet
  assert.equal(QUOTE_REQUIRED_FROM, '2026-11-20');
  assert.deepEqual(
    validateDir(
      withOffer((o) => manual(o, { term_years: 2 }, { fetched_at: '2026-11-19T23:59:59Z' })),
      V,
    ),
    [],
  );
  // blank or too long: rejected
  let f = validateDir(
    withOffer((o) => manual(o, { term_years: 2 }, { quote: '   ' })),
    V,
  );
  assert.ok(
    f.some((x) => x.includes('evidence.quote is blank')),
    `${f}`,
  );
  f = validateDir(
    withOffer((o) => manual(o, {}, { quote: 'x'.repeat(501) })),
    V,
  );
  assert.ok(f.length > 0, 'quote longer than 500 characters is rejected');
});

test('foreign_market (owner decision 2026-11-19): currency matches, USD only, net prices', () => {
  const market = { country: 'US', currency: 'USD', quote: 'Domainpreise in USD .de 9,99 9,99' };
  const offer = (o) => ({ ...read(OFFER), foreign_market: market, ...o });
  const check = (o) => validateDir(dataDir({ [PROVIDER]: read(PROVIDER), [OFFER]: offer(o) }), V);
  assert.deepEqual(check({ currency: 'USD', vat_included: false }), []);
  let f = check({ currency: 'EUR', vat_included: false });
  assert.ok(
    f.some((x) => x.includes('foreign_market.currency USD differs from currency EUR')),
    `${f}`,
  );
  f = check({
    currency: 'EUR',
    vat_included: false,
    foreign_market: { ...market, currency: 'EUR' },
  });
  assert.ok(
    f.some((x) => x.includes('foreign_market.currency EUR is not one of USD')),
    `${f}`,
  );
  // GBP: no decision, fails even when it matches the offer
  f = check({
    currency: 'GBP',
    vat_included: false,
    foreign_market: { ...market, currency: 'GBP' },
  });
  assert.ok(
    f.some((x) => x.includes('foreign_market.currency GBP is not one of USD')),
    `${f}`,
  );
  f = check({ currency: 'USD', vat_included: true });
  assert.ok(
    f.some((x) => x.includes('foreign_market needs vat_included false')),
    `${f}`,
  );
  // schema: never the German market, all three fields required
  f = check({ currency: 'USD', vat_included: false, foreign_market: { ...market, country: 'DE' } });
  assert.ok(f.length > 0, 'country DE is rejected');
  f = check({
    currency: 'USD',
    vat_included: false,
    foreign_market: { country: 'US', currency: 'USD' },
  });
  assert.ok(f.length > 0, 'quote is required');
});

test('multi-year terms: integer 1..10, monthly prices only with 1-year terms', () => {
  assert.deepEqual(
    validateDir(
      withOffer((o) => {
        Object.assign(o.price, { term_years: 2, renewal_term_years: 2 });
        // the example is entered by hand: a multi-year term needs the verbatim quote (#28)
        o.evidence.quote = '2 Jahre 10,00 € inkl. MwSt.';
      }),
      V,
    ),
    [],
  );
  for (const mutate of [
    (o) => (o.price.term_years = 0),
    (o) => (o.price.renewal_term_years = 11),
    (o) => Object.assign(o.price, { unit: 'month', term_years: 2 }),
  ]) {
    assert.notDeepEqual(validateDir(withOffer(mutate), V), [], mutate.toString());
  }
});

test('stray files fail instead of being ignored; dotfiles are ignored', () => {
  const p = alone();
  const o = read(OFFER);
  const cases = {
    'offers/example-registrar/de.JSON': o,
    'offers/example-registrar/de.json.bak': o,
    'providers/notes.md': '# notes',
    'fx/2026-11-11.txt': 'x',
    'README.md': '# data',
    'offer.json': o,
    'tlds/de.json': {},
    'LICENSE.md': '# license',
    'providers/LICENSE': 'x',
  };
  for (const [path, doc] of Object.entries(cases)) {
    const f = validateDir(dataDir({ [PROVIDER]: p, [path]: doc }), V);
    assert.ok(
      f.some((x) => x.includes('unexpected entry')),
      `${path}: ${f}`,
    );
  }
  assert.deepEqual(
    validateDir(dataDir({ [PROVIDER]: p, '.DS_Store': 'x', 'providers/.gitkeep': '' }), V),
    [],
  );
  // the data license is the one plain file allowed directly in data/
  assert.deepEqual(validateDir(dataDir({ [PROVIDER]: p, LICENSE: 'CC BY 4.0' }), V), []);
});

test('at most one provider is the portal operator', () => {
  const p = alone();
  const op = (id) => ({ ...p, id, operator: true });
  assert.deepEqual(validateDir(dataDir({ 'providers/a.json': op('a'), [PROVIDER]: p }), V), []);
  const f = validateDir(dataDir({ 'providers/a.json': op('a'), 'providers/b.json': op('b') }), V);
  assert.ok(
    f.some((x) => x.includes('2 providers with operator true')),
    f.join('\n'),
  );
});

test('collection: a provider without offers needs a status, a provider with a status has none', () => {
  const p = read(PROVIDER);
  const o = read(OFFER);
  const with_ = (collection) => ({ ...p, collection });
  // offers and no status (a note on gaps is fine)
  assert.deepEqual(validateDir(dataDir({ [PROVIDER]: p, [OFFER]: o }), V), []);
  assert.deepEqual(
    validateDir(dataDir({ [PROVIDER]: with_({ reason: 'Zusatz-TLDs fehlen' }), [OFFER]: o }), V),
    [],
  );
  // no offers: status required
  for (const status of ['excluded', 'pending']) {
    assert.deepEqual(
      validateDir(dataDir({ [PROVIDER]: with_({ status, reason: 'Grund', issue: 77 }) }), V),
      [],
      status,
    );
  }
  for (const collection of [undefined, { reason: 'nur ein Hinweis' }]) {
    const f = validateDir(dataDir({ [PROVIDER]: { ...p, collection } }), V);
    assert.ok(
      f.some((x) => x.includes('no offers in offers/example-registrar/ – needs collection.status')),
      `${JSON.stringify(collection)}: ${f}`,
    );
  }
  // an empty offers dir counts as no offers
  const empty = dataDir({ [PROVIDER]: p, 'offers/example-registrar/.gitkeep': '' });
  assert.ok(validateDir(empty, V).some((x) => x.includes('needs collection.status')));
  // status with offers
  const f = validateDir(dataDir({ [PROVIDER]: with_(ALONE), [OFFER]: o }), V);
  assert.ok(
    f.some((x) => x.includes("collection.status 'pending' but 1 offer file(s)")),
    f.join('\n'),
  );
  // schema: reason required (1..200), known status, issue a positive integer, nothing else
  for (const collection of [
    { status: 'pending' },
    { status: 'pending', reason: '' },
    { status: 'pending', reason: 'x'.repeat(201) },
    { status: 'later', reason: 'x' },
    { status: 'pending', reason: 'x', issue: 0 },
    { status: 'pending', reason: 'x', note: 'y' },
  ]) {
    assert.notDeepEqual(
      validateDir(dataDir({ [PROVIDER]: with_(collection) }), V).filter((x) =>
        x.includes('/collection'),
      ),
      [],
      JSON.stringify(collection),
    );
  }
});

test('fx: ECB date = file name, rates per EUR > 0, no EUR entry', () => {
  const fx = JSON.parse(readFileSync(join(EXAMPLES, 'fx/2026-11-11.json'), 'utf8'));
  assert.deepEqual(validateDir(dataDir({ 'fx/2026-11-11.json': fx }), V), []);
  const cases = {
    'date != file name': { 'fx/2026-11-12.json': fx },
    '/rates': { 'fx/2026-11-11.json': { ...fx, rates: { USD: 0 } } },
    'property name': { 'fx/2026-11-11.json': { ...fx, rates: { EUR: 1 } } },
    '/source': { 'fx/2026-11-11.json': { ...fx, source: 'other' } },
  };
  for (const [msg, files] of Object.entries(cases)) {
    const f = validateDir(dataDir(files), V);
    assert.ok(
      f.some((x) => x.includes(msg)),
      `${msg}: ${f}`,
    );
  }
});

test('evidence.source_endpoint is optional and must be https', () => {
  const ep = 'https://api.registrar.example/v1/pricing';
  assert.deepEqual(
    validateDir(
      withOffer((o) => (o.evidence.source_endpoint = ep)),
      V,
    ),
    [],
  );
  assert.notDeepEqual(
    validateDir(
      withOffer((o) => (o.evidence.source_endpoint = 'http://api.registrar.example/')),
      V,
    ),
    [],
  );
});

test('transfer_includes_term: boolean or null; true needs a source (url or quote)', () => {
  for (const v of [true, false, null]) {
    const findings = validateDir(
      withOffer((o) => {
        o.price.transfer_includes_term = v;
        if (v)
          o.price.transfer_includes_term_source = { url: 'https://registrar.example/transfer' };
      }),
      V,
    );
    assert.deepEqual(findings, [], `value ${v}`);
  }
  const quoteOnly = withOffer((o) => {
    o.price.transfer_includes_term = true;
    o.price.transfer_includes_term_source = {
      quote: 'Der Transfer verlängert die Domain um ein Jahr.',
    };
  });
  assert.deepEqual(validateDir(quoteOnly, V), []);

  const noSource = validateDir(
    withOffer((o) => (o.price.transfer_includes_term = true)),
    V,
  );
  assert.equal(noSource.length, 1, noSource.join('\n'));
  assert.match(noSource[0], /transfer_includes_term true needs transfer_includes_term_source/);

  const bad = [
    (o) => (o.price.transfer_includes_term = 'yes'),
    (o) => (o.price.transfer_includes_term_source = {}),
    (o) => (o.price.transfer_includes_term_source = { url: 'not a url' }),
    (o) => (o.price.transfer_includes_term_source = { quote: '' }),
    (o) => (o.price.transfer_includes_term_source = { quote: null }),
    (o) => (o.price.transfer_includes_term_source = { url: 'https://x.example/', note: 'x' }),
  ];
  for (const mutate of bad) {
    assert.ok(validateDir(withOffer(mutate), V).length > 0, mutate.toString());
  }
});

test('price.setup_source: url and verbatim quote, only with a setup amount', () => {
  const source = { url: 'https://registrar.example/domains/', quote: 'Einrichtung: 0 €' };
  assert.deepEqual(
    validateDir(
      withOffer((o) => (o.price.setup_source = source)),
      V,
    ),
    [],
  );

  const noAmount = validateDir(
    withOffer((o) => {
      o.price.setup = null;
      o.price.setup_source = source;
    }),
    V,
  );
  assert.equal(noAmount.length, 1, noAmount.join('\n'));
  assert.match(noAmount[0], /price\.setup_source without a setup amount/);

  const bad = [
    (o) => (o.price.setup_source = { url: source.url }),
    (o) => (o.price.setup_source = { quote: source.quote }),
    (o) => (o.price.setup_source = { ...source, quote: '' }),
    (o) => (o.price.setup_source = { ...source, url: 'not a url' }),
    (o) => (o.price.setup_source = { ...source, lang: 'de' }),
    (o) => (o.price.setup_source = null),
  ];
  for (const mutate of bad) {
    assert.ok(validateDir(withOffer(mutate), V).length > 0, mutate.toString());
  }
});

test('promo.max_per_customer (integer >= 1 or null, a number needs a source) and limit_scope', () => {
  const promo = (extra) => (o) => (o.promo = { conditions: 'Nur einmal pro Kunde.', ...extra });
  const ok = [
    { max_per_customer: null },
    { max_per_customer: 1, max_per_customer_source: { quote: 'Nur einmal pro Kunde.' } },
    { max_per_customer: 5, max_per_customer_source: { url: 'https://registrar.example/promo' } },
    { limit_scope: 'per_tld' },
    { limit_scope: null },
    {
      max_per_customer: 1,
      limit_scope: 'per_customer',
      max_per_customer_source: { quote: 'Das Angebot gilt nur einmal pro Kunde.' },
    },
  ];
  for (const extra of ok) {
    assert.deepEqual(validateDir(withOffer(promo(extra)), V), [], JSON.stringify(extra));
  }
  const noSource = validateDir(withOffer(promo({ max_per_customer: 1 })), V);
  assert.equal(noSource.length, 1, noSource.join('\n'));
  assert.match(noSource[0], /promo.max_per_customer needs max_per_customer_source/);
  for (const extra of [
    { max_per_customer: 0 },
    { max_per_customer: 1.5 },
    { max_per_customer: '1' },
    { max_per_customer_source: {} },
    { max_per_customer_source: { quote: null } },
    { limit_scope: 'per_order' },
  ]) {
    assert.ok(validateDir(withOffer(promo(extra)), V).length > 0, JSON.stringify(extra));
  }
});

test('promo.limit_scope unlimited: only with a verbatim quote and max_per_customer null', () => {
  const promo = (extra) => (o) =>
    (o.promo = { conditions: 'Alle anderen TLDs unbegrenzt.', limit_scope: 'unlimited', ...extra });
  const quote = { max_per_customer_source: { quote: 'Alle anderen TLDs unbegrenzt.' } };
  assert.deepEqual(validateDir(withOffer(promo(quote)), V), []);
  assert.deepEqual(validateDir(withOffer(promo({ ...quote, max_per_customer: null })), V), []);
  const noQuote = validateDir(
    withOffer(promo({ max_per_customer_source: { url: 'https://registrar.example/p' } })),
    V,
  );
  assert.equal(noQuote.length, 1, noQuote.join('\n'));
  assert.match(noQuote[0], /limit_scope unlimited needs max_per_customer_source.quote/);
  assert.match(
    validateDir(withOffer(promo({})), V).join('\n'),
    /needs max_per_customer_source.quote/,
  );
  const withNumber = validateDir(withOffer(promo({ ...quote, max_per_customer: 3 })), V);
  assert.equal(withNumber.length, 1, withNumber.join('\n'));
  assert.match(withNumber[0], /limit_scope unlimited needs max_per_customer null/);
  assert.ok(
    validateDir(withOffer(promo({ limit_scope: 'without_limit', ...quote })), V).length > 0,
  );
});

test('feature value "paid" (Archiv-Issue 124): payable fields only, with source; feature_costs shape', () => {
  const SRC = {
    url: 'https://registrar.example/agb',
    quote: 'Die DNS-Verwaltung kostet 1,90 € je Domain und Jahr.',
  };
  const paid = (field, cost) => (o) => {
    o.features[field] = 'paid';
    if (cost !== undefined) o.feature_costs = { [field]: cost };
  };
  // every payable field accepts "paid" with a source; price, unit and note are optional
  for (const field of PAYABLE_FEATURES) {
    assert.deepEqual(validateDir(withOffer(paid(field, { source: SRC })), V), [], field);
  }
  const full = { source: SRC, price_cents: 190, unit: 'year', note: 'auch im Paket für 24,90 €' };
  // source.lang: optional, de or en
  for (const lang of ['de', 'en']) {
    assert.deepEqual(
      validateDir(withOffer(paid('dns_editor', { source: { ...SRC, lang } })), V),
      [],
      lang,
    );
  }
  assert.ok(
    validateDir(withOffer(paid('dns_editor', { source: { ...SRC, lang: 'fr' } })), V).length > 0,
  );
  assert.deepEqual(validateDir(withOffer(paid('dns_editor', full)), V), []);
  for (const unit of ['month', 'once']) {
    assert.deepEqual(validateDir(withOffer(paid('dns_editor', { ...full, unit })), V), [], unit);
  }

  // "paid" without its source
  const missing = validateDir(withOffer(paid('dns_editor')), V);
  assert.equal(missing.length, 1, missing.join('\n'));
  assert.match(missing[0], /features\.dns_editor "paid" needs feature_costs\.dns_editor/);
  // a source without url or quote, or a blank quote
  for (const source of [{ url: SRC.url }, { quote: SRC.quote }]) {
    assert.ok(validateDir(withOffer(paid('dns_editor', { source })), V).length > 0);
  }
  assert.match(
    validateDir(withOffer(paid('dns_editor', { source: { ...SRC, quote: '  ' } })), V).join('\n'),
    /feature_costs\.dns_editor\.source\.quote is blank/,
  );
  assert.ok(
    validateDir(withOffer(paid('dns_editor', { source: { ...SRC, url: 'http://x.example/' } })), V)
      .length > 0,
  );
  // price and unit only together; integer cents; known units; note up to 200 characters
  for (const bad of [
    { source: SRC, price_cents: 190 },
    { source: SRC, unit: 'year' },
    { source: SRC, price_cents: 1.9, unit: 'year' },
    { source: SRC, price_cents: -1, unit: 'year' },
    { source: SRC, price_cents: 190, unit: 'week' },
    { source: SRC, note: 'x'.repeat(201) },
    { source: SRC, note: '' },
    { source: SRC, currency: 'USD' },
  ]) {
    assert.ok(validateDir(withOffer(paid('dns_editor', bad)), V).length > 0, JSON.stringify(bad));
  }

  // a feature_costs entry only for a "paid" value
  const notPaid = validateDir(
    withOffer((o) => {
      o.features.dns_editor = true;
      o.feature_costs = { dns_editor: { source: SRC } };
    }),
    V,
  );
  assert.equal(notPaid.length, 1, notPaid.join('\n'));
  assert.match(notPaid[0], /feature_costs\.dns_editor is only allowed when features\.dns_editor/);
  // two_factor and payment_methods never take "paid" or a cost entry
  assert.ok(
    validateDir(
      withOffer((o) => (o.features.two_factor = 'paid')),
      V,
    ).length > 0,
  );
  assert.ok(
    validateDir(
      withOffer((o) => (o.feature_costs = { two_factor: { source: SRC } })),
      V,
    ).length > 0,
  );
  // other strings fail
  assert.ok(
    validateDir(
      withOffer((o) => (o.features.dnssec = 'free')),
      V,
    ).length > 0,
  );

  // whois_privacy keeps its enum; its "paid" needs a source as well (Archiv-Issue 124 follow-up, after the
  // backfill)
  const whoisNoSource = validateDir(
    withOffer((o) => (o.features.whois_privacy = 'paid')),
    V,
  );
  assert.equal(whoisNoSource.length, 1, whoisNoSource.join('\n'));
  assert.match(
    whoisNoSource[0],
    /features\.whois_privacy "paid" needs feature_costs\.whois_privacy \(source url and verbatim quote\)/,
  );
  assert.deepEqual(
    validateDir(
      withOffer((o) => {
        o.features.whois_privacy = 'paid';
        o.feature_costs = { whois_privacy: { source: SRC, price_cents: 499, unit: 'year' } };
      }),
      V,
    ),
    [],
  );
  assert.match(
    validateDir(
      withOffer((o) => {
        o.features.whois_privacy = 'n/a';
        o.feature_costs = { whois_privacy: { source: SRC } };
      }),
      V,
    ).join('\n'),
    /feature_costs\.whois_privacy is only allowed when features\.whois_privacy is "paid"/,
  );
});

test('price history: one per offer, ascending dates, same currency/unit/VAT, last entry = offer', () => {
  const offer = read(OFFER);
  const H = 'history/example-registrar/de.json';
  const base = historyOf(offer);
  const [entry] = base.entries;
  const run = (history, extra = {}) =>
    validateDir(dataDir({ [PROVIDER]: read(PROVIDER), [OFFER]: offer, [H]: history, ...extra }), V);
  assert.deepEqual(run(base), []);

  // an offer without a history
  const none = validateDir(
    dataDir({ [PROVIDER]: read(PROVIDER), [OFFER]: offer }, { history: false }),
    V,
  );
  assert.equal(none.length, 1, none.join('\n'));
  assert.match(
    none[0],
    /no price history history\/example-registrar\/de\.json \(npm run history:sync\)/,
  );

  // a history without an offer
  const orphan = { ...base, tld: 'com' };
  const o = run(base, { 'history/example-registrar/com.json': orphan });
  assert.equal(o.length, 1, o.join('\n'));
  assert.match(o[0], /no offer offers\/example-registrar\/com\.json for this history/);

  // dates: strictly ascending, no duplicate day
  const twice = run({ ...base, entries: [{ ...entry, renewal: 1 }, entry] });
  assert.match(twice.join('\n'), /entries\[1\]\.date \d{4}-\d\d-\d\d is not after/);

  // every entry shares the offer's currency, price unit and VAT mode
  const older = {
    ...entry,
    date: '2000-01-01',
    currency: 'USD',
    unit: 'month',
    vat_included: null,
  };
  const mixed = run({ ...base, entries: [older, entry] });
  for (const f of ['currency', 'unit', 'vat_included']) {
    assert.ok(
      mixed.some((x) => x.includes(`entries[0].${f}`)),
      `${f}: ${mixed}`,
    );
  }

  // a hand edit of the VAT mode with the old history kept: caught, never silently restarted
  const vat = validateDir(
    dataDir({
      [PROVIDER]: read(PROVIDER),
      [OFFER]: { ...offer, vat_included: !offer.vat_included },
      [H]: base,
    }),
    V,
  );
  assert.ok(
    vat.some((x) => /entries\[0\]\.vat_included/.test(x)),
    vat.join('\n'),
  );
  assert.ok(
    vat.some((x) => /last entry differs from the offer \(vat_included\)/.test(x)),
    vat.join('\n'),
  );

  // the last entry is the offer's current state
  const stale = run({ ...base, entries: [{ ...entry, renewal: (entry.renewal ?? 0) + 1 }] });
  assert.equal(stale.length, 1, stale.join('\n'));
  assert.match(stale[0], /last entry differs from the offer \(renewal\); run npm run history:sync/);

  // schema: source is required, entries non-empty, path matches provider/tld
  const { source, ...noSource } = entry;
  assert.ok(source);
  assert.match(
    run({ ...base, entries: [noSource] }).join('\n'),
    /must have required property 'source'/,
  );
  assert.match(run({ ...base, entries: [] }).join('\n'), /must NOT have fewer than 1 items/);
  assert.match(run({ ...base, tld: 'com' }).join('\n'), /provider\/tld != path/);

  // layout: only history/<provider>/<tld>.json
  const flat = run(base, { 'history/stray.json': base });
  assert.match(flat.join('\n'), /expected history\/<provider>\/<tld>\.json/);
});

test('price history: a broken offer is reported on its own, its history is not an orphan', () => {
  const offer = read(OFFER);
  const broken = { ...offer, evidence: { ...offer.evidence, source_url: undefined } };
  const f = validateDir(
    dataDir({
      [PROVIDER]: read(PROVIDER),
      [OFFER]: broken,
      'history/example-registrar/de.json': historyOf(offer),
    }),
    V,
  );
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /\/evidence must have required property 'source_url'/);
});
