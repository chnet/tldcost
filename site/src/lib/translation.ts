// Translation drift (Archiv-Issue 33): an English text page records the sha256 of the German file it was
// translated from (frontmatter source_sha256). When the German file's bytes hash differently, the
// translation is out of date and the page shows the drift note (report only, never a build error).
import { createHash } from 'node:crypto';

/** sha256 (hex) of the exact bytes of a file: no normalisation, a trailing newline counts. */
export function sourceSha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * true when the German bytes no longer match the translation's source_sha256 (a missing hash counts
 * as drift; the content schema requires it on English pages anyway).
 */
export function translationDrift(
  germanBytes: Uint8Array | string,
  sha256: string | undefined,
): boolean {
  return sourceSha256(germanBytes) !== sha256;
}
