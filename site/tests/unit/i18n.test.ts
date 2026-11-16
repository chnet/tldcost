// English version (Archiv-Issue 33): the catalogues have the same keys and signatures, the English formats
// follow the owner's style rules, paths map 1:1 between /… and /en/…, and the payload of the
// English page quotes German data text verbatim, marked lang="de".
import { fileURLToPath } from 'node:url';
import { loadData } from '@tldcost/core/load';
import { describe, expect, it } from 'vitest';
import { de, DE } from '../../src/i18n/de';
import { en, EN } from '../../src/i18n/en';
import { createFormat } from '../../src/i18n/format';
import { langOf, LOCALES, pathIn } from '../../src/i18n';
import { siteDe } from '../../src/i18n/site-de';
import { siteEn } from '../../src/i18n/site-en';
import { COLUMN_IDS, ENUM_RANK } from '../../src/lib/columns';
import { notePromo, noteCountry, noteTerms, buildPayload } from '../../src/lib/rows';
import { filterValueText, pickLabel } from '../../src/lib/filters';
import { formatPerMonth, formatValue, sortLabel } from '../../src/lib/view';
import { COLUMN_BY_ID } from '../../src/lib/columns';
import { defaultState } from '../../src/lib/url-state';

/** Key paths of a catalogue with the kind of each leaf: string, or function with its arity. */
function shape(o: unknown, path = ''): string[] {
  if (typeof o === 'function') return [`${path}:fn/${o.length}`];
  if (typeof o === 'string') return [`${path}:string`];
  if (Array.isArray(o)) return [`${path}:array`];
  if (o && typeof o === 'object') {
    return Object.keys(o)
      .sort()
      .flatMap((k) => shape((o as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
  }
  return [`${path}:${typeof o}`];
}

/** All string leaves (and string results of functions called with sample arguments). */
function strings(o: unknown, path = ''): Array<[string, string]> {
  if (typeof o === 'string') return [[path, o]];
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    return Object.entries(o).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

const FIXTURES = fileURLToPath(new URL('../fixtures/data', import.meta.url));
const data = loadData(FIXTURES);
const nbsp = (s: string) => s.replace(/\u00a0/g, ' ');

describe('catalogues', () => {
  it('island texts: English has exactly the German keys and signatures', () => {
    expect(shape(en)).toEqual(shape(de));
  });

  it('build texts: English has exactly the German keys and signatures', () => {
    expect(shape(siteEn)).toEqual(shape(siteDe));
  });

  it('every column and every enum value has a label in both languages', () => {
    for (const m of [de, en]) {
      expect(Object.keys(m.columns).sort()).toEqual([...COLUMN_IDS].sort());
      expect(Object.keys(m.enums).sort()).toEqual(Object.keys(ENUM_RANK).sort());
    }
  });

  it('no empty English text; German leaves empty only what English pages alone show', () => {
    for (const [path, text] of [...strings(en), ...strings(siteEn)]) {
      expect(text.trim(), path).not.toBe('');
    }
    const emptyDe = [...strings(de), ...strings(siteDe)].filter(([, t]) => t === '');
    expect(emptyDe.map(([p]) => p).sort()).toEqual([
      'layout.germanOnly',
      'layout.translationNote.drift',
      'layout.translationNote.legal',
      'layout.translationNote.methodik',
    ]);
  });

  it('legal and Methodik notes as decided (owner wording)', () => {
    expect(siteEn.layout.translationNote.legal).toBe(
      'This is a translation. The German version is binding.',
    );
    expect(siteEn.layout.translationNote.methodik).toContain(
      'The German version is authoritative.',
    );
  });
});

describe('formats', () => {
  it('German: as before (6,00 €, 13.11.2026)', () => {
    const f = createFormat('de');
    expect(nbsp(f.eur(407))).toBe('4,07 €');
    expect(f.date('2026-11-13T05:04:21Z')).toBe('13.11.2026');
    expect(f.dateTime('2026-11-13T05:04:21Z')).toBe('13.11.2026, 05:04 UTC');
    expect(f.decimal(7.7)).toBe('7,7');
    expect(f.parseEuro('1.234,50')).toBe(123450);
    expect(f.euroInput(650)).toBe('6,50');
  });

  it('English: en-GB, owner style (€4.07, €0.42/month, avg €5.09/yr, 13 Nov 2026)', () => {
    expect(EN.f.eur(407)).toBe('€4.07');
    expect(formatPerMonth(EN, 42)).toBe('€0.42/month');
    expect(EN.m.table.avg(EN.f.eur(509))).toBe('avg €5.09/yr');
    expect(EN.f.date('2026-11-13T05:04:21Z')).toBe('13 Nov 2026');
    expect(EN.f.date('2026-09-01')).toBe('1 Sep 2026');
    expect(EN.f.dateTime('2026-11-13T05:04:21Z')).toBe('13 Nov 2026, 05:04 UTC');
    expect(EN.f.decimal(7.7)).toBe('7.7');
    expect(EN.f.amount(290, 'USD')).toBe('US$2.90');
  });

  it('English money input: dot decimals, comma groups; German input is invalid', () => {
    expect(EN.f.parseEuro('6')).toBe(600);
    expect(EN.f.parseEuro('6.5')).toBe(650);
    expect(EN.f.parseEuro(' 1,234.50 € ')).toBe(123450);
    expect(EN.f.parseEuro('')).toBeNull();
    expect(EN.f.parseEuro('6,50')).toBeUndefined();
    expect(EN.f.euroInput(650)).toBe('6.50');
  });

  it('values, filters and sort labels in English', () => {
    const col = (id: string) => COLUMN_BY_ID.get(id)!;
    expect(formatValue(EN, col('min_term_months'), 0)).toBe('no minimum term');
    expect(formatValue(EN, col('ssl_free'), true)).toBe('yes');
    expect(formatValue(EN, col('dns_editor'), 'paid')).toBe('paid');
    expect(formatValue(DE, col('dns_editor'), 'paid')).toBe('kostenpflichtig');
    expect(pickLabel(EN, 'paid')).toBe('paid');
    expect(pickLabel(DE, 'paid')).toBe('kostenpflichtig');
    // provider quotes of paid features: marked when the quote's language is not the page's
    expect(DE.m.quote.statement('Preis je Jahr', 'de')).toBe('„Preis je Jahr“');
    expect(DE.m.quote.statement('per year', 'en')).toEqual(['„', { en: 'per year' }, '“']);
    expect(EN.m.quote.statement('per year', 'en')).toBe('“per year”');
    expect(EN.m.quote.statement('je Jahr', 'de')).toEqual(['“', { de: 'je Jahr' }, '”']);
    expect(formatValue(EN, col('whois_privacy'), 'n/a')).toBe('not applicable');
    expect(formatValue(EN, col('year1'), null)).toBe('n/a');
    expect(pickLabel(EN, 'nein')).toBe('no');
    expect(pickLabel(DE, 'nein')).toBe('nein');
    expect(
      filterValueText(EN, col('notice_days'), { kind: 'range', min: 14, max: 30, na: false }),
    ).toBe('14 days to 30 days, without n/a');
    const state = { ...defaultState({ tlds: ['de'] }), sort: 'sum_5y', dir: 'desc' as const };
    expect(sortLabel(EN, state)).toBe('Total 5 yrs descending');
    expect(sortLabel(DE, state)).toBe('Summe 5 J. absteigend');
  });
});

describe('paths', () => {
  it('German at the root, English under /en/ with the same path', () => {
    expect(langOf('/')).toBe('de');
    expect(langOf('/methodik/')).toBe('de');
    expect(langOf('/en/')).toBe('en');
    expect(langOf('/en/tld/de/')).toBe('en');
    expect(langOf('/english/')).toBe('de');
    expect(pathIn('en', '/')).toBe('/en/');
    expect(pathIn('en', '/tld/de/')).toBe('/en/tld/de/');
    expect(pathIn('de', '/en/tld/de/')).toBe('/tld/de/');
    expect(pathIn('de', '/en/')).toBe('/');
    expect(pathIn('en', '/en/portfolio/')).toBe('/en/portfolio/');
  });
});

describe('English payload', () => {
  const payload = buildPayload(data, { today: '2026-11-15', locale: LOCALES.en });
  const german = buildPayload(data, { today: '2026-11-15' });

  it('has the same rows and values as the German one: only texts differ', () => {
    expect(payload.rows).toEqual(german.rows);
    expect(Object.keys(payload.notes).sort()).toEqual(Object.keys(german.notes).sort());
  });

  it('German data text is quoted verbatim and marked lang="de"', () => {
    const promo = payload.notes[notePromo('alpha/de')];
    expect(Array.isArray(promo)).toBe(true);
    expect(promo).toContainEqual({ de: 'nur für Neukunden' });
    const country = payload.notes[noteCountry('echo')];
    expect(country).toEqual([
      'Note (German): ',
      { de: 'Rechnung über Echo Names Europe (IE) mit USt.' },
    ]);
    // German pages: plain strings, as before
    expect(typeof german.notes[notePromo('alpha/de')]).toBe('string');
    expect(german.notes[noteCountry('echo')]).toBe('Rechnung über Echo Names Europe (IE) mit USt.');
  });

  it('promo conditions stay verbatim, including a closing full stop (Archiv-Issue 108 review)', () => {
    const note = siteEn.notes.promo('Nur für Neukunden.', '13 Nov 2026');
    expect(note).toEqual([
      'Promotional price in the first year. Conditions (provider’s wording, German): “',
      { de: 'Nur für Neukunden.' },
      '” Valid until 13 Nov 2026. From year 2 the renewal price applies.',
    ]);
    expect(siteEn.notes.promo('nur für Neukunden', null)).toEqual([
      'Promotional price in the first year. Conditions (provider’s wording, German): “',
      { de: 'nur für Neukunden' },
      '”. The end of the promotion is not stated. From year 2 the renewal price applies.',
    ]);
    // German: the condition is part of the sentence, as before
    expect(siteDe.notes.promo('Nur für Neukunden.', '13.11.2026')).toContain(
      'Bedingungen: Nur für Neukunden.',
    );
  });

  it('TLD page lead: one date or a range', () => {
    expect(siteEn.pages.tld.lead('de', 1, '13 Nov 2026', '13 Nov 2026')).toContain(
      '1 provider for .de. Data as of 13 Nov 2026.',
    );
    expect(siteEn.pages.tld.lead('de', 2, '13 Nov 2026', '15 Nov 2026')).toContain(
      '2 providers for .de. Data from 13 Nov 2026 to 15 Nov 2026.',
    );
  });

  it('country names in English', () => {
    expect(payload.providers['echo']?.countryName).toBe('United States');
    expect(german.providers['echo']?.countryName).toBe('Vereinigte Staaten');
  });

  it('terms notes: German text behind an English preface', () => {
    const id = noteTerms('foxtrot', 'notice_period_days');
    expect(typeof german.notes[id]).toBe('string');
    expect(payload.notes[id]).toEqual(['Note (German): ', { de: german.notes[id] }]);
  });
});
