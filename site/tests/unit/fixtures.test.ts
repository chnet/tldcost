import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateDir } from '../../../scripts/validate-data.mjs';

describe('test fixtures', () => {
  it('match the data schema (same check as CI on data/)', () => {
    const dir = fileURLToPath(new URL('../fixtures/data', import.meta.url));
    expect(validateDir(dir)).toEqual([]);
  });
});
