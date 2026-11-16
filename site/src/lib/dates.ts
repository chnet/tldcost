/** `2026-11-13T05:04:21Z` -> `13.11.2026` (UTC date, German format). */
export function dateDe(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
