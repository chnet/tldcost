// archive-issue-refs.test.mjs — the rewrite of „#NN“ references (no git, no files).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyApproved,
  label,
  langOf,
  rewrite,
  sha256,
  syncSourceHash,
} from './archive-issue-refs.mjs';

const reasons = (r) => r.skipped.map((s) => `${s.match}:${s.reason}`);

test('labels: German everywhere, English only on docs/pages/en/', () => {
  assert.equal(label('de', '75'), 'Archiv-Issue 75');
  assert.equal(label('en', '75'), 'archive issue 75');
  assert.equal(langOf('docs/pages/en/methodik.md'), 'en');
  assert.equal(langOf('docs/pages/methodik.md'), 'de');
  assert.equal(langOf('site/src/i18n/en.ts'), 'de');
});

test('markdown: text yes; front matter, code fences, inline code, URLs and anchors no', () => {
  const md = [
    '---',
    'title: x (#1)',
    '---',
    'See #75 and (#76), issue #67, PR #42.',
    '```',
    'echo #12',
    '```',
    'Code `f(#13)` and https://github.com/o/r/issues/14#15 and [a](#16) and <a href="#17">',
    '&#160; ##18 x#19 #0 #007 #1234 #12a',
    '',
  ].join('\n');
  const r = rewrite('docs/research/x.md', md);
  assert.match(
    r.text,
    /See Archiv-Issue 75 and \(Archiv-Issue 76\), Archiv-Issue 67, Archiv-Issue 42\./,
  );
  assert.match(r.text, /title: x \(#1\)/);
  assert.match(r.text, /echo #12/);
  assert.match(r.text, /`f\(#13\)`/);
  assert.match(r.text, /issues\/14#15/);
  assert.match(r.text, /\[a\]\(#16\)/);
  assert.equal(r.replaced.length, 4);
  assert.deepEqual(reasons(r), [
    '#1:front matter',
    '#12:code fence',
    '#13:inline code',
    '#15:identifier or anchor',
    '#16:link target',
    '#17:anchor',
    '#160:HTML entity',
    '#18:identifier or anchor',
    '#19:identifier or anchor',
    '#0:not an issue number (colour or id)',
    '#007:not an issue number (colour or id)',
    '#1234:not an issue number (colour or id)',
    '#12:not an issue number (colour or id)',
  ]);
});

test('English pages get the English label', () => {
  const r = rewrite('docs/pages/en/methodik.md', 'As decided in #33.\n');
  assert.equal(r.text, 'As decided in archive issue 33.\n');
});

test('TS/JS: comments and test titles only, never other strings or code', () => {
  const src = [
    '// header (#33)',
    "/** doc (#76) */ const a = '#77'; const b = `x #78`;",
    "it('title (#124)', () => expect(f()).toBe('Bot-Schutz (#79)'));",
    "describe.skip('group #80', () => {});",
    'const re = /#81/; // trailing (#82)',
    '',
  ].join('\n');
  const r = rewrite('site/src/x.ts', src);
  assert.match(r.text, /\/\/ header \(Archiv-Issue 33\)/);
  assert.match(r.text, /\/\*\* doc \(Archiv-Issue 76\) \*\//);
  assert.match(r.text, /const a = '#77'; const b = `x #78`;/);
  assert.match(r.text, /it\('title \(Archiv-Issue 124\)'.*toBe\('Bot-Schutz \(#79\)'\)/);
  assert.match(r.text, /describe\.skip\('group Archiv-Issue 80'/);
  assert.match(r.text, /\/#81\/; \/\/ trailing \(Archiv-Issue 82\)/);
  assert.deepEqual(reasons(r), [
    '#77:code or string (not a comment)',
    '#78:code or string (not a comment)',
    '#79:code or string (not a comment)',
    '#81:URL or path',
  ]);
});

test('CSS: comments yes, colours no', () => {
  const r = rewrite(
    'site/src/styles/x.css',
    '/* filter row (#76) */\n.a { color: #123; --b: #132022; }\n',
  );
  assert.equal(r.text, '/* filter row (Archiv-Issue 76) */\n.a { color: #123; --b: #132022; }\n');
  assert.deepEqual(reasons(r), [
    '#123:CSS value (not a comment)',
    '#132022:not an issue number (colour or id)',
  ]);
});

test('Astro: front matter comments and template comments, not markup', () => {
  const src =
    '---\n// page (#33)\nconst x = "#34";\n---\n<p>#35</p>\n{/* label (#123) */}\n<!-- note #36 -->\n';
  const r = rewrite('site/src/pages/x.astro', src);
  assert.match(r.text, /\/\/ page \(Archiv-Issue 33\)/);
  assert.match(r.text, /const x = "#34"/);
  assert.match(r.text, /<p>#35<\/p>/);
  assert.match(r.text, /\{\/\* label \(Archiv-Issue 123\) \*\/\}/);
  assert.match(r.text, /<!-- note Archiv-Issue 36 -->/);
});

test('JSON: string values yes, keys and colour strings no', () => {
  const json =
    '{\n  "_comment": "as merged in #118",\n  "#5": 1,\n  "dark": "#123",\n  "n": 7\n}\n';
  const r = rewrite('packages/mcp/test/fixtures/x.json', json);
  assert.match(r.text, /"as merged in Archiv-Issue 118"/);
  assert.match(r.text, /"#5": 1/);
  assert.match(r.text, /"dark": "#123"/);
  assert.deepEqual(reasons(r), ['#5:JSON key or not a string', '#123:colour']);
});

test('YAML and shell: comments only; other file types never', () => {
  const r = rewrite('.github/workflows/x.yml', '# step (#75)\nrun: echo "#76"\n');
  assert.equal(r.text, '# step (Archiv-Issue 75)\nrun: echo "#76"\n');
  const svg = rewrite('site/public/flags/x.svg', '<path fill="#123"/> (#75)');
  assert.equal(svg.replaced.length, 0);
  assert.ok(svg.skipped.some((s) => s.reason === 'file type .svg'));
});

test('EN legal pages: only the owner-approved literal, exactly once', () => {
  const page = 'docs/pages/en/impressum.md';
  const text = "---\nsource_sha256: 'abc'\n---\n<!--\nTranslation (#33). See #34.\n-->\n";
  const a = applyApproved(page, text);
  assert.equal(
    a.text,
    "---\nsource_sha256: 'abc'\n---\n<!--\nTranslation (archive issue 33). See #34.\n-->\n",
  );
  assert.equal(a.replaced.length, 1);
  assert.deepEqual(
    a.excluded.map((e) => `${e.match}:${e.line}`),
    ['#34:5'],
  );
  assert.throws(() => applyApproved(page, 'no reference\n'), /exactly once/);
  assert.throws(() => applyApproved(page, '(#33) (#33)\n'), /exactly once/);
});

test('source_sha256 follows a changed German page only when it was in sync', () => {
  const oldDe = 'Text #75\n';
  const newDe = 'Text Archiv-Issue 75\n';
  const en = (h) => `---\ntitle: X\nsource_sha256: "${h}"\n---\n\nBody\n`;
  assert.equal(syncSourceHash(en(sha256(oldDe)), oldDe, newDe), en(sha256(newDe)));
  assert.equal(syncSourceHash(en('0'.repeat(64)), oldDe, newDe), null);
  assert.equal(syncSourceHash('no front matter', oldDe, newDe), null);
});
