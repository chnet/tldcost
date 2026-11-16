#!/usr/bin/env node
// update-data-report.mjs — gate, freshness alerts and tracking-issue body for the scheduled data update
// (.github/workflows/update-data.yml). No network, no git: the workflow passes in what it saw.
//
//   node scripts/update-data-report.mjs assess --report <scrape-report.json> --scrape-exit <n>
//        --validate-exit <n> --changed-files <NUL-separated paths> [--data-dir data] [--now <ISO>]
//        --out <assessment.json>
//   node scripts/update-data-report.mjs render --assessment <assessment.json> --summary <scrape-stdout.txt>
//        [--log <scrape-stderr.txt>]
//        --date <YYYY-MM-DD> --branch <name> --pushed true|false --compare-url <url> --run-url <url>
//        --out <issue-body.md> --title-out <issue-title.txt>
//
// Gate (blocks the push): no scraper report (exit 2 or crash), a blocking violation (kind gate, or a
// kind not in NON_BLOCKING_KINDS: fail safe), scraper exit != 0 without one, validate failed, or files
// changed outside data/. Contract: scraper/src/cli.ts (exit 1 only for kind=gate).
// Not updated (do not block a push; listed at the top of the issue, because the person merging must
// see them; run red): failed provider, failed TLD, FX fetch failed, and violations whose kind is in
// NON_BLOCKING_KINDS (offer not written / delisted / price history cannot take the new state).
// Their stored files stay untouched.
// Alerts (same effect): latest ECB rate older than FX_MAX_BUSINESS_DAYS business days, scraped
// offers (evidence.method not manual) of the run's providers with fetched_at older than
// OFFER_MAX_AGE_DAYS days.
// Warnings: a TLD the adapter skipped still has a stored scraped file (manual files are left out);
// provider warnings (without the ones that only repeat a non-blocking violation); hand-entered
// offers (evidence.method manual) of any provider with fetched_at older than MANUAL_MAX_AGE_DAYS
// days, per provider (no adapter refreshes them, so only this check notices that they age; read
// from data/, no request). Stale manual offers also open the issue (assessment.staleManual), but
// keep the run green.
// Plausibility (never blocks, does not turn the run red): offers whose yearly gross price is far from
// the TLD median of the other providers (scraper report `plausibility`, core plausibilityHits); listed
// for a human check, and the issue is created for them even without other changes.
// Scraped text only ever goes into fenced code blocks of the issue (no mentions, no markdown).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const FX_MAX_BUSINESS_DAYS = 3; // ECB publishes on business days
export const OFFER_MAX_AGE_DAYS = 7; // concept: alert when the data is older than 7 days
export const MANUAL_MAX_AGE_DAYS = 30; // manual offers: re-checked by hand, warning only (Archiv-Issue 75)
/** Violation kinds that leave the stored file untouched and do not block the rest of the update. */
export const NON_BLOCKING_KINDS = ['blocked', 'promo-required', 'delisted', 'history'];
const MAX_BODY = 60000; // GitHub limit is 65536 characters per issue body
/** Per-section caps of scraped text; their sum stays well below MAX_BODY (headings, links, fences). */
export const CAPS = {
  failures: 7000,
  reasons: 5000,
  log: 6000,
  priceChanges: 8000,
  alerts: 5000,
  warnings: 5000,
  plausibility: 3000,
  summary: 12000,
  files: 4000,
};
const DAY_MS = 86400000;

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const utcDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Mon–Fri days after `fromDate` (YYYY-MM-DD) up to and including the UTC day of `now`. */
export function businessDaysSince(fromDate, now) {
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  let count = 0;
  for (let t = start + DAY_MS; t <= utcDay(now); t += DAY_MS) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) count += 1;
  }
  return count;
}

