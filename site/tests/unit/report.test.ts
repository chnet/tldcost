// Report routes (src/lib/report.mjs): e-mail while the repository is private, GitHub issue forms
// after the switch. Only the row (provider, TLD) and the form's field names are prefilled.
import { describe, expect, it } from 'vitest';
import { reportLinksFor } from '../../src/lib/report-links.mjs';
import {
  NO_GITHUB_HINT,
  REPO_PUBLIC,
  REPORT_VIA,
  correctionUrl,
  repoLink,
  suggestProviderUrl,
} from '../../src/lib/report.mjs';

const params = (href: string) => new URL(href).searchParams;

describe('report routes', () => {
  it('defaults to e-mail while the repository is private', () => {
    expect(REPORT_VIA).toBe('mail');
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
  it('the repository is treated as private for now', () => {
    expect(REPO_PUBLIC).toBe(false);
  });

  it('public: GitHub URLs; private: the site fallback or null (plain text)', () => {
    expect(repoLink('', null, true)).toBe('https://github.com/chnet/tldcost');
    expect(repoLink('blob/main/LICENSE', '/lizenz/', true)).toBe(
      'https://github.com/chnet/tldcost/blob/main/LICENSE',
    );
    expect(repoLink('blob/main/LICENSE', '/lizenz/', false)).toBe('/lizenz/');
    expect(repoLink('', null, false)).toBeNull();
    expect(repoLink()).toBeNull();
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

  it('github: issue forms plus the e-mail route right after the link', () => {
    expect(run('github', 'tldcost:report/preis')).toMatchObject({
      url: correctionUrl(null, 'github'),
      after: [{ type: 'text', value: ` (${NO_GITHUB_HINT})` }],
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
