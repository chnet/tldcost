import { createHash } from 'node:crypto';

/** `sha256:<hex>` of a response body, the format of evidence.evidence_hash. */
export function evidenceHash(body: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}