/** Latest data/fx/<YYYY-MM-DD>.json date, or undefined. */
export function latestFxDate(dataDir) {
  const dir = join(dataDir, 'fx');
  if (!existsSync(dir)) return undefined;
  const dates = readdirSync(dir)
    .map((f) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .sort();
  return dates.at(-1);
}

/**
 * Scraped offers of the given providers whose evidence.fetched_at is missing or older than maxAgeDays.
 * Manual offers (evidence.method manual) are left to staleManualOffers.
 */
export function staleOffers(dataDir, providers, now, maxAgeDays = OFFER_MAX_AGE_DAYS) {
  const stale = [];
  for (const provider of providers) {
    const dir = join(dataDir, 'offers', provider);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      const tld = file.slice(0, -'.json'.length);
      let evidence;
      try {
        evidence = readJson(join(dir, file))?.evidence;
      } catch {
        evidence = undefined;
      }
      if (evidence?.method === 'manual') continue;
      const fetchedAt = evidence?.fetched_at;
      const t = typeof fetchedAt === 'string' ? Date.parse(fetchedAt) : NaN;
      const ageDays = Number.isNaN(t) ? undefined : Math.floor((now.getTime() - t) / DAY_MS);
      if (ageDays === undefined || ageDays > maxAgeDays)
        stale.push({ provider, tld, fetchedAt, ageDays });
    }
  }
  return stale;
}

/**
 * Per provider (sorted, all providers): offers with evidence.method "manual" whose fetched_at is
 * missing or older than maxAgeDays. count = such offers, oldest = the oldest valid fetched_at
 * (YYYY-MM-DD) with its age in days, undefined when none of them has one. Unreadable files are left
 * to validate-data.
 */
export function staleManualOffers(dataDir, now, maxAgeDays = MANUAL_MAX_AGE_DAYS) {
  const root = join(dataDir, 'offers');
  if (!existsSync(root)) return [];
  const out = [];
  const providers = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const provider of providers) {
    const dir = join(root, provider);
    let stale = 0;
    let oldest;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      let evidence;
      try {
        evidence = readJson(join(dir, file))?.evidence;
      } catch {
        continue;
      }
      if (evidence?.method !== 'manual') continue;
      const t =
        typeof evidence.fetched_at === 'string' ? Date.parse(evidence.fetched_at) : Number.NaN;
      const known = !Number.isNaN(t);
      if (known && Math.floor((now.getTime() - t) / DAY_MS) <= maxAgeDays) continue;
      stale += 1;
      if (known && (oldest === undefined || t < oldest)) oldest = t;
    }
    if (stale > 0)
      out.push({
        provider,
        count: stale,
        oldest: oldest === undefined ? undefined : new Date(oldest).toISOString().slice(0, 10),
        ageDays: oldest === undefined ? undefined : Math.floor((now.getTime() - oldest) / DAY_MS),
      });
  }
  return out;
}

/**
 * Skipped TLDs that still have a stored scraped offer file (they age silently). A file with
 * evidence.method manual is left out: it is maintained by hand on purpose (e.g. a TLD the adapter
 * skips) and has its own check, staleManualOffers. An unreadable file is still reported.
 */
export function skippedWithFile(report, dataDir) {
  const out = [];
  for (const p of report?.providers ?? []) {
    for (const s of p.skipped ?? []) {
      const file = join(dataDir, 'offers', p.id, `${s.tld}.json`);
      if (!existsSync(file)) continue;
      let method;
      try {
        method = readJson(file)?.evidence?.method;
      } catch {
        method = undefined;
      }
      if (method !== 'manual') out.push({ provider: p.id, tld: s.tld, reason: s.reason });
    }
  }
  return out;
}

const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const factor = (x) => x.toFixed(2).replace('.', ',');

