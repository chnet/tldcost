// Markdown (Sätteri mdast) plugin: text that only applies while the repository is public or private
// (REPO_PUBLIC, src/lib/report.mjs). In docs/pages/*.md:
//
//   :::nur-oeffentlich
//   Text with links into the repository.
//   :::
//   :::nur-privat
//   Text that is true while the repository is private.
//   :::
//
// The matching block is unwrapped, the other one removed, so the public wording comes back as it is
// when REPO_PUBLIC turns true. Needs the Sätteri feature `directive`. Other directives stay.
import { REPO_PUBLIC } from './report.mjs';

/** @param {boolean} [repoPublic] */
export function repoBlocksFor(repoPublic = REPO_PUBLIC) {
  return {
    name: 'repo-blocks',
    /**
     * @param {{ name: string; children: unknown[] }} node
     * @param {{ removeNode(n: unknown): void; replaceNode(n: unknown, m: unknown[]): void }} ctx
     */
    containerDirective(node, ctx) {
      if (node.name !== 'nur-oeffentlich' && node.name !== 'nur-privat') return;
      if ((node.name === 'nur-oeffentlich') === repoPublic) ctx.replaceNode(node, node.children);
      else ctx.removeNode(node);
    },
  };
}

export const repoBlocks = repoBlocksFor();
