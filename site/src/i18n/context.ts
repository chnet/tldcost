// The language of an island (Archiv-Issue 33): provided once by the island entry (components/*De.tsx /
// *En.tsx), read by every component below it. No catalogue import here, so an island bundles only
// the catalogue its entry imports.
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Locale } from './de';

export const LocaleContext = createContext<Locale | null>(null);

export function useLocale(): Locale {
  const L = useContext(LocaleContext);
  if (!L) throw new Error('useLocale outside a LocaleContext provider');
  return L;
}
