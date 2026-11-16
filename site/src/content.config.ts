// Content collections. `pages`: the text pages (Impressum, Datenschutz, Methodik, Changelog,
// Lizenz) are written in docs/pages/*.md at the repo root, so they can be reviewed as plain
// text; the site renders them under /<slug>/ (src/pages/[slug].astro) and links them in the footer.
// English translations (Archiv-Issue 33) are docs/pages/en/<slug>.md with the same slug, `lang: en` and
// `source_sha256` (quoted, so YAML never reads it as a number): sha256 of the bytes of the German
// file they were translated from. They render
// under /en/<slug>/ (src/pages/en/[slug].astro); a page whose German file has changed since shows
// a note (report only). Not every page has a translation (the changelog never).
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** Slugs of the text pages, in footer order. Only these may exist (no route next to /api/ or /tld/). */
export const PAGE_SLUGS = ['impressum', 'datenschutz', 'methodik', 'changelog', 'lizenz'] as const;

const pages = defineCollection({
  // ids from the file path ('methodik', 'en/methodik'): the default would take `slug`, and the
  // German page and its translation share the slug
  loader: glob({
    pattern: ['*.md', 'en/*.md'],
    base: '../docs/pages',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z
    .object({
      title: z.string().min(1),
      slug: z.enum(PAGE_SLUGS),
      lang: z.enum(['de', 'en']).default('de'),
      source_sha256: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .optional(),
    })
    .refine((p) => (p.lang === 'en') === (p.source_sha256 !== undefined), {
      message: 'source_sha256 is required on English pages (lang: en) and only there',
    }),
});

export const collections = { pages };
