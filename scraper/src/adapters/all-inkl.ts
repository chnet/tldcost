// ALL-INKL.COM: the public domain price list https://all-inkl.com/domains/preise (static HTML, one
// table, ~330 TLDs). robots.txt allows /domains*; the AGB (as of 25.08.2026) have no clause on
// automated access (checked 2026-11-15).
//
// Owner rule (Archiv-Issue 75): a provider's TLD only gets an offer if the domain can be ordered without another
// contract. ALL-INKL sells a domain-only "Domaintarif" for the rows marked `domain-tarif` (the
// default tab "Domain-Tarife"; the same TLDs as in the domain check of /domains). All other rows
// ("Alle Domains") are add-on domains: "Die Zusatzdomains lassen sich beliebig zu jedem unserer
// Webhosting- oder Server-Tarife hinzubuchen" (/webhosting/domains). Those are skipped with that
// reason, never written.
//
// Columns "Einrichtung" (one-time setup) and "Jahresgebühr" (yearly fee), gross: footnote "* Die
// Preise enthalten die gesetzliche Mehrwertsteuer in Höhe von 19%." The list shows one yearly fee
// and no separate renewal price: it is taken as year1 and renewal (confidence medium). Rows marked
// "**" are billed two years in advance ("Die Abrechnung für diese Domain erfolgt mit der Bestellung
// immer für 2 Jahre im Voraus."); per-year vs per-term is not stated, so they are skipped.
import { evidenceHash } from '../evidence.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const ALLINKL_SOURCE_URL = 'https://all-inkl.com/domains/preise';
export const ADDON_ONLY =
  'only as an add-on domain to a web hosting or server plan (owner rule, Archiv-Issue 75: no offer)';

const TABLE = /<table class="table-domains">([\s\S]*?)<\/table>/g;
const ROW = /<tr(?: class="([^"]*)")?>([\s\S]*?)<\/tr>/g;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/g;
const EU_LINK = /<a\b[^>]*\beu-price-popup\b[^>]*>[\s\S]*?<\/a>/g;
const EURO = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2}) €\*$/;
const VAT_NOTE = '* Die Preise enthalten die gesetzliche Mehrwertsteuer in Höhe von 19%.';
const HEADER = 'Endung|Land / Verwendung|Einrichtung|Jahresgebühr';

/** Tags removed, entities and whitespace normalised. */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** "9,90 €*" / "1.234,00 €*" -> cents (gross, footnote *). Throws on anything else. */
export function parsePrice(cell: string): number {
  const m = EURO.exec(cell);
  if (!m) throw new RangeError(`unexpected price text ${JSON.stringify(cell)}`);
  return toCents(`${(m[1] as string).replace(/\./g, '')}.${m[2] as string}`);
}

export interface AllinklRow {
  tld: string;
  /** Marked `domain-tarif`: orderable as a domain-only plan. */
  domainTariff: boolean;
  /** Marked "**" after the TLD: billed two years in advance. */
  twoYears: boolean;
  setup: string;
  yearly: string;
}

/** Rows of the price table. Throws when the table, its header or the VAT note is not as expected. */
export function parseTable(html: string): AllinklRow[] {
  const tables = [...html.matchAll(TABLE)];
  if (tables.length !== 1) throw new Error(`expected one price table, found ${tables.length}`);
  if (!text(html).includes(VAT_NOTE)) throw new Error('VAT note (gross prices) not found');
  const table = (tables[0] as RegExpMatchArray)[1] as string;
  const matched = [...table.matchAll(ROW)];
  // a <tr> that ROW does not match (e.g. a new attribute) must not vanish silently
  const opened = table.match(/<tr\b/g)?.length ?? 0;
  if (opened !== matched.length) {
    throw new Error(`found ${opened} <tr> but parsed ${matched.length} rows`);
  }
  const rows: AllinklRow[] = [];
  let header: string | undefined;
  for (const [, cls, body] of matched) {
    const cells = [...(body as string).matchAll(CELL)].map((c) => ({
      kind: c[1],
      text: text((c[2] as string).replace(EU_LINK, ' ')),
    }));
    if (cells.length > 0 && cells.every((c) => c.kind === 'h')) {
      header = cells.map((c) => c.text).join('|');
      continue;
    }
    // "<strong>.gr</strong>**" becomes ".gr **" once the tags are removed
    const label = /^\.([a-z0-9.-]+)(?: ?(\*\*))?$/.exec(cells[0]?.text ?? '');
    const tld = label?.[1];
    if (!tld || cells.length !== 4) {
      throw new Error(`unexpected row ${JSON.stringify(text(body as string).slice(0, 80))}`);
    }
    rows.push({
      tld,
      domainTariff: (cls ?? '').split(' ').includes('domain-tarif'),
      twoYears: label?.[2] === '**',
      setup: (cells[2] as { text: string }).text,
      yearly: (cells[3] as { text: string }).text,
    });
  }
  if (header !== HEADER) throw new Error(`unexpected table header ${JSON.stringify(header)}`);
  return rows;
}

export const allinkl: Adapter = {
  id: 'all-inkl',
  async fetch(ctx) {
    const res = await ctx.http.get(ALLINKL_SOURCE_URL, 'text/html');
    const fetchedAt = isoSeconds(ctx.now());
    const rows = parseTable(res.text);
    const hash = evidenceHash(res.bytes);
    const result = newResult();
    for (const tld of ctx.tlds) {
      const row = rows.find((r) => r.tld === tld);
      if (!row) {
        result.notOffered.push(tld);
        continue;
      }
      if (!row.domainTariff) {
        result.skipped.push({ tld, reason: ADDON_ONLY });
        continue;
      }
      if (row.twoYears) {
        result.skipped.push({
          tld,
          reason: 'billed two years in advance, per-year vs per-term price not stated',
        });
        continue;
      }
      let setup;
      let yearly;
      try {
        setup = parsePrice(row.setup);
        yearly = parsePrice(row.yearly);
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
          setup,
          year1: yearly,
          year1_regular: yearly,
          renewal: yearly,
          term_years: 1,
          renewal_term_years: 1,
        },
        promo: null,
        evidence: {
          source_url: ALLINKL_SOURCE_URL,
          fetched_at: fetchedAt,
          method: 'scrape',
          evidence_hash: hash,
          // one yearly fee, renewal not stated separately (see the header comment)
          confidence: 'medium',
        },
      });
    }
    return result;
  },
};
