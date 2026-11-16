// check-i18n.mjs reads source_sha256 from the translations in docs/pages/en/ itself (drift check).
// YAML allows the hash plain, 'single' or "double" quoted; the reader must accept every form the
// content schema accepts (main was red when the English legal pages used single quotes).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_PAGES, frontmatterSha256 } from '../check-i18n.mjs';

const HASH = '7a2826a1ccdcea6c158893e35946f57a3ab3a7311db9e37e51f2d6e820bbc1a9';
const page = (line: string) =>
  `---\ntitle: Legal notice\nslug: impressum\nlang: en\n${line}\n---\n`;

describe('frontmatterSha256', () => {
  it('reads the hash plain, single and double quoted', () => {
    expect(frontmatterSha256(page(`source_sha256: ${HASH}`))).toBe(HASH);
    expect(frontmatterSha256(page(`source_sha256: '${HASH}'`))).toBe(HASH);
    expect(frontmatterSha256(page(`source_sha256: "${HASH}"`))).toBe(HASH);
    expect(frontmatterSha256(page(`source_sha256:   "${HASH}"  `))).toBe(HASH);
  });

  it('rejects mixed quotes, a short hash, upper case and a missing field', () => {
    expect(frontmatterSha256(page(`source_sha256: '${HASH}"`))).toBeUndefined();
    expect(frontmatterSha256(page(`source_sha256: "${HASH.slice(1)}"`))).toBeUndefined();
    expect(frontmatterSha256(page(`source_sha256: "${HASH.toUpperCase()}"`))).toBeUndefined();
    expect(frontmatterSha256(page('title2: x'))).toBeUndefined();
  });

  it('every committed translation has a readable hash', () => {
    const files = readdirSync(join(DOCS_PAGES, 'en')).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(frontmatterSha256(readFileSync(join(DOCS_PAGES, 'en', f), 'utf8')), f).toMatch(
        /^[0-9a-f]{64}$/,
      );
    }
  });
});
