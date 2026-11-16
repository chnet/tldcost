// Languages of the site (Archiv-Issue 33): German at the root, English under /en/ with the same paths
// (/methodik/ <-> /en/methodik/). Server side only (pages, layout, build-time payloads): it imports
// both catalogues. The islands get one catalogue each through their entry file
// (components/*De.tsx, *En.tsx), so a page ships only its own language.
import { DE, type Locale } from './de';
import { EN } from './en';
import { siteDe, type SiteMessages } from './site-de';
import { siteEn } from './site-en';

export type { Lang } from './format';
export type { Locale, Messages } from './de';
export type { SiteMessages } from './site-de';
export { DE } from './de';
export { EN } from './en';

/** A language for the build: the island texts (m), the build-only texts (s) and the formats. */
export interface SiteLocale extends Locale {
  s: SiteMessages;
}

export const LANGS = ['de', 'en'] as const;
export const LOCALES: Readonly<Record<'de' | 'en', SiteLocale>> = {
  de: { ...DE, s: siteDe },
  en: { ...EN, s: siteEn },
};

/** Language of a site path: /en/... is English, everything else German. */
export function langOf(path: string): 'de' | 'en' {
  return path === '/en/' || path.startsWith('/en/') ? 'en' : 'de';
}

/** The same page in `lang`: '/methodik/' -> '/en/methodik/' and back. */
export function pathIn(lang: 'de' | 'en', path: string): string {
  const base = langOf(path) === 'en' ? path.slice(3) || '/' : path;
  return lang === 'en' ? `/en${base}` : base;
}
