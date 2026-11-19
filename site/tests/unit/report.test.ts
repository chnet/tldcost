// Report routes (src/lib/report.mjs): GitHub issue forms, e-mail with the same fields as the
// alternative. Only the row (provider, TLD) and the form's field names are prefilled. Next to every
// GitHub link: issues are public (no personal data), and the e-mail route (REPORT_NOTES).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DE, EN } from '../../src/i18n';
import { reportLinksFor } from '../../src/lib/report-links.mjs';
import {
  REPO_PUBLIC,
  REPORT_EMAIL,
  REPORT_NOTES,
  REPORT_VIA,
  correctionUrl,
  repoLink,
  suggestProviderUrl,
} from '../../src/lib/report.mjs';

const params = (href: string) => new URL(href).searchParams;

describe('report routes', () => {
  it('defaults to the GitHub issue forms (the repository is public)', () => {
    expect(REPORT_VIA).toBe('github');
  });

  it('the island texts say the same as REPORT_NOTES, in both languages', () => {
    expect(DE.m.detail.reportPrivacy).toBe(REPORT_NOTES.de.privacy);
    expect(EN.m.detail.reportPrivacy).toBe(REPORT_NOTES.en.privacy);
    expect(DE.m.detail.noGithubHint(REPORT_EMAIL)).toBe(REPORT_NOTES.de.noGithub);
    expect(EN.m.detail.noGithubHint(REPORT_EMAIL)).toBe(REPORT_NOTES.en.noGithub);
  });

  it('the row detail says "public" once, in the privacy note', () => {
    for (const [m, word] of [
      [DE.m, /öffentlich/gi],
      [EN.m, /public/gi],
    ] as const) {
      const line = `${m.detail.reportGithub(m.detail.noGithubHint(REPORT_EMAIL))} ${m.detail.reportPrivacy}`;
      expect(line.match(word), line).toHaveLength(1);
    }
  });

  it('every issue form opens with the public-issue note (German and English)', () => {
    for (const form of ['preis-falsch.yml', 'anbieter-vorschlagen.yml']) {
      const { body } = parse(
        readFileSync(new URL(`../../../.github/ISSUE_TEMPLATE/${form}`, import.meta.url), 'utf8'),
      ) as { body: { type: string; attributes: { value?: string } }[] };
      expect(body[0]?.type, form).toBe('markdown');
      // The note is a Markdown blockquote: drop the quote markers, join its lines into one text.
      const first = (body[0]?.attributes.value ?? '').replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
      expect(first, form).toContain('Issues sind öffentlich.');
      expect(first, form).toContain(
        'Bitte keine personenbezogenen Daten eintragen (Name, Adresse, Kundennummer, Rechnungen, Screenshots mit persönlichen Daten).',
      );
      expect(first, form).toContain('Issues are public.');
      expect(first, form).toContain(
        'Please do not enter personal data (name, address, customer number, invoices, screenshots with personal data).',
      );
      expect(first, form).toContain(`E-Mail an ${REPORT_EMAIL}`);
      expect(first, form).toContain(`email ${REPORT_EMAIL}`);
    }
  });

  it('suggest a provider: mail with subject and the fields of the issue form', () => {
    const href = suggestProviderUrl('mail');
    expect(href.startsWith('mailto:hello@chnet.solutions?')).toBe(true);
    expect(href).not.toContain('+');
    expect(params(href).get('subject')).toBe('tldcost: Anbieter vorschlagen');
    expect(params(href).get('body')?.split('\r\n')).toEqual([
      'Name des Anbieters: ',
      'Website: ',
      'Land des Vertragspartners: ',
      'TLDs: ',
      'Link zur Preisliste: ',
      'Link zu den AGB (optional): ',
      'Anmerkung: ',
    ]);
    expect(suggestProviderUrl('github')).toBe(
      'https://github.com/chnet/tldcost/issues/new?template=anbieter-vorschlagen.yml',
    );
  });

  it('report an error without a row: empty form (mail) or plain issue form (github)', () => {
    expect(params(correctionUrl(null, 'mail')).get('subject')).toBe('tldcost: Fehler melden');
    expect(correctionUrl(null, 'github')).toBe(
      'https://github.com/chnet/tldcost/issues/new?template=preis-falsch.yml',
    );
  });
});

