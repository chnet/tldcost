// united-domains: the public price list https://www.united-domains.de/domain-registrieren/preisliste/
// (server-rendered HTML; ~780 TLD rows in the section "Alle Top-Level-Domains", followed by sections
// for add-on products and the footnotes). robots.txt allows the page; the AGB (Stand September
// 2025) have no clause on automated access (checked 2026-11-15). One request per run.
//
// A TLD row shows one price and a unit: "/Jahr" (regular price, every year) or "/1. Jahr" with a
// footnote number (first-year promo). The footnote states the promo and the follow-up price, e.g.
// ".de-Aktion: 5 € (inkl. 19 % MwSt.) im ersten Jahr für Neuregistrierungen von .de-Domains. Ab dem
// 2. Jahr 19 € (inkl. 19 % MwSt.) / Jahr. Vertragslaufzeit mind. 12 Monate." -> year1 = the row
// price, renewal = the "Ab dem 2. Jahr" price, promo.conditions = the footnote verbatim. The list
// names no regular first-year price during a promo (year1_regular null), no transfer price
// (transfer_in null) and no end date (valid_until null). Gross with no setup fee, per the note under
// the list: "In den Preisen ist die Mehrwertsteuer (MwSt.) in Höhe von 19 % enthalten. Es fallen
// keine Einrichtungsgebühren an." Labels like ".de + WordPress" (bundle) are ignored (Methodik criterion, Archiv-Issue 87).
//
// The page shows gross prices for the visitor's country, detected on the server; there is no public
// country or VAT selection ("Sollte es uns nicht möglich sein, Ihr Land zu identifizieren, zeigen
// wir in der Regel den Preis inklusive der deutschen Mehrwertsteuer als Orientierung.",
// /mwst-hinweis/). The inline UdFrontendConfig must therefore say LOCALE de_DE and VAT_RATE 1.19,
// besides the 19 % note: any other country's prices throw instead of being written.
//
// Fail closed: an unknown page or section layout, a duplicate TLD label or a row whose structure
// is not as expected throws; a price or footnote a requested TLD cannot be read from fails that TLD.
import { evidenceHash } from '../evidence.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const UD_PRICE_LIST = 'https://www.united-domains.de/domain-registrieren/preisliste/';

/**
 * TLDs with a multi-year minimum registration where the list does not say whether its price is per
 * year or per term (.ai: 2-year minimum at the registry). Left out until checked by hand.
 */
const UNVERIFIED_TERM = new Set(['ai']);

export const VAT_NOTE = 'In den Preisen ist die Mehrwertsteuer (MwSt.) in Höhe von 19 % enthalten.';
export const NO_SETUP_NOTE = 'Es fallen keine Einrichtungsgebühren an.';

const FRONTEND_CONFIG = /<script>var UdFrontendConfig = (\{.*?\});\s*(?:var |<\/script>)/g;

/** Throws unless the page's inline UdFrontendConfig is the German one (LOCALE de_DE, VAT 19 %). */
export function checkGermanVat(html: string): void {
  const configs = [...html.matchAll(FRONTEND_CONFIG)];
  if (configs.length !== 1) {
    throw new Error(`expected one UdFrontendConfig, found ${configs.length}: layout changed`);
  }
  let config: { LOCALE?: unknown; VAT_RATE?: unknown };
  try {
    config = JSON.parse(configs[0]?.[1] as string) as typeof config;
  } catch {
    throw new Error('UdFrontendConfig is not JSON: layout changed');
  }
  if (config.LOCALE !== 'de_DE' || config.VAT_RATE !== 1.19) {
    throw new Error(
      `not the German price display (LOCALE ${JSON.stringify(config.LOCALE)}, ` +
        `VAT_RATE ${JSON.stringify(config.VAT_RATE)}): country detection changed the prices`,
    );
  }
}

