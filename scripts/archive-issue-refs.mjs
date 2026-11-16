#!/usr/bin/env node
// archive-issue-refs.mjs — rewrites issue/PR references „#NN“ to „Archiv-Issue NN“ (English pages
// under docs/pages/en/: „archive issue NN“), without a link. The public repository starts from a
// snapshot; the numbers refer to the private predecessor repository (owner decision 2026-11-15).
//
// Only real references are rewritten: „#“ plus 1–3 digits (no leading zero) at a word boundary, an
// optional „issue “/„PR “ in front is folded in. Where:
//   - Markdown: the text, but not in front matter, code fences, inline code, URLs, link targets.
//   - JSON: string values, not keys; never a whole-string colour („#123“).
//   - TS/JS/MJS: comments and test titles (it/test/describe) only (TypeScript AST), no other code.
//   - Astro: comments in the front matter (AST) and the template (/* */, <!-- -->).
//   - CSS: comments only. YAML/shell: comments only. Other types (SVG, HTML fixtures): never.
// Everywhere: not in URLs, anchors (](#…), href="#…"), HTML entities (&#NN;) or identifiers.
// Every other „#digits“ is reported as skipped with its reason. Changed German pages under
// docs/pages/ get the source_sha256 of their English translation updated when it was in sync.
// EN legal pages (impressum, datenschutz) get only the owner-approved literal replacements.
//
// usage: node scripts/archive-issue-refs.mjs [--write] [--report <file.md>]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

/** Not rewritten at all: generated files and this script. */
export const EXCLUDED = new Map([
  ['package-lock.json', 'generated'],
  ['scripts/archive-issue-refs.mjs', 'this script'],
  ['scripts/archive-issue-refs.test.mjs', 'test of this script'],
]);

/**
 * EN legal pages: every text change needs an owner approval. Only these exact replacements are
 * approved (owner, 2026-11-16); each must occur exactly once, nothing else in the file changes and
 * source_sha256 stays.
 */
export const OWNER_APPROVED = new Map([
  ['docs/pages/en/impressum.md', [['(#33)', '(archive issue 33)']]],
  ['docs/pages/en/datenschutz.md', [['(#33)', '(archive issue 33)']]],
]);
const APPROVAL_REASON = 'EN legal page: only the owner-approved replacement';

/** Applies the owner-approved literal replacements of one file; throws when one does not match once. */
export function applyApproved(path, text) {
  const replaced = [];
  let out = text;
  for (const [from, to] of OWNER_APPROVED.get(path) ?? []) {
    const at = out.indexOf(from);
    if (at < 0 || out.indexOf(from, at + 1) > -1)
      throw new Error(`${path}: approved text ${from} must occur exactly once`);
    replaced.push({ path, line: out.slice(0, at).split('\n').length, from, to });
    out = out.slice(0, at) + to + out.slice(at + from.length);
  }
  const excluded = [...out.matchAll(CANDIDATE)].map((m) => ({
    path,
    line: out.slice(0, m.index).split('\n').length,
    match: m[0],
    reason: APPROVAL_REASON,
  }));
  return { text: out, replaced, excluded };
}

export const label = (lang, n) => (lang === 'en' ? `archive issue ${n}` : `Archiv-Issue ${n}`);
export const langOf = (path) => (path.startsWith('docs/pages/en/') ? 'en' : 'de');

