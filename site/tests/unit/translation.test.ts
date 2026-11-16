import { describe, expect, it } from 'vitest';
import { sourceSha256, translationDrift } from '../../src/lib/translation';

const GERMAN = '---\ntitle: Methodik\nslug: methodik\n---\n\n# Methodik\n';
const HASH = sourceSha256(GERMAN);

describe('translation drift (Archiv-Issue 33)', () => {
  it('no drift while the German bytes match the recorded hash', () => {
    expect(HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(translationDrift(GERMAN, HASH)).toBe(false);
    expect(translationDrift(Buffer.from(GERMAN, 'utf8'), HASH)).toBe(false);
  });

  // drift is report only (owner decision): no test compares the committed files, so a stale
  // translation never fails the build; check-i18n checks that the page shows the note correctly
  it('drift on any byte change, also a trailing newline or a changed character', () => {
    expect(translationDrift(`${GERMAN}\n`, HASH)).toBe(true);
    expect(translationDrift(GERMAN.slice(0, -1), HASH)).toBe(true);
    expect(translationDrift(GERMAN.replace('Methodik\n', 'Methodik.\n'), HASH)).toBe(true);
    expect(translationDrift(GERMAN.replace(/\n/g, '\r\n'), HASH)).toBe(true);
  });
});
