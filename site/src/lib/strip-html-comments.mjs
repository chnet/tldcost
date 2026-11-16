// Markdown (Sätteri mdast) plugin: drops HTML comments before rendering. The texts in
// docs/pages/ carry editorial notes for reviewers in <!-- … --> comments; none of them may reach
// the build. Raw HTML is an `html` node (block or inline): comments are cut out of its value and a
// node that is empty afterwards is removed. Other raw HTML stays as it is.

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

export const stripHtmlComments = {
  name: 'strip-html-comments',
  /**
   * @param {{ value: string }} node
   * @param {{ removeNode(n: unknown): void; replaceNode(n: unknown, m: unknown): void }} ctx
   */
  html(node, ctx) {
    const value = node.value.replace(COMMENT, '');
    if (value === node.value) return;
    if (value.trim() === '') ctx.removeNode(node);
    else ctx.replaceNode(node, { type: 'html', value });
  },
};