/** Every „#digits“ (candidates); the classification decides. */
const CANDIDATE = /#(\d+)/g;
/** Optional word in front that the label replaces („issue #67“, „PR #42“). */
const PREFIX = /(?:\b(?:issue|Issue|PR|pull request)\s+)$/;
const URL = /\bhttps?:\/\/[^\s"'`<>)\]]+/g;

const ranges = (text, re, reason) =>
  [...text.matchAll(re)].map((m) => ({ s: m.index, e: m.index + m[0].length, reason }));

const TEST_CALL = /^(?:it|test|describe)(?:\.(?:skip|only|each|todo))?$/;

/** Comment ranges (and test titles) of TS/JS source, from the parsed file. */
export function tsComments(text, offset = 0, file = 'x.tsx') {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const seen = new Set();
  const out = [];
  const add = (list) => {
    for (const c of list ?? []) {
      if (seen.has(c.pos)) continue;
      seen.add(c.pos);
      out.push({ s: c.pos + offset, e: c.end + offset });
    }
  };
  const visit = (node) => {
    // test titles: the first string argument of it/test/describe (also .skip/.only/.each)
    if (ts.isCallExpression(node) && TEST_CALL.test(node.expression.getText(sf))) {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
        out.push({ s: arg.getStart(sf) + offset, e: arg.getEnd() + offset });
    }
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    node.getChildren(sf).forEach(visit);
  };
  visit(sf);
  add(ts.getLeadingCommentRanges(text, sf.getEnd()));
  return out;
}

/**
 * Where references may be rewritten in this file: `allowed` ranges, and `blocked` ranges with a
 * reason that win inside them. `outside`: the reason for a candidate outside every allowed range.
 */
export function regions(path, text) {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const all = [{ s: 0, e: text.length }];
  const common = [
    ...ranges(text, URL, 'URL'),
    ...ranges(text, /\]\([^)\n]*\)/g, 'link target'),
    ...ranges(text, /href=["'][^"']*["']/g, 'anchor'),
  ];
  switch (ext) {
    case 'md': {
      const fm = /^---\n[\s\S]*?\n---\n/.exec(text);
      return {
        allowed: all,
        blocked: [
          ...(fm ? [{ s: 0, e: fm[0].length, reason: 'front matter' }] : []),
          ...ranges(text, /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, 'code fence'),
          ...ranges(text, /(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g, 'inline code'),
          ...common,
        ],
        outside: 'none',
      };
    }
    case 'json': {
      const values = [];
      const colours = [];
      for (const m of text.matchAll(/"(?:[^"\\\n]|\\.)*"/g)) {
        const after = text.slice(m.index + m[0].length).match(/^\s*:/);
        if (after) continue; // a key
        if (/^"#[0-9a-fA-F]{3,8}"$/.test(m[0]))
          colours.push({ s: m.index, e: m.index + m[0].length, reason: 'colour' });
        values.push({ s: m.index, e: m.index + m[0].length });
      }
      return {
        allowed: values,
        blocked: [...colours, ...common],
        outside: 'JSON key or not a string',
      };
    }
    case 'ts':
    case 'tsx':
    case 'js':
    case 'mjs':
    case 'cjs':
      return {
        allowed: tsComments(text, 0, `x.${ext === 'ts' || ext === 'tsx' ? 'tsx' : 'js'}`),
        blocked: common,
        outside: 'code or string (not a comment)',
      };
    case 'astro': {
      const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
      const fmComments = fm ? tsComments(fm[1], 4) : [];
      const start = fm ? fm[0].length : 0;
      const template = text.slice(start);
      const tpl = [
        ...ranges(template, /\/\*[\s\S]*?\*\//g, ''),
        ...ranges(template, /<!--[\s\S]*?-->/g, ''),
      ].map((r) => ({ s: r.s + start, e: r.e + start }));
      return {
        allowed: [...fmComments, ...tpl],
        blocked: common,
        outside: 'code or markup (not a comment)',
      };
    }
    case 'css':
      return {
        allowed: ranges(text, /\/\*[\s\S]*?\*\//g, ''),
        blocked: common,
        outside: 'CSS value (not a comment)',
      };
    case 'yml':
    case 'yaml':
    case 'sh':
      return {
        allowed: ranges(text, /(?:^|[ \t])#[ \t][^\n]*/gm, ''),
        blocked: common,
        outside: 'not a comment',
      };
    default:
      return { allowed: [], blocked: [], outside: `file type .${ext}` };
  }
}

const inside = (list, i) => list.find((r) => i >= r.s && i < r.e);

/**
 * Rewrites one file's text. Returns the new text, the replacements and the skipped candidates
 * (each with line and reason).
 */
export function rewrite(path, text) {
  const lang = langOf(path);
  const { allowed, blocked, outside } = regions(path, text);
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  const replaced = [];
  const skipped = [];
  const edits = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const i = m.index;
    const digits = m[1];
    const before = text[i - 1] ?? '';
    const after = text[i + m[0].length] ?? '';
    const context = text.slice(Math.max(0, i - 30), i + m[0].length + 10).replace(/\s+/g, ' ');
    const skip = (reason) => skipped.push({ path, line: lineOf(i), match: m[0], reason, context });
    if (before === '&') {
      skip('HTML entity');
      continue;
    }
    if (/[\w#/]/.test(before)) {
      skip(before === '/' ? 'URL or path' : 'identifier or anchor');
      continue;
    }
    if (digits.length > 3 || digits.startsWith('0') || /[\w-]/.test(after)) {
      skip('not an issue number (colour or id)');
      continue;
    }
    if (!inside(allowed, i)) {
      skip(outside);
      continue;
    }
    const block = inside(blocked, i);
    if (block) {
      skip(block.reason);
      continue;
    }
    const pre = PREFIX.exec(text.slice(Math.max(0, i - 20), i));
    const s = pre ? i - pre[0].length : i;
    const to = label(lang, digits);
    edits.push({ s, e: i + m[0].length, to });
    replaced.push({ path, line: lineOf(i), from: text.slice(s, i + m[0].length), to });
  }
  let out = text;
  for (const ed of edits.reverse()) out = out.slice(0, ed.s) + ed.to + out.slice(ed.e);
  return { text: out, replaced, skipped };
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * source_sha256 of the English translation of a changed German page: updated when it matched the
 * old German text (in sync), else left alone (a drift stays visible). Returns the new EN text or null.
 */
export function syncSourceHash(enText, oldDe, newDe) {
  const m = /^source_sha256:[ \t]*(["']?)([0-9a-f]{64})\1[ \t]*$/m.exec(enText);
  if (!m || m[2] !== sha256(oldDe)) return null;
  return enText.replace(m[0], m[0].replace(m[2], sha256(newDe)));
}

function main(argv) {
  const write = argv.includes('--write');
  const reportAt = argv.indexOf('--report');
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const replaced = [];
  const skipped = [];
  const excluded = [];
  const hashes = [];
  for (const path of files) {
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    if (buf.includes(0)) continue; // binary
    const text = buf.toString('utf8');
    if (!/#\d/.test(text)) continue;
    if (EXCLUDED.has(path)) {
      for (const m of text.matchAll(CANDIDATE))
        excluded.push({
          path,
          line: text.slice(0, m.index).split('\n').length,
          match: m[0],
          reason: EXCLUDED.get(path),
        });
      continue;
    }
    if (OWNER_APPROVED.has(path)) {
      const a = applyApproved(path, text);
      replaced.push(...a.replaced);
      excluded.push(...a.excluded);
      if (write) writeFileSync(path, a.text);
      continue;
    }
    const r = rewrite(path, text);
    replaced.push(...r.replaced);
    skipped.push(...r.skipped);
    if (!r.replaced.length) continue;
    if (write) writeFileSync(path, r.text);
    const de = /^docs\/pages\/([^/]+)\.md$/.exec(path);
    const en = de && `docs/pages/en/${de[1]}.md`;
    if (en && existsSync(en)) {
      // The source_sha256 of an EN legal page is part of its approved text: never changed here.
      if (OWNER_APPROVED.has(en))
        throw new Error(`${path} changed: ${en} would need a new source_sha256 (owner approval)`);
      const next = syncSourceHash(readFileSync(en, 'utf8'), text, r.text);
      hashes.push({ path: en, updated: next !== null });
      if (next !== null && write) writeFileSync(en, next);
    }
  }
  const lines = [
    `Replaced: ${replaced.length} in ${new Set(replaced.map((r) => r.path)).size} files. Skipped: ${skipped.length}. Excluded: ${excluded.length}.`,
    '',
    '| Skipped | Line | Match | Reason | Context |',
    '|---|---|---|---|---|',
    ...skipped.map(
      (s) =>
        `| \`${s.path}\` | ${s.line} | \`${s.match}\` | ${s.reason} | ${s.context.replace(/\|/g, '\\|')} |`,
    ),
    '',
    '| Excluded (not rewritten) | Line | Match | Reason |',
    '|---|---|---|---|',
    ...excluded.map((s) => `| \`${s.path}\` | ${s.line} | \`${s.match}\` | ${s.reason} |`),
    '',
    ...hashes.map(
      (h) =>
        `- source_sha256 of \`${h.path}\`: ${h.updated ? 'updated' : 'NOT updated (was out of sync)'}`,
    ),
  ];
  if (reportAt > -1) writeFileSync(argv[reportAt + 1], lines.join('\n') + '\n');
  process.stdout.write(lines[0] + (write ? ' (written)' : ' (dry run)') + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
