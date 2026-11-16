// Where visitors report wrong data and suggest providers. While the repository is private, GitHub
// issue links lead visitors to a 404, so the default is e-mail. Switch REPORT_VIA to 'github' when
// the repository is public: every report link of the site (row detail, "Anbieter fehlt?", the
// `tldcost:report/...` links in docs/pages) follows this one constant. Nothing about the visitor
// is prefilled, only the row (provider, TLD) and the field names of the issue forms.

/** @typedef {'mail' | 'github'} ReportVia */

/** @type {ReportVia} */
export const REPORT_VIA = 'mail';
export const REPORT_EMAIL = 'hello@chnet.solutions';
export const ISSUES_NEW = 'https://github.com/chnet/tldcost/issues/new';
/**
 * Is github.com/chnet/tldcost public? While it is private, every link into it is a 404, so the
 * site renders repo links as plain text or as a site equivalent (repoLink). Set to true when the
 * repository is public; REPORT_VIA can then switch to 'github' too.
 * @type {boolean}
 */
export const REPO_PUBLIC = false;
export const REPO_URL = 'https://github.com/chnet/tldcost';
/** Neutral note where the site would otherwise link the source code. */
export const REPO_PENDING = 'Der Quellcode wird in Kürze veröffentlicht.';

/**
 * Target for a link into the repository: `path` is relative to the repo root ('' = the repo,
 * 'blob/main/LICENSE', 'tree/main/data', ...). Public: the GitHub URL. Private: `fallback` (a page
 * of the site with the same content, e.g. '/api/v1/all.json' for the data) or null, meaning the
 * caller renders the link text as plain text.
 * @param {string} [path]
 * @param {string | null} [fallback]
 * @param {boolean} [isPublic]
 * @returns {string | null}
 */
export function repoLink(path = '', fallback = null, isPublic = REPO_PUBLIC) {
  if (isPublic) return path ? `${REPO_URL}/${path}` : REPO_URL;
  return fallback;
}

/** Shown next to GitHub links, so reporting never needs a GitHub account. */
export const NO_GITHUB_HINT = `Ohne GitHub-Konto: E-Mail an ${REPORT_EMAIL}.`;

/** RFC 6068 mailto: subject and body percent-encoded (no `+` for spaces), CRLF line breaks. */
export function mailto(/** @type {string} */ subject, /** @type {string[]} */ lines) {
  const body = lines.join('\r\n');
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * "Fehler melden". With a row (row detail): prefilled with provider and TLD. Without (text pages):
 * the empty form. Mail: subject and the fields of .github/ISSUE_TEMPLATE/preis-falsch.yml as a
 * body template. GitHub: that issue form.
 * @param {{ row: { providerId: string; tld: string }; providerName: string } | null} [target]
 * @param {ReportVia} [via]
 */
export function correctionUrl(target = null, via = REPORT_VIA) {
  if (via === 'github') {
    const q = new URLSearchParams({ template: 'preis-falsch.yml' });
    if (target) {
      q.set('title', `[Korrektur] ${target.providerName} .${target.row.tld}`);
      q.set('anbieter', target.row.providerId);
      q.set('tld', target.row.tld);
    }
    return `${ISSUES_NEW}?${q.toString()}`;
  }
  const subject = target
    ? `tldcost: Fehler bei ${target.providerName} .${target.row.tld}`
    : 'tldcost: Fehler melden';
  return mailto(subject, [
    `Anbieter: ${target?.row.providerId ?? ''}`,
    `TLD: ${target?.row.tld ?? ''}`,
    'Betroffene Spalte: ',
    'Wert in der Tabelle (brutto oder netto): ',
    'Richtiger Wert: ',
    'Öffentliche Quelle (URL): ',
    'Quelle geprüft am: ',
    'Verbindung zum Anbieter (keine / ich arbeite für den Anbieter): ',
    'Anmerkung: ',
    '',
    'Korrekturen übernehmen wir nur mit öffentlicher Quelle.',
  ]);
}

/**
 * "Anbieter vorschlagen". Mail: subject and the fields of .github/ISSUE_TEMPLATE/
 * anbieter-vorschlagen.yml as a body template. GitHub: that issue form.
 * @param {ReportVia} [via]
 */
export function suggestProviderUrl(via = REPORT_VIA) {
  if (via === 'github') return `${ISSUES_NEW}?template=anbieter-vorschlagen.yml`;
  return mailto('tldcost: Anbieter vorschlagen', [
    'Name des Anbieters: ',
    'Website: ',
    'Land des Vertragspartners: ',
    'TLDs: ',
    'Link zur Preisliste: ',
    'Link zu den AGB (optional): ',
    'Anmerkung: ',
  ]);
}