/** Plausibility hits of the scraper report as German lines (gross EUR per year). */
export function plausibilityItems(report) {
  const p = report?.plausibility;
  if (!p) return [];
  if (p.error) return [`Plausibilitätsprüfung nicht gelaufen: ${p.error}`];
  return (p.hits ?? []).map(
    (h) =>
      `${h.provider}/.${h.tld}: ${euro(h.value)} pro Jahr brutto (${h.field}), ` +
      `Median der ${h.others} anderen Anbieter ${euro(h.median)}, Faktor ${factor(h.ratio)} ` +
      (h.direction === 'below'
        ? `(unter ${factor(p.low)}: Jahrespreis als Monatspreis erfasst?)`
        : `(über ${factor(p.high)}: Monatspreis als Jahrespreis erfasst?)`),
  );
}

export const blockingViolations = (report) =>
  (report?.violations ?? []).filter((v) => !NON_BLOCKING_KINDS.includes(v.kind));

/** Gate reasons from the scraper report and exit code (empty = gate passed). */
export function gateReasons({ report, scrapeExit, validateExit, changedFiles }) {
  const reasons = [];
  if (!report) {
    reasons.push(`Scraper hat keinen Report geschrieben (Exit ${scrapeExit}).`);
  } else {
    const blocking = blockingViolations(report);
    for (const v of blocking) reasons.push(`Gate ${v.provider}/.${v.tld}: ${v.reason}`);
    if (scrapeExit !== 0 && blocking.length === 0)
      reasons.push(`Scraper beendet mit Exit ${scrapeExit} ohne Gate-Verstoß im Report.`);
  }
  if (validateExit !== 0) reasons.push(`npm run validate fehlgeschlagen (Exit ${validateExit}).`);
  const outside = changedFiles.filter((f) => !f.startsWith('data/'));
  if (outside.length) reasons.push(`Änderungen außerhalb von data/: ${outside.join(', ')}`);
  return reasons;
}

const nonBlocking = (report) =>
  (report?.violations ?? []).filter((v) => NON_BLOCKING_KINDS.includes(v.kind));

/** Parts of the run that were not updated; their stored files stay as they are. */
export function notUpdated(report) {
  const out = [];
  for (const p of report?.providers ?? []) {
    if (p.status === 'failed') out.push(`Provider ${p.id} fehlgeschlagen: ${p.error ?? '?'}`);
    for (const f of p.failed ?? []) out.push(`${p.id}/.${f.tld} fehlgeschlagen: ${f.reason}`);
  }
  if (report?.fx?.status === 'failed')
    out.push(`EZB-Kurse nicht abgerufen: ${report.fx.error ?? '?'}`);
  for (const v of nonBlocking(report))
    out.push(`${v.provider}/.${v.tld} nicht übernommen (${v.kind}): ${v.reason}`);
  return out;
}

/**
 * Provider warnings without those for a provider + TLD that already has a non-blocking violation
 * (the scraper reports blocked / promo-required / delisted both ways). Warnings are free text; the TLD is
 * taken from their ".<tld>:" prefix, the match itself is on provider + TLD, not on the wording.
 */
export function providerWarnings(report) {
  const repeated = new Set(nonBlocking(report).map((v) => `${v.provider}\t${v.tld}`));
  return (report?.providers ?? []).flatMap((p) =>
    (p.warnings ?? [])
      .filter((w) => {
        const tld = /^\.([a-z0-9-]+):/i.exec(w)?.[1]?.toLowerCase();
        return !(tld && repeated.has(`${p.id}\t${tld}`));
      })
      .map((w) => `${p.id}: ${w}`),
  );
}

