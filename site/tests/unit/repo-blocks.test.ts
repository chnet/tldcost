// :::nur-oeffentlich / :::nur-privat blocks in docs/pages (repo-blocks.mjs, REPO_PUBLIC).
import { describe, expect, it } from 'vitest';
import { repoBlocksFor } from '../../src/lib/repo-blocks.mjs';

const run = (repoPublic: boolean, name: string) => {
  const node = { name, children: [{ type: 'paragraph' }] };
  let result: 'kept' | 'removed' | 'unwrapped' = 'kept';
  repoBlocksFor(repoPublic).containerDirective(node, {
    removeNode: () => (result = 'removed'),
    replaceNode: (_n, m) => {
      expect(m).toBe(node.children);
      result = 'unwrapped';
    },
  });
  return result;
};

describe('repo blocks', () => {
  it('private: nur-privat is unwrapped, nur-oeffentlich removed', () => {
    expect(run(false, 'nur-privat')).toBe('unwrapped');
    expect(run(false, 'nur-oeffentlich')).toBe('removed');
  });

  it('public: nur-oeffentlich is unwrapped, nur-privat removed', () => {
    expect(run(true, 'nur-oeffentlich')).toBe('unwrapped');
    expect(run(true, 'nur-privat')).toBe('removed');
  });

  it('other directives stay', () => {
    expect(run(false, 'hinweis')).toBe('kept');
  });
});