describe('repo links (REPO_PUBLIC)', () => {
  it('the repository is public (since 19.11.2026)', () => {
    expect(REPO_PUBLIC).toBe(true);
  });

  it('public: GitHub URLs; private: the site fallback or null (plain text)', () => {
    expect(repoLink('', null, true)).toBe('https://github.com/chnet/tldcost');
    expect(repoLink('blob/main/LICENSE', '/lizenz/', true)).toBe(
      'https://github.com/chnet/tldcost/blob/main/LICENSE',
    );
    expect(repoLink('blob/main/LICENSE', '/lizenz/', false)).toBe('/lizenz/');
    expect(repoLink('', null, false)).toBeNull();
    expect(repoLink()).toBe('https://github.com/chnet/tldcost');
  });
});

describe('report-links (docs/pages)', () => {
  const run = (via: 'mail' | 'github', url: string, repoPublic = false) => {
    const node = { url, children: [{ type: 'text', value: 'Linktext' }] };
    const after: unknown[] = [];
    let replaced: unknown[] | undefined;
    reportLinksFor(via, repoPublic).link(node, {
      setField: (n, k, v) => Object.assign(n as object, { [k]: v }),
      insertAfter: (_n, m) => after.push(...m),
      replaceNode: (_n, m) => (replaced = m),
    });
    return { url: node.url, after, replaced };
  };

  it('tldcost:repo/... private: data links go to the API, other links become plain text', () => {
    expect(run('mail', 'tldcost:repo/tree/main/data').url).toBe('/api/v1/all.json');
    expect(run('mail', 'tldcost:repo/tree/main/data/providers').url).toBe('/api/v1/all.json');
    expect(run('mail', 'tldcost:repo/blob/main/LICENSE').url).toBe(
      'https://www.apache.org/licenses/LICENSE-2.0',
    );
    for (const path of ['', 'blob/main/data/LICENSE', 'commits/main/data']) {
      expect(run('mail', `tldcost:repo/${path}`).replaced, path).toEqual([
        { type: 'text', value: 'Linktext' },
      ]);
    }
  });

  it('tldcost:repo/... public: GitHub URLs, the link stays', () => {
    const r = run('mail', 'tldcost:repo/commits/main/data', true);
    expect(r).toMatchObject({ url: 'https://github.com/chnet/tldcost/commits/main/data' });
    expect(r.replaced).toBeUndefined();
    expect(run('mail', 'tldcost:repo/', true).url).toBe('https://github.com/chnet/tldcost');
  });

  it('mail: tldcost:report/... become mailto links, nothing added', () => {
    expect(run('mail', 'tldcost:report/anbieter')).toMatchObject({
      url: suggestProviderUrl('mail'),
      after: [],
    });
    expect(run('mail', 'tldcost:report/preis').url).toBe(correctionUrl(null, 'mail'));
  });

  it('github: issue forms plus the public-issue note and the e-mail route after the link', () => {
    const { de, en } = REPORT_NOTES;
    expect(run('github', 'tldcost:report/preis')).toMatchObject({
      url: correctionUrl(null, 'github'),
      after: [{ type: 'text', value: ` (${de.privacy} ${de.noGithub})` }],
    });
    expect(run('github', 'tldcost:report/anbieter?lang=en')).toMatchObject({
      url: suggestProviderUrl('github'),
      after: [{ type: 'text', value: ` (${en.privacy} ${en.noGithub})` }],
    });
  });

  it('mail: ?lang=en resolves like the German placeholder, nothing added', () => {
    expect(run('mail', 'tldcost:report/preis?lang=en')).toMatchObject({
      url: correctionUrl(null, 'mail'),
      after: [],
    });
  });

  it('other links stay as they are', () => {
    expect(run('mail', 'https://example.com/')).toMatchObject({
      url: 'https://example.com/',
      after: [],
      replaced: undefined,
    });
  });
});