const SECTION_START = '<div class="mol-price-list__rows mol-price-list--tlds">';
const NEXT_SECTION = '<div class="mol-price-list__rows';
const ROW_START = /(?=<div\s+class="mol-price-list__row"\s)/;
const IS_ROW = /^<div\s+class="mol-price-list__row"\s/;
const NAME = /class="\s*mol-price-list__row-cell\s+mol-price-list__row-name\s*">([\s\S]*?)<\/div>/g;
const NUMBER = /<span class="mol-price-list__row-price-number">([^<]*)<\/span>/g;
const UNIT = /<span class="mol-price-list__row-price-unit">([\s\S]*?)<\/span>/g;
const FOOTNOTE = /<div class="footnote">\s*<sup>(\d+)<\/sup>([\s\S]*?)<\/div>/g;

const decode = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;|&#160;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&');

/** Comments and tags removed (inline markup: no space added), entities and whitespace normalised. */
export const plain = (html: string): string =>
  decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** "5 €" -> 500, "1.019 €" -> 101900, "7,50 €" -> 750. Throws on anything else. */
export function euroCents(text: string): number {
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))? ?€$/.exec(text.trim());
  if (!m) throw new RangeError(`not a euro price: ${JSON.stringify(text)}`);
  return Number((m[1] as string).replaceAll('.', '')) * 100 + Number(m[2] ?? '0');
}

export interface UdRow {
  /** Full label without the leading dot, lower case (".com.de" -> "com.de", IDN as punycode). */
  tld: string;
  /** Price text as shown ("5 €", "unverbindlich"). */
  price: string;
  /** data-price attribute (whole euros), for the cross-check. */
  dataPrice: string | null;
  /** Unit text without the footnote ("/Jahr", "/1. Jahr"), null when the row shows none. */
  unit: string | null;
  /** Footnote number on the unit, if any. */
  footnote: string | null;
}

/** The TLD rows. Throws when the section, a row or a label is not as expected. */
export function parseRows(html: string): Map<string, UdRow> {
  const start = html.indexOf(SECTION_START);
  if (start < 0 || html.indexOf(SECTION_START, start + 1) >= 0) {
    throw new Error('expected exactly one TLD section in the price list: layout changed');
  }
  const body = start + SECTION_START.length;
  const end = html.indexOf(NEXT_SECTION, body);
  const section = html.slice(body, end < 0 ? undefined : end);
  const chunks = section.split(ROW_START).filter((c) => IS_ROW.test(c));
  const names = [...section.matchAll(NAME)].length;
  if (chunks.length === 0) throw new Error('no TLD rows found: layout changed');
  if (names !== chunks.length) {
    throw new Error(`${names} TLD labels in ${chunks.length} rows: row layout changed`);
  }
  const rows = new Map<string, UdRow>();
  for (const chunk of chunks) {
    const name = [...chunk.matchAll(NAME)];
    const label = name.length === 1 ? plain(name[0]?.[1] as string) : '';
    const tld = /^\.(\S+)$/.exec(label)?.[1]?.toLowerCase();
    const numbers = [...chunk.matchAll(NUMBER)];
    const units = [...chunk.matchAll(UNIT)];
    if (name.length !== 1 || !tld || numbers.length !== 1 || units.length > 1) {
      throw new Error(`unexpected TLD row ${JSON.stringify(plain(chunk).slice(0, 80))}`);
    }
    if (rows.has(tld)) throw new Error(`duplicate TLD label .${tld}`);
    const unitHtml = (units[0]?.[1] as string | undefined) ?? null;
    rows.set(tld, {
      tld,
      price: plain(numbers[0]?.[1] as string),
      dataPrice: /\bdata-price="([^"]*)"/.exec(chunk)?.[1] ?? null,
      unit: unitHtml === null ? null : plain(unitHtml.replace(/<sup>[\s\S]*?<\/sup>/g, '')),
      footnote: unitHtml === null ? null : (/<sup>(\d+)<\/sup>/.exec(unitHtml)?.[1] ?? null),
    });
  }
  return rows;
}

