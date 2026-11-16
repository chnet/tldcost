/** MVP TLDs (docs/concepts/tldcost.md section 3.5), lower case without dot. */
export const MVP_TLDS = [
  'de',
  'com',
  'net',
  'org',
  'eu',
  'io',
  'dev',
  'app',
  'shop',
  'info',
  'at',
  'ch',
  'me',
  'co',
  'online',
  'berlin',
  'xyz',
  'ai',
  'biz',
  'cloud',
] as const;

/** ISO date-time without milliseconds, the format used in evidence.fetched_at. */
export const isoSeconds = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
