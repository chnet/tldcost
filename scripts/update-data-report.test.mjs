// update-data-report.test.mjs — gate, freshness alerts and issue body of the scheduled data update.
// Throw-away data dirs, no network, no git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assess,
  businessDaysSince,
  count,
  fence,
  gateReasons,
  latestFxDate,
  CAPS,
  MANUAL_MAX_AGE_DAYS,
  issueTitle,
  main,
  plausibilityItems,
  plausibilityNote,
  providerWarnings,
  renderIssue,
  skippedWithFile,
  staleManualOffers,
  staleOffers,
} from './update-data-report.mjs';

const NOW = new Date('2026-11-16T06:30:00Z'); // Monday

function dataDir({ fx = ['2026-11-12', '2026-11-13'], offers = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tldcost-update-'));
  mkdirSync(join(dir, 'fx'), { recursive: true });
  for (const d of fx) writeFileSync(join(dir, 'fx', `${d}.json`), '{}\n');
  for (const [key, fetchedAt] of Object.entries(offers)) {
    const [provider, tld] = key.split('/');
    mkdirSync(join(dir, 'offers', provider), { recursive: true });
    // a string is fetched_at, null leaves it out, an object is the whole evidence
    const evidence =
      fetchedAt === null
        ? {}
        : typeof fetchedAt === 'object'
          ? fetchedAt
          : { fetched_at: fetchedAt };
    writeFileSync(join(dir, 'offers', provider, `${tld}.json`), JSON.stringify({ evidence }));
  }
  return dir;
}

const okReport = (extra = {}) => ({
  providers: [
    { id: 'inwx', status: 'ok', skipped: [], failed: [], warnings: [] },
    { id: 'strato', status: 'no-provider-file', skipped: [], failed: [], warnings: [] },
  ],
  changes: [
    { provider: 'inwx', tld: 'de', kind: 'changed', fields: [] },
    { provider: 'inwx', tld: 'com', kind: 'refreshed', fields: [] },
  ],
  violations: [],
  fx: { status: 'unchanged', date: '2026-11-13' },
  written: [],
  ...extra,
});

test('businessDaysSince counts Mon–Fri after the date up to today', () => {
  assert.equal(businessDaysSince('2026-11-13', NOW), 1); // Fri -> Mon
  assert.equal(businessDaysSince('2026-11-16', NOW), 0);
  assert.equal(businessDaysSince('2026-11-10', NOW), 4); // Tue -> Wed, Thu, Fri, Mon
});

test('latestFxDate picks the newest date file and ignores other names', () => {
  const dir = dataDir({ fx: ['2026-11-12', '2026-11-13'] });
  writeFileSync(join(dir, 'fx', 'README.json'), '{}');
  assert.equal(latestFxDate(dir), '2026-11-13');
  assert.equal(latestFxDate(join(dir, 'missing')), undefined);
});

test('staleOffers: scraped offers of the given providers, older than 7 days or without fetched_at', () => {
  const dir = dataDir({
    offers: {
      'inwx/de': '2026-11-13T06:00:00Z',
      'inwx/com': '2026-11-08T06:00:00Z', // 8 days
      'inwx/net': null,
      'inwx/ai': { method: 'manual', fetched_at: '2026-01-01T00:00:00Z' }, // manual: other check
      'chnet-domains/app': '2026-01-01T00:00:00Z', // provider not covered by the run
    },
  });
  const stale = staleOffers(dir, ['inwx'], NOW);
  assert.deepEqual(
    stale.map((s) => `${s.tld}:${s.ageDays}`),
    ['com:8', 'net:undefined'],
  );
});

const manual = (fetchedAt) => ({ method: 'manual', fetched_at: fetchedAt });

test('staleManualOffers: manual offers older than 30 days or without fetched_at, per provider', () => {
  assert.equal(MANUAL_MAX_AGE_DAYS, 30);
  const dir = dataDir({
    offers: {
      'ionos/de': manual('2026-10-07T06:00:00Z'), // 40 days
      'ionos/com': manual('2026-10-16T06:00:00Z'), // 31 days
      'ionos/net': manual('2026-10-17T06:00:00Z'), // 30 days: not yet
      'ionos/org': manual('2026-11-06T06:00:00Z'), // 10 days
      'ionos/eu': { method: 'manual' }, // no fetched_at
      'inwx/de': { method: 'scrape', fetched_at: '2026-01-01T00:00:00Z' }, // scraped: other check
      'aws-route53/com': { method: 'manual' }, // only offers without fetched_at
      'strato/de': manual('2026-01-01T00:00:00Z'), // adapter provider: manual offers count too
      'strato/com': { method: 'scrape', fetched_at: '2026-01-01T00:00:00Z' },
    },
  });
  writeFileSync(join(dir, 'offers', 'ionos', 'broken.json'), '{'); // left to validate-data
  writeFileSync(join(dir, 'offers', 'ionos', 'README.md'), 'not an offer');
  assert.deepEqual(staleManualOffers(dir, NOW), [
    { provider: 'aws-route53', count: 1, oldest: undefined, ageDays: undefined },
    { provider: 'ionos', count: 3, oldest: '2026-10-07', ageDays: 40 },
    { provider: 'strato', count: 1, oldest: '2026-01-01', ageDays: 319 },
  ]);
  assert.deepEqual(staleManualOffers(dir, NOW, 45), [
    { provider: 'aws-route53', count: 1, oldest: undefined, ageDays: undefined },
    { provider: 'ionos', count: 1, oldest: undefined, ageDays: undefined },
    { provider: 'strato', count: 1, oldest: '2026-01-01', ageDays: 319 },
  ]);
  assert.deepEqual(staleManualOffers(join(dir, 'missing'), NOW), []);
});

test('assess: stale manual offers are warnings (issue, not red), also for an adapter provider', () => {
  const dir = dataDir({
    offers: {
      'inwx/de': '2026-11-13T06:00:00Z',
      'ionos/de': manual('2026-10-07T06:00:00Z'),
      'ionos/com': manual('2026-10-16T06:00:00Z'),
      'inwx/com': manual('2026-10-01T06:00:00Z'), // manual offer of a provider that ran
      'inwx/net': '2026-10-01T06:00:00Z', // scraped and stale: the 7-day alert
    },
  });
  const a = assess({
    report: okReport(),
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: ['data/offers/inwx/de.json'],
    dataDir: dir,
    now: NOW,
  });
  assert.equal(a.gateFailed, false);
  // split by method: the scraped inwx/net is the alert, the manual inwx/com only the warning
  assert.deepEqual(a.alerts, [
    'Angebot inwx/.net: fetched_at 2026-10-01T06:00:00Z, 46 Tage alt (Grenze 7)',
  ]);
  assert.deepEqual(a.warnings, [
    'Manuell erfasste Angebote inwx: 1 TLD mit fetched_at älter als 30 Tage oder ohne, ältestes 2026-10-01 (46 Tage). Bitte von Hand gegen die Quelle neu prüfen.',
    'Manuell erfasste Angebote ionos: 2 TLDs mit fetched_at älter als 30 Tage oder ohne, ältestes 2026-10-07 (40 Tage). Bitte von Hand gegen die Quelle neu prüfen.',
  ]);
  assert.equal(a.staleManual, 2); // opens the issue (workflow), not counted as alert
  const none = dataDir({ offers: { 'route/com': { method: 'manual' } } });
  const b = assess({
    report: okReport(),
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: [],
    dataDir: none,
    now: NOW,
  });
  assert.match(b.warnings[0], /route: 1 TLD mit fetched_at .* ältestes unbekannt\./);
  assert.equal(b.alerts.length, 0);
  assert.equal(b.staleManual, 1);
  assert.match(
    renderIssue({
      assessment: a,
      summary: '',
      log: '',
      date: '2026-11-16',
      branch: 'b',
      pushed: false,
      compareUrl: 'c',
      runUrl: 'r',
    }),
    /## Warnungen[\s\S]*Manuell erfasste Angebote ionos/,
  );
});

test('skippedWithFile reports only skipped TLDs that have a stored scraped file', () => {
  const dir = dataDir({
    offers: {
      'inwx/de': '2026-11-13T06:00:00Z',
      // entered by hand for a TLD the adapter skips: covered by staleManualOffers instead
      'inwx/ai': { method: 'manual', fetched_at: '2026-11-13T06:00:00Z' },
    },
  });
  writeFileSync(join(dir, 'offers', 'inwx', 'me.json'), '{'); // unreadable: still reported
  const report = okReport({
    providers: [
      {
        id: 'inwx',
        status: 'ok',
        skipped: [
          { tld: 'de', reason: 'createPeriod 2' },
          { tld: 'io', reason: 'createPeriod 2' },
          { tld: 'ai', reason: 'createPeriod 2' },
          { tld: 'me', reason: 'createPeriod 2' },
        ],
        failed: [],
        warnings: [],
      },
    ],
  });
  assert.deepEqual(skippedWithFile(report, dir), [
    { provider: 'inwx', tld: 'de', reason: 'createPeriod 2' },
    { provider: 'inwx', tld: 'me', reason: 'createPeriod 2' },
  ]);
});

test('gate passes for a clean run with data-only changes', () => {
  assert.deepEqual(
    gateReasons({
      report: okReport(),
      scrapeExit: 0,
      validateExit: 0,
      changedFiles: ['data/offers/inwx/de.json'],
    }),
    [],
  );
});

test('gate fails: missing report (crash/usage), validate, files outside data/', () => {
  const r = gateReasons({
    report: undefined,
    scrapeExit: 1,
    validateExit: 1,
    changedFiles: ['data/x.json', 'scraper/report.json'],
  });
  assert.equal(r.length, 3);
  assert.match(r[0], /keinen Report.*Exit 1/);
  assert.match(r[1], /validate/);
  assert.match(r[2], /außerhalb von data\/: scraper\/report\.json/);
});

test('gate fails only on blocking violations: kind gate or unknown/missing kind', () => {
  const report = okReport({
    violations: [
      { provider: 'porkbun', tld: 'com', kind: 'gate', reason: 'renewal +50 %' },
      { provider: 'porkbun', tld: 'net', reason: 'no kind' },
      { provider: 'porkbun', tld: 'org', kind: 'something-new', reason: 'unknown kind' },
      { provider: 'porkbun', tld: 'co', kind: 'promo-required', reason: 'sale < renewal' },
    ],
  });
  const r = gateReasons({ report, scrapeExit: 1, validateExit: 0, changedFiles: [] });
  assert.deepEqual(r, [
    'Gate porkbun/.com: renewal +50 %',
    'Gate porkbun/.net: no kind',
    'Gate porkbun/.org: unknown kind',
  ]);
});

const failureCases = [
  {
    name: 'failed provider',
    extra: {
      providers: [
        { id: 'inwx', status: 'failed', error: 'HTTP 503', skipped: [], failed: [], warnings: [] },
      ],
    },
    expected: 'Provider inwx fehlgeschlagen: HTTP 503',
  },
  {
    name: 'failed TLD',
    extra: {
      providers: [
        {
          id: 'netcup',
          status: 'ok',
          skipped: [],
          failed: [{ tld: 'de', reason: 'parse' }],
          warnings: [],
        },
      ],
    },
    expected: 'netcup/.de fehlgeschlagen: parse',
  },
  {
    name: 'FX failure',
    extra: { fx: { status: 'failed', error: 'timeout' } },
    expected: 'EZB-Kurse nicht abgerufen: timeout',
  },
];
for (const c of failureCases) {
  test(`${c.name}: exit 0 (scraper contract), no gate, listed as not updated, counts for the red run`, () => {
    const a = assess({
      report: okReport(c.extra),
      scrapeExit: 0,
      validateExit: 0,
      changedFiles: ['data/offers/porkbun/com.json'],
      dataDir: dataDir({ offers: { 'porkbun/com': '2026-11-15T06:00:00Z' } }),
      now: NOW,
    });
    assert.equal(a.gateFailed, false);
    assert.deepEqual(a.failures, [c.expected]);
    assert.ok(a.failures.length + a.alerts.length > 0); // workflow: alerts = failures + alerts
  });
}

test('non-blocking violation kinds are listed as not updated, the gate passes', () => {
  const dir = dataDir({ offers: { 'inwx/de': '2026-11-15T06:00:00Z' } });
  const report = okReport({
    violations: [
      { provider: 'porkbun', tld: 'co', kind: 'promo-required', reason: 'sale < renewal' },
      { provider: 'inwx', tld: 'xyz', kind: 'delisted', reason: 'no longer listed' },
      { provider: 'inwx', tld: 'io', kind: 'blocked', reason: 'sanity' },
      { provider: 'inwx', tld: 'ai', kind: 'history', reason: 'currency changed' },
    ],
  });
  const a = assess({
    report,
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: ['data/offers/inwx/de.json'],
    dataDir: dir,
    now: NOW,
  });
  assert.equal(a.gateFailed, false);
  assert.equal(a.failures.length, 4);
  assert.match(a.failures[0], /porkbun\/\.co nicht übernommen \(promo-required\)/);
  // a price history that cannot take the new state: that offer is skipped, the run goes on
  assert.match(a.failures[3], /inwx\/\.ai nicht übernommen \(history\): currency changed/);
  assert.deepEqual(a.alerts, []);
});

test('provider warnings that only repeat a non-blocking violation are dropped', () => {
  const report = okReport({
    providers: [
      {
        id: 'porkbun',
        status: 'ok',
        skipped: [],
        failed: [],
        warnings: ['.co: sale < renewal, offer not written', 'fallback price page used'],
      },
      {
        id: 'inwx',
        status: 'ok',
        skipped: [],
        failed: [],
        warnings: ['.de: offer no longer listed by the provider (file kept)', '.co: other note'],
      },
    ],
    violations: [
      { provider: 'porkbun', tld: 'co', kind: 'promo-required', reason: 'sale < renewal' },
      { provider: 'inwx', tld: 'de', kind: 'delisted', reason: 'offer no longer listed' },
    ],
  });
  assert.deepEqual(providerWarnings(report), [
    'porkbun: fallback price page used',
    'inwx: .co: other note',
  ]);
});

test('exit 1 without a blocking violation is still a gate failure', () => {
  const r = gateReasons({ report: okReport(), scrapeExit: 1, validateExit: 0, changedFiles: [] });
  assert.deepEqual(r, ['Scraper beendet mit Exit 1 ohne Gate-Verstoß im Report.']);
});

test('assess: stale FX and stale offers are alerts, not gate reasons', () => {
  const dir = dataDir({
    fx: ['2026-11-10'],
    offers: { 'inwx/de': '2026-11-01T00:00:00Z', 'strato/de': '2026-01-01T00:00:00Z' },
  });
  const a = assess({
    report: okReport({ fx: undefined }), // only data/fx/ counts here
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: ['data/offers/inwx/de.json'],
    dataDir: dir,
    now: NOW,
  });
  assert.equal(a.gateFailed, false);
  assert.equal(a.hasChanges, true);
  assert.equal(a.changes, 1);
  assert.equal(a.refreshed, 1);
  assert.equal(a.alerts.length, 2); // FX 4 business days; inwx/de 15 days. strato is not covered.
  assert.match(a.alerts[0], /EZB-Kurs veraltet: neuester Stand 2026-11-10, 4 Werktage/);
  assert.match(a.alerts[1], /inwx\/\.de/);
});

test('assess: a dry run counts the ECB date the scraper fetched, not only data/fx/', () => {
  const run = (fx) =>
    assess({
      report: okReport({ fx }),
      scrapeExit: 0,
      validateExit: 0,
      changedFiles: [],
      dataDir: dataDir({ fx: [] }),
      now: NOW,
    }).alerts;
  assert.deepEqual(run({ status: 'added', date: '2026-11-13' }), []);
  assert.deepEqual(run({ status: 'unchanged', date: '2026-11-13' }), []);
  assert.deepEqual(run({ status: 'failed', error: 'timeout' }), [
    'Keine EZB-Kurse unter data/fx/.',
  ]);
  assert.match(
    run({ status: 'added', date: '2026-11-09' })[0],
    /EZB-Kurs veraltet: neuester Stand 2026-11-09/,
  );
});

test('count: singular for exactly one', () => {
  assert.equal(count(1, 'Angebot', 'Angebote'), '1 Angebot');
  assert.equal(count(0, 'Datei', 'Dateien'), '0 Dateien');
  assert.equal(count(2, 'Datei', 'Dateien'), '2 Dateien');
});

test('assess: no FX data at all is an alert', () => {
  const a = assess({
    report: okReport({ fx: undefined }), // only data/fx/ counts here
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: [],
    dataDir: dataDir({ fx: [] }),
    now: NOW,
  });
  assert.deepEqual(a.alerts, ['Keine EZB-Kurse unter data/fx/.']);
  assert.equal(a.hasChanges, false);
});

test('fence cannot be closed by the content', () => {
  const f = fence('a\n~~~\n@someone [x](http://evil.example)');
  const marker = f.split('\n')[0].replace('text', '');
  assert.ok(marker.length > 3);
  assert.equal(f.split('\n').filter((l) => l === marker).length, 1);
});

const base = {
  date: '2026-11-16',
  branch: 'data/update-2026-11-16',
  compareUrl: 'https://github.com/chnet/tldcost/compare/main...data/update-2026-11-16?expand=1',
  runUrl: 'https://github.com/chnet/tldcost/actions/runs/1',
};
const assessment = (extra) => ({
  gateFailed: false,
  reasons: [],
  failures: [],
  alerts: [],
  warnings: [],
  changedFiles: [],
  hasChanges: false,
  changes: 0,
  refreshed: 0,
  ...extra,
});

test('render: gate failure says no push, no PR, with reasons and the log tail in fences', () => {
  const body = renderIssue({
    ...base,
    assessment: assessment({ gateFailed: true, reasons: ['Gate inwx/.de: @owner renewal +50 %'] }),
    summary: 'inwx: ok',
    log: Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'),
    pushed: false,
  });
  assert.match(body, /## Gate fehlgeschlagen/);
  assert.match(body, /\*\*nichts gepusht\*\*/);
  assert.doesNotMatch(body, /PR öffnen/);
  assert.match(body, /~~~text\n- Gate inwx\/\.de: @owner/);
  assert.match(body, /line 99/);
  assert.doesNotMatch(body, /line 39\n/);
});

test('render: pushed update links the compare view; alerts and warnings listed', () => {
  const body = renderIssue({
    ...base,
    assessment: assessment({
      hasChanges: true,
      changedFiles: ['data/offers/inwx/de.json'],
      changes: 1,
      priceChanges: ['~ inwx/.de'],
      refreshed: 2,
      alerts: ['EZB-Kurs veraltet'],
      warnings: ['inwx/.io übersprungen'],
    }),
    summary: '~ inwx/de',
    pushed: true,
  });
  assert.match(body, /## Update bereit/);
  assert.ok(body.includes(`(${base.compareUrl})`));
  assert.match(
    body,
    /\*\*1 Angebot geändert oder neu\*\*, 2 nur Stand aktualisiert \(fetched_at\), 1 Datei\./,
  );
  assert.match(body, /## Alarme/);
  assert.match(body, /## Warnungen/);
});

test('render: parts not updated come first, before the update section', () => {
  const body = renderIssue({
    ...base,
    assessment: assessment({
      hasChanges: true,
      changedFiles: ['data/offers/porkbun/com.json'],
      changes: 1,
      failures: ['Provider inwx fehlgeschlagen: HTTP 503'],
    }),
    summary: '',
    pushed: true,
  });
  const top = body.indexOf('Nicht aktualisiert (1)');
  assert.ok(top > 0 && top < body.indexOf('## Update bereit'));
  assert.match(body, /Vor dem Merge beachten/);
  assert.match(body, /- Provider inwx fehlgeschlagen: HTTP 503/);
});

test('render: refreshed-only update says so, price changes section empty', () => {
  const a = assessment({
    hasChanges: true,
    changedFiles: ['data/offers/inwx/de.json'],
    refreshed: 40,
  });
  const body = renderIssue({ ...base, assessment: a, summary: '', pushed: true });
  assert.match(body, /\*\*nur Stand aktualisiert, keine Preisänderung\*\*/);
  assert.match(body, /## Preisänderungen\n\n_keine_/);
  assert.equal(
    issueTitle({ assessment: a, date: base.date, pushed: true }),
    'Datenupdate 2026-11-16: nur Stand aktualisiert, keine Preisänderung',
  );
});

test('render: price changes are listed in their own section', () => {
  const dir = dataDir({ offers: { 'inwx/de': '2026-11-15T06:00:00Z' } });
  const report = okReport({
    changes: [
      {
        provider: 'inwx',
        tld: 'de',
        kind: 'changed',
        fields: [{ path: 'price.renewal', from: 111, to: 119 }],
      },
      { provider: 'netcup', tld: 'io', kind: 'added', fields: [] },
      { provider: 'inwx', tld: 'com', kind: 'refreshed', fields: [] },
    ],
  });
  const a = assess({
    report,
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: ['data/offers/inwx/de.json'],
    dataDir: dir,
    now: NOW,
  });
  assert.equal(a.changes, 2);
  const body = renderIssue({ ...base, assessment: a, summary: '', pushed: true });
  assert.match(body, /~ inwx\/\.de\n {4}price\.renewal: 111 -> 119/);
  assert.match(body, /\+ netcup\/\.io \(neu\)/);
  assert.equal(
    issueTitle({ assessment: a, date: base.date, pushed: true }),
    'Datenupdate 2026-11-16: 2 Angebote geändert oder neu',
  );
});

test('issueTitle: gate failure and no change, always prefixed with the date', () => {
  assert.equal(
    issueTitle({ assessment: assessment({ gateFailed: true }), date: base.date, pushed: false }),
    'Datenupdate 2026-11-16: Gate fehlgeschlagen, nichts gepusht',
  );
  assert.equal(
    issueTitle({ assessment: assessment(), date: base.date, pushed: false }),
    'Datenupdate 2026-11-16: keine Datenänderung',
  );
});

test('section caps add up to well below the body limit; a worst case keeps its structure', () => {
  const total = Object.values(CAPS).reduce((sum, n) => sum + n, 0);
  assert.ok(total <= 55000, `caps sum ${total}`);
  const many = (prefix) =>
    Array.from({ length: 5000 }, (_, i) => `${prefix} ${i} ${'x'.repeat(20)}`);
  const body = renderIssue({
    ...base,
    assessment: assessment({
      gateFailed: true,
      reasons: many('reason'),
      failures: many('failure'),
      alerts: many('alert'),
      warnings: many('warning'),
      changedFiles: many('data/file'),
    }),
    summary: 'y'.repeat(200000),
    log: 'z'.repeat(200000),
    pushed: false,
  });
  assert.ok(body.length < 60000, `body ${body.length}`);
  assert.ok(body.startsWith('Automatischer Datenlauf'), 'not the single-fence fallback');
  assert.match(body, /## Gate fehlgeschlagen/);
  assert.match(body, /## Alarme/);
});

test('issueTitle: one changed offer reads in the singular', () => {
  assert.equal(
    issueTitle({ assessment: assessment({ changes: 1 }), date: base.date, pushed: true }),
    'Datenupdate 2026-11-16: 1 Angebot geändert oder neu',
  );
});

test('render: no change', () => {
  const body = renderIssue({ ...base, assessment: assessment(), summary: '', pushed: false });
  assert.match(body, /## Keine Datenänderung/);
});

test('render caps a huge summary below the issue body limit', () => {
  const body = renderIssue({
    ...base,
    assessment: assessment(),
    summary: 'x'.repeat(200000),
    pushed: false,
  });
  assert.ok(body.length < 65536);
  assert.match(body, /gekürzt/);
});

test('CLI: assess then render via files', () => {
  const dir = dataDir({ offers: { 'inwx/de': '2026-11-15T06:00:00Z' } });
  const tmp = mkdtempSync(join(tmpdir(), 'tldcost-cli-'));
  writeFileSync(join(tmp, 'report.json'), JSON.stringify(okReport()));
  writeFileSync(
    join(tmp, 'changed.txt'),
    'data/offers/inwx/de.json\0data/a file\nwith newline.json\0',
  );
  const result = main([
    'assess',
    '--report',
    join(tmp, 'report.json'),
    '--scrape-exit',
    '0',
    '--validate-exit',
    '0',
    '--changed-files',
    join(tmp, 'changed.txt'),
    '--data-dir',
    dir,
    '--now',
    NOW.toISOString(),
    '--out',
    join(tmp, 'assessment.json'),
  ]);
  assert.equal(result.gateFailed, false);
  assert.equal(result.hasChanges, true);
  // NUL-separated paths are taken verbatim (a newline inside a name does not split it)
  assert.deepEqual(result.changedFiles, [
    'data/offers/inwx/de.json',
    'data/a file\nwith newline.json',
  ]);
  main([
    'render',
    '--assessment',
    join(tmp, 'assessment.json'),
    '--date',
    base.date,
    '--branch',
    base.branch,
    '--pushed',
    'true',
    '--compare-url',
    base.compareUrl,
    '--run-url',
    base.runUrl,
    '--out',
    join(tmp, 'body.md'),
  ]);
  assert.match(readFileSync(join(tmp, 'body.md'), 'utf8'), /## Update bereit/);
  // a missing report file is a gate failure, not a crash of the script
  const missing = main([
    'assess',
    '--report',
    join(tmp, 'nope.json'),
    '--scrape-exit',
    '1',
    '--validate-exit',
    '0',
    '--data-dir',
    dir,
    '--now',
    NOW.toISOString(),
    '--out',
    join(tmp, 'assessment2.json'),
  ]);
  assert.equal(missing.gateFailed, true);
  assert.throws(() => main(['bogus', '--out', join(tmp, 'x')]), /unknown command/);
});

const plausibility = {
  low: 1 / 3,
  high: 3,
  minOthers: 3,
  hits: [
    {
      provider: 'netcup',
      tld: 'de',
      field: 'price.renewal',
      value: 42,
      median: 550,
      ratio: 42 / 550,
      direction: 'below',
      others: 3,
    },
    {
      provider: 'reg',
      tld: 'io',
      field: 'price.year1_regular',
      value: 99000,
      median: 7554,
      ratio: 99000 / 7554,
      direction: 'above',
      others: 4,
    },
  ],
};

test('plausibilityItems: German lines with value, median and the likely cause', () => {
  assert.deepEqual(plausibilityItems(okReport({ plausibility })), [
    'netcup/.de: 0,42 € pro Jahr brutto (price.renewal), Median der 3 anderen Anbieter 5,50 €, Faktor 0,08 (unter 0,33: Jahrespreis als Monatspreis erfasst?)',
    'reg/.io: 990,00 € pro Jahr brutto (price.year1_regular), Median der 4 anderen Anbieter 75,54 €, Faktor 13,11 (über 3,00: Monatspreis als Jahrespreis erfasst?)',
  ]);
  assert.deepEqual(plausibilityItems(okReport()), []);
  assert.deepEqual(plausibilityItems(undefined), []);
  assert.deepEqual(
    plausibilityItems(okReport({ plausibility: { ...plausibility, hits: [] } })),
    [],
  );
  assert.deepEqual(
    plausibilityItems(okReport({ plausibility: { ...plausibility, error: 'data/x.json: bad' } })),
    ['Plausibilitätsprüfung nicht gelaufen: data/x.json: bad'],
  );
});

test('assess: plausibility hits are listed, but neither block nor count as alerts', () => {
  const dir = dataDir({ offers: { 'inwx/de': '2026-11-15T06:00:00Z' } });
  const a = assess({
    report: okReport({ plausibility }),
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: [],
    dataDir: dir,
    now: NOW,
  });
  assert.equal(a.gateFailed, false);
  assert.deepEqual(a.alerts, []);
  assert.deepEqual(a.failures, []);
  assert.equal(a.plausibility.length, 2);
  assert.equal(a.plausibilityHits, 2);
  assert.equal(a.plausibilityFailed, false);
  const failed = assess({
    report: okReport({ plausibility: { ...plausibility, error: 'data/x.json: bad' } }),
    scrapeExit: 0,
    validateExit: 0,
    changedFiles: [],
    dataDir: dir,
    now: NOW,
  });
  assert.equal(failed.plausibilityHits, 0);
  assert.equal(failed.plausibilityFailed, true);
});

test('plausibilityNote: hits or a failed check go into the "Update bereit" line', () => {
  assert.equal(plausibilityNote(assessment()), '');
  assert.equal(plausibilityNote(assessment({ plausibilityHits: 0 })), '');
  assert.equal(
    plausibilityNote(assessment({ plausibilityHits: 1 })),
    ' Plausibilität: **1 Treffer** zur Prüfung (siehe unten).',
  );
  assert.equal(
    plausibilityNote(assessment({ plausibilityFailed: true })),
    ' Plausibilitätsprüfung nicht gelaufen (siehe unten).',
  );
  const body = renderIssue({
    ...base,
    assessment: assessment({
      hasChanges: true,
      changedFiles: ['data/offers/inwx/de.json'],
      refreshed: 1,
      plausibilityHits: 2,
      plausibility: plausibilityItems(okReport({ plausibility })),
    }),
    pushed: true,
  });
  assert.match(
    body,
    /\*\*nur Stand aktualisiert, keine Preisänderung\*\* \(1 Angebot mit neuem fetched_at, 1 Datei\)\. Plausibilität: \*\*2 Treffer\*\* zur Prüfung \(siehe unten\)\./,
  );
});

test('render: plausibility section with count, hint and the lines in a fence', () => {
  const body = renderIssue({
    ...base,
    assessment: assessment({ plausibility: plausibilityItems(okReport({ plausibility })) }),
    pushed: false,
  });
  assert.match(body, /## Plausibilität: 2 Angebote zur Prüfung/);
  assert.match(body, /Blockiert nichts; bitte vor dem Merge gegen die Quelle prüfen/);
  assert.ok(body.includes('- netcup/.de: 0,42 € pro Jahr brutto'));
  const none = renderIssue({ ...base, assessment: assessment(), pushed: false });
  assert.ok(!none.includes('Plausibilität'));
  const failed = renderIssue({
    ...base,
    assessment: assessment({
      plausibilityFailed: true,
      plausibility: ['Plausibilitätsprüfung nicht gelaufen: data/x.json: bad'],
    }),
    pushed: false,
  });
  assert.match(failed, /## Plausibilität: Prüfung nicht gelaufen/);
  assert.doesNotMatch(failed, /1 Angebot zur Prüfung/);
});