export function assess({ report, scrapeExit, validateExit, changedFiles, dataDir, now }) {
  const reasons = gateReasons({ report, scrapeExit, validateExit, changedFiles });
  const failures = notUpdated(report);
  const alerts = [];
  // A dry run writes nothing, so also count the ECB date the scraper just fetched (added/unchanged).
  const fetchedFx = report?.fx && report.fx.status !== 'failed' ? report.fx.date : undefined;
  const fxDate = [latestFxDate(dataDir), fetchedFx].filter(Boolean).sort().at(-1);
  if (!fxDate) {
    alerts.push('Keine EZB-Kurse unter data/fx/.');
  } else {
    const age = businessDaysSince(fxDate, now);
    if (age > FX_MAX_BUSINESS_DAYS)
      alerts.push(
        `EZB-Kurs veraltet: neuester Stand ${fxDate}, ${age} Werktage alt (Grenze ${FX_MAX_BUSINESS_DAYS}).`,
      );
  }
  const covered = (report?.providers ?? [])
    .filter((p) => p.status !== 'no-provider-file')
    .map((p) => p.id);
  for (const s of staleOffers(dataDir, covered, now))
    alerts.push(
      `Angebot ${s.provider}/.${s.tld}: fetched_at ${s.fetchedAt ?? 'fehlt'}` +
        (s.ageDays === undefined ? '' : `, ${s.ageDays} Tage alt (Grenze ${OFFER_MAX_AGE_DAYS})`),
    );
  const staleManual = staleManualOffers(dataDir, now);
  const warnings = [
    ...skippedWithFile(report, dataDir).map(
      (s) =>
        `${s.provider}/.${s.tld} übersprungen (${s.reason}), gespeicherte Datei wird nicht aktualisiert.`,
    ),
    ...providerWarnings(report),
    // split by method: scraped offers get the OFFER_MAX_AGE_DAYS alert above, manual ones this warning
    ...staleManual.map(
      (m) =>
        `Manuell erfasste Angebote ${m.provider}: ${count(m.count, 'TLD', 'TLDs')} mit fetched_at ` +
        `älter als ${MANUAL_MAX_AGE_DAYS} Tage oder ohne, ältestes ` +
        (m.oldest === undefined ? 'unbekannt' : `${m.oldest} (${m.ageDays} Tage)`) +
        '. Bitte von Hand gegen die Quelle neu prüfen.',
    ),
  ];
  const dataFiles = changedFiles.filter((f) => f.startsWith('data/'));
  const fmt = (v) => JSON.stringify(v);
  const priceChanges = (report?.changes ?? [])
    .filter((c) => c.kind !== 'refreshed')
    .map((c) =>
      [
        `${c.kind === 'added' ? '+' : '~'} ${c.provider}/.${c.tld}${c.kind === 'added' ? ' (neu)' : ''}`,
        ...(c.fields ?? []).map((f) => `    ${f.path}: ${fmt(f.from)} -> ${fmt(f.to)}`),
      ].join('\n'),
    );
  return {
    gateFailed: reasons.length > 0,
    reasons,
    failures,
    alerts,
    warnings,
    plausibility: plausibilityItems(report),
    // for the "Update bereit" line and the section heading (the items above also carry the error)
    plausibilityHits: report?.plausibility?.error ? 0 : (report?.plausibility?.hits ?? []).length,
    plausibilityFailed: Boolean(report?.plausibility?.error),
    // providers with stale manual offers: opens the issue, not red (the lines are in warnings)
    staleManual: staleManual.length,
    changedFiles: dataFiles,
    hasChanges: dataFiles.length > 0,
    priceChanges,
    changes: priceChanges.length,
    refreshed: (report?.changes ?? []).filter((c) => c.kind === 'refreshed').length,
  };
}

/** Fenced code block that the content cannot break out of. */
export function fence(text) {
  const longest = Math.max(2, ...[...String(text).matchAll(/~+/g)].map((m) => m[0].length));
  const f = '~'.repeat(longest + 1);
  return `${f}text\n${String(text).trimEnd()}\n${f}`;
}

/** Cut long scraped text before fencing, so the issue body stays under the limit and fences stay closed. */
export const cap = (text, max) =>
  text.length > max ? `${text.slice(0, max)}\n… (gekürzt, vollständig im Workflow-Lauf)` : text;

/** "1 Angebot", "2 Angebote". */
export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const list = (items, max) => fence(cap(items.map((i) => `- ${i}`).join('\n'), max));

