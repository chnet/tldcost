// Where visitors report wrong data and suggest providers: the GitHub issue forms in
// .github/ISSUE_TEMPLATE/ ('github', the default) or e-mail with the same fields ('mail'). Every
// report link of the site (row detail, "Anbieter fehlt?", API page, the `tldcost:report/...` links
// in docs/pages) follows this one constant. Next to each GitHub link the site shows REPORT_NOTES:
// issues are public (no personal data), and e-mail works without a GitHub account. Nothing about
// the visitor is prefilled, only the row (provider, TLD) and the field names of the issue forms.

/** @typedef {'mail' | 'github'} ReportVia */

/** @type {ReportVia} */
export const REPORT_VIA = 'github';
export const REPORT_EMAIL = 'hello@chnet.solutions';
export const ISSUES_NEW = 'https://github.com/chnet/tldcost/issues/new';
/**
 * Is github.com/chnet/tldcost public? Yes, since 19.11.2026: repo links go to GitHub. While it was
 * private, every link into it was a 404, so the site rendered repo links as plain text or as a
 * site equivalent (repoLink); setting this back to false restores that.
 * @type {boolean}
 */
export const REPO_PUBLIC = true;
export const REPO_URL = 'https://github.com/chnet/tldcost';
/** GitHub Sponsors profile of the operator: voluntary donations, no influence on listing or ranking (Methodik). A plain link, nothing is loaded from GitHub. */
export const SPONSORS_URL = 'https://github.com/sponsors/chnet';
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

/**
 * Shown next to every GitHub report link, per page language. privacy: issues are public, so no
 * personal data goes in. noGithub: reporting never needs a GitHub account. The island and page
 * texts (i18n detail.reportPrivacy / detail.noGithubHint) say the same (tests/unit/report.test.ts);
 * the issue forms open with the same privacy note.
 */
export const REPORT_NOTES = {
  de: {
    privacy:
      'Issues auf GitHub sind öffentlich: Bitte keine personenbezogenen Daten eintragen (Name, Adresse, Kundennummer, Rechnungen, Screenshots mit persönlichen Daten).',
    noGithub: `Ohne GitHub-Konto: E-Mail an ${REPORT_EMAIL}.`,
  },
  en: {
    privacy:
      'Issues on GitHub are public: please do not enter personal data (name, address, customer number, invoices, screenshots with personal data).',
    noGithub: `Without a GitHub account: email ${REPORT_EMAIL}.`,
  },
};

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
