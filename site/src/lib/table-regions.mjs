// Markdown (Sätteri mdast) plugin: wraps every table of the text pages in a focusable scroll region.
// On narrow screens a wide table scrolls sideways inside its wrapper; axe requires such a
// scrollable region to be reachable by keyboard (scrollable-region-focusable), and a region needs a
// name. The name is the text of the nearest heading before the table, numbered when a section has
// more than one table (region names stay unique).

const textOf = (/** @type {{ value?: unknown; children?: unknown[] }} */ node) =>
  typeof node.value === 'string'
    ? node.value
    : (node.children ?? []).map((c) => textOf(/** @type {never} */ (c))).join('');

const escapeAttr = (/** @type {string} */ s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Plugin factory: Sätteri calls it once per document, so the heading state never leaks. */
export const tableRegions = () => {
  let label = 'Tabelle';
  /** @type {Map<string, number>} */
  const seen = new Map();
  return {
    name: 'table-regions',
    /** @param {{ children?: unknown[] }} node */
    heading(node) {
      label = textOf(node).trim() || label;
    },
    /**
     * @param {unknown} node
     * @param {{ replaceNode(n: unknown, m: unknown[]): void }} ctx
     */
    table(node, ctx) {
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      const name = n === 1 ? `Tabelle: ${label}` : `Tabelle ${n}: ${label}`;
      ctx.replaceNode(node, [
        {
          type: 'html',
          value: `<div class="table-scroll" role="region" tabindex="0" aria-label="${escapeAttr(name)}">`,
        },
        node,
        { type: 'html', value: '</div>' },
      ]);
    },
  };
};