/** Plausibility note for the "Update bereit" line ('' when there is nothing to check). */
export function plausibilityNote(a) {
  if (a.plausibilityFailed) return ' Plausibilitätsprüfung nicht gelaufen (siehe unten).';
  const n = a.plausibilityHits ?? 0;
  return n
    ? ` Plausibilität: **${count(n, 'Treffer', 'Treffer')}** zur Prüfung (siehe unten).`
    : '';
}

/** Issue title: the date first (the workflow finds the day's issue by that prefix), then the verdict. */
export function issueTitle({ assessment: a, date, pushed }) {
  const prefix = `Datenupdate ${date}`;
  if (a.gateFailed) return `${prefix}: Gate fehlgeschlagen, nichts gepusht`;
  if (pushed && a.changes === 0) return `${prefix}: nur Stand aktualisiert, keine Preisänderung`;
  if (pushed) return `${prefix}: ${count(a.changes, 'Angebot', 'Angebote')} geändert oder neu`;
  return `${prefix}: keine Datenänderung`;
}

export function renderIssue({
  assessment: a,
  summary,
  log,
  date,
  branch,
  pushed,
  compareUrl,
  runUrl,
}) {
  const parts = [`Automatischer Datenlauf ${date} ([Workflow-Lauf](${runUrl})).`, ''];
  const failures = a.failures ?? [];
  if (failures.length) {
    parts.push(
      `## ⚠️ Nicht aktualisiert (${failures.length})`,
      '',
      a.gateFailed
        ? 'Diese Teile wurden in diesem Lauf nicht erhoben; ihre gespeicherten Dateien sind unverändert.'
        : '**Vor dem Merge beachten:** Diese Teile sind im Update **nicht** enthalten; ihre gespeicherten Dateien bleiben unverändert und altern weiter.',
      '',
      list(failures, CAPS.failures),
      '',
    );
  }
  if (a.gateFailed) {
    parts.push(
      '## Gate fehlgeschlagen',
      '',
      'Es wurde **nichts gepusht** und es soll **kein PR** geöffnet werden. Gründe:',
      '',
      list(a.reasons, CAPS.reasons),
      '',
    );
    if (log?.trim()) {
      const tail = log.trimEnd().split('\n').slice(-60).join('\n');
      parts.push('Scraper-Log (letzte 60 Zeilen):', '', fence(cap(tail, CAPS.log)), '');
    }
  } else if (pushed) {
    const priceChanges = a.priceChanges ?? [];
    parts.push(
      '## Update bereit',
      '',
      (priceChanges.length
        ? `Branch \`${branch}\`: **${count(priceChanges.length, 'Angebot', 'Angebote')} geändert oder neu**, ${a.refreshed} nur Stand aktualisiert (fetched_at), ${count(a.changedFiles.length, 'Datei', 'Dateien')}.`
        : `Branch \`${branch}\`: **nur Stand aktualisiert, keine Preisänderung** (${count(a.refreshed, 'Angebot', 'Angebote')} mit neuem fetched_at, ${count(a.changedFiles.length, 'Datei', 'Dateien')}).`) +
        plausibilityNote(a),
      '',
      `**PR öffnen:** [Vergleich main…${branch}](${compareUrl}) → „Create pull request“. CI läuft normal; Merge nach Review.`,
      '',
      '## Preisänderungen',
      '',
      priceChanges.length ? fence(cap(priceChanges.join('\n'), CAPS.priceChanges)) : '_keine_',
      '',
    );
  } else {
    parts.push('## Keine Datenänderung', '', 'Gate bestanden, nichts zu pushen.', '');
  }
  if (a.alerts.length) parts.push('## Alarme', '', list(a.alerts, CAPS.alerts), '');
  if (a.warnings.length) parts.push('## Warnungen', '', list(a.warnings, CAPS.warnings), '');
  const plausibility = a.plausibility ?? [];
  if (plausibility.length)
    parts.push(
      a.plausibilityFailed
        ? '## Plausibilität: Prüfung nicht gelaufen'
        : `## Plausibilität: ${count(plausibility.length, 'Angebot', 'Angebote')} zur Prüfung`,
      '',
      'Jahrespreis brutto weit weg vom Median der anderen Anbieter derselben TLD. Blockiert nichts; bitte vor dem Merge gegen die Quelle prüfen (Einheit Monat/Jahr, Laufzeit, Netto/Brutto, Währung).',
      '',
      list(plausibility, CAPS.plausibility),
      '',
    );
  if (summary?.trim())
    parts.push('## Scraper-Zusammenfassung', '', fence(cap(summary, CAPS.summary)), '');
  if (a.changedFiles.length)
    parts.push(
      '<details><summary>Geänderte Dateien</summary>',
      '',
      fence(cap(a.changedFiles.join('\n'), CAPS.files)),
      '',
      '</details>',
      '',
    );
  const body = parts.join('\n');
  // the caps above keep a normal body far below this; last resort without markdown structure
  return body.length > MAX_BODY ? fence(cap(body, MAX_BODY - 200)) : body;
}