/** Footnote number -> text (verbatim, whitespace normalised). Throws on a duplicate number. */
export function parseFootnotes(html: string): Map<string, string> {
  const notes = new Map<string, string>();
  for (const [, n, text] of html.matchAll(FOOTNOTE)) {
    if (notes.has(n as string)) throw new Error(`duplicate footnote ${n as string}`);
    notes.set(n as string, plain(text as string));
  }
  return notes;
}

export interface UdPromo {
  /** Follow-up price from year 2 on. */
  renewal: number;
  conditions: string;
}

/** Reads a promo footnote for `tld` whose first-year price must be `year1`. Throws if it does not fit. */
export function parsePromo(note: string, tld: string, year1: number): UdPromo {
  const head = new RegExp(
    // some footnotes drop the dot ("si-Aktion: …")
    `^\\.?${tld.replaceAll('.', '\\.')}-Aktion: (\\S+ €) \\(inkl\\. 19 % MwSt\\.\\)(?: €)? im ersten Jahr `,
  ).exec(note);
  if (!head) throw new Error(`footnote is not a first-year promo for .${tld}`);
  if (euroCents(head[1] as string) !== year1) {
    throw new Error(`footnote price ${head[1] as string} differs from the list price`);
  }
  const next = [...note.matchAll(/Ab dem 2\. Jahr (\S+) ?€/g)];
  if (next.length !== 1) throw new Error('footnote without one follow-up price "Ab dem 2. Jahr"');
  if (note.length > 500) throw new Error('footnote longer than 500 characters');
  return { renewal: euroCents(`${next[0]?.[1] as string} €`), conditions: note };
}

export const unitedDomains: Adapter = {
  id: 'united-domains',
  async fetch(ctx) {
    const res = await ctx.http.get(UD_PRICE_LIST, 'text/html');
    const fetchedAt = isoSeconds(ctx.now());
    const text = plain(res.text);
    for (const note of [VAT_NOTE, NO_SETUP_NOTE]) {
      if (!text.includes(note)) throw new Error(`price list without "${note}": layout changed`);
    }
    checkGermanVat(res.text);
    const rows = parseRows(res.text);
    const footnotes = parseFootnotes(res.text);
    const hash = evidenceHash(res.bytes);
    const result = newResult();
    for (const tld of ctx.tlds) {
      const row = rows.get(tld);
      if (!row) {
        result.notOffered.push(tld);
        continue;
      }
      if (UNVERIFIED_TERM.has(tld)) {
        result.skipped.push({
          tld,
          reason: 'multi-year minimum term, per-year vs per-term price not verified',
        });
        continue;
      }
      let year1: number;
      let promo: UdPromo | null = null;
      try {
        year1 = euroCents(row.price);
        if (row.dataPrice === null || Number(row.dataPrice) * 100 !== year1) {
          throw new Error(`data-price ${JSON.stringify(row.dataPrice)} differs from ${row.price}`);
        }
        if (row.unit === '/1. Jahr' && row.footnote !== null) {
          const note = footnotes.get(row.footnote);
          if (note === undefined) throw new Error(`footnote ${row.footnote} missing`);
          promo = parsePromo(note, tld, year1);
        } else if (row.unit !== '/Jahr' || row.footnote !== null) {
          throw new Error(`unknown unit ${JSON.stringify(row.unit)} (footnote ${row.footnote})`);
        }
      } catch (err) {
        result.failed.push({ tld, reason: (err as Error).message });
        continue;
      }
      result.offers.push({
        tld,
        currency: 'EUR',
        vat_included: true,
        price: {
          unit: 'year',
          setup: 0,
          year1,
          // during a promo the list names no regular first-year price
          year1_regular: promo ? null : year1,
          renewal: promo ? promo.renewal : year1,
          term_years: 1,
          renewal_term_years: 1,
          // no transfer price in the list (footnotes only say whether the promo applies)
          transfer_in: null,
        },
        promo: promo ? { conditions: promo.conditions, valid_until: null } : null,
        evidence: {
          source_url: UD_PRICE_LIST,
          fetched_at: fetchedAt,
          method: 'scrape',
          evidence_hash: hash,
          confidence: 'high',
        },
      });
    }
    return result;
  },
};
