// Size of the price-history sparkline (Archiv-Issue 51): price-history.ts builds the path data for
// this viewBox at build time, RowDetail draws it. No imports, so the table island stays small.
export const HISTORY_SVG = { width: 240, height: 56, pad: 4 } as const;