export function main(argv) {
  const [cmd, ...rest] = argv;
  const { values: o } = parseArgs({
    args: rest,
    options: {
      report: { type: 'string' },
      'scrape-exit': { type: 'string' },
      'validate-exit': { type: 'string' },
      'changed-files': { type: 'string' },
      'data-dir': { type: 'string', default: 'data' },
      now: { type: 'string' },
      assessment: { type: 'string' },
      summary: { type: 'string' },
      log: { type: 'string' },
      date: { type: 'string' },
      branch: { type: 'string' },
      pushed: { type: 'string' },
      'compare-url': { type: 'string' },
      'run-url': { type: 'string' },
      out: { type: 'string' },
      'title-out': { type: 'string' },
    },
    strict: true,
  });
  if (!o.out) throw new Error('--out is required');
  if (cmd === 'assess') {
    let report;
    try {
      report = o.report && existsSync(o.report) ? readJson(o.report) : undefined;
    } catch {
      report = undefined;
    }
    const changedFiles = o['changed-files']
      ? readFileSync(o['changed-files'], 'utf8').split('\0').filter(Boolean)
      : [];
    const result = assess({
      report,
      scrapeExit: Number(o['scrape-exit']),
      validateExit: Number(o['validate-exit']),
      changedFiles,
      dataDir: o['data-dir'],
      now: o.now ? new Date(o.now) : new Date(),
    });
    writeFileSync(o.out, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  if (cmd === 'render') {
    const assessment = readJson(o.assessment);
    if (o['title-out'])
      writeFileSync(
        o['title-out'],
        issueTitle({ assessment, date: o.date, pushed: o.pushed === 'true' }),
      );
    const body = renderIssue({
      assessment,
      summary: o.summary && existsSync(o.summary) ? readFileSync(o.summary, 'utf8') : '',
      log: o.log && existsSync(o.log) ? readFileSync(o.log, 'utf8') : '',
      date: o.date,
      branch: o.branch,
      pushed: o.pushed === 'true',
      compareUrl: o['compare-url'],
      runUrl: o['run-url'],
    });
    writeFileSync(o.out, body);
    return body;
  }
  throw new Error(`unknown command ${cmd ?? '(none)'}; use assess or render`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const result = main(process.argv.slice(2));
    if (process.argv[2] === 'assess') {
      const { gateFailed, hasChanges, failures, alerts, plausibility, staleManual } = result;
      // same numbers the workflow reads from assessment.json (red run = failures + alerts)
      console.log(
        JSON.stringify({
          gateFailed,
          hasChanges,
          failures: failures.length,
          alerts: alerts.length,
          plausibility: plausibility.length,
          staleManual,
        }),
      );
    }
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
