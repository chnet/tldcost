// chnet.domains (the portal operator's own offer, docs/pages/methodik.md "Eigenes Angebot des
// Betreibers"): the public price list https://chnet.domains/preise/ (static HTML, one table, 124
// TLDs on 2026-11-25). robots.txt allows everything („User-agent: * / Allow: /“). Collected under
// the same rules as every other provider: one request for robots.txt, one for the list.
//
// The lead paragraph states the basis of every amount: „Preis pro Domain und Jahr, inklusive 19 %
// USt.“ The list shows one yearly price and no setup fee or separate renewal price: the price is
// year1, year1_regular and renewal, setup 0 (docs/research/providers.md, chnet.domains: setup fee
// none shown; AGB § 4 Abs. 1: the current list price applies to every renewal).
//
// A row may carry the mark „§ Besondere Vergabebedingungen“: the registry sets extra requirements
// (footnote: „zum Beispiel einen Sitz in der EU oder einen Bezug zur Region“), not a different
// price. Any other mark or row layout throws (fail closed).
//
// Only the TLDs listed below are written: the offers that existed before this adapter. A further
// TLD from the list (e.g. .at, .ch, .berlin) needs a maintainer decision first and is skipped
// with that reason. TLDs with a minimum term of 24 months (AGB § 5 Abs. 1: .gr, .nu, .tk) are
// skipped as well, because the list states a price per year only.
import { evidenceHash } from '../evidence.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const CHNET_DOMAINS_SOURCE_URL = 'https://chnet.domains/preise/';

/** TLDs with an offer file (data/offers/chnet-domains/), the only ones written. */
export const LISTED_TLDS: readonly string[] = [
  'app',
  'biz',
  'cloud',
  'com',
  'de',
  'dev',
  'eu',
  'info',
  'io',
  'net',
  'online',
  'org',
  'shop',
  'xyz',
];
export const NOT_LISTED =
  'not listed for chnet.domains yet: adding a TLD needs a maintainer decision';
/** Minimum term 24 months (AGB § 5 Abs. 1); the list states a price per year only. */
export const TWO_YEAR_TLDS: readonly string[] = ['gr', 'nu', 'tk'];
export const TWO_YEAR =
  'minimum term 24 months (AGB § 5 Abs. 1), the list states a price per year only';

const TABLE = /<table class="cd-pl-table"[^>]*>([\s\S]*?)<\/table>/g;
const ROW = /<tr(?: data-tld="([^"]*)" data-cat="[^"]*")?>([\s\S]*?)<\/tr>/g;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/g;
const LABEL = /^\.([a-z0-9-]+)( § Besondere Vergabebedingungen)?$/;
const EURO = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2}) €$/;
const BASIS_NOTE = 'Preis pro Domain und Jahr, inklusive 19 % USt.';
const HEADER = 'Endung|Kategorie|Preis pro Jahr|Kündigungsfrist';

/** Tags removed, entities and whitespace normalised. */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** "5,50 €" / "1.234,00 €" -> cents (gross). Throws on anything else. */
export function parsePrice(cell: string): number {
  const m = EURO.exec(cell);
  if (!m) throw new RangeError(`unexpected price text ${JSON.stringify(cell)}`);
  return toCents(`${(m[1] as string).replace(/\./g, '')}.${m[2] as string}`);
}

export interface ChnetDomainsRow {
  tld: string;
  /** Marked „§ Besondere Vergabebedingungen“ (registry requirements, not a price condition). */
  specialTerms: boolean;
  yearly: string;
}

/**
 * Rows of the price table. Throws when the table, its header, the price basis note or a row is not
 * as expected.
 */
export function parseTable(html: string): ChnetDomainsRow[] {
  const tables = [...html.matchAll(TABLE)];
  if (tables.length !== 1) throw new Error(`expected one price table, found ${tables.length}`);
  if (!text(html).includes(BASIS_NOTE)) throw new Error('price basis note not found');
  const table = (tables[0] as RegExpMatchArray)[1] as string;
  const matched = [...table.matchAll(ROW)];
  // a <tr> that ROW does not match (e.g. a new attribute) must not vanish silently
  const opened = table.match(/<tr\b/g)?.length ?? 0;
  if (opened !== matched.length) {
    throw new Error(`found ${opened} <tr> but parsed ${matched.length} rows`);
  }
  const rows: ChnetDomainsRow[] = [];
  let header: string | undefined;
  for (const [, dataTld, body] of matched) {
    const cells = [...(body as string).matchAll(CELL)].map((c) => ({
      kind: c[1],
      text: text(c[2] as string),
    }));
    if (dataTld === undefined && cells.length > 0 && cells.every((c) => c.kind === 'h')) {
      header = cells.map((c) => c.text).join('|');
      continue;
    }
    const label = LABEL.exec(cells[0]?.text ?? '');
    const tld = label?.[1];
    if (!tld || tld !== dataTld || cells.length !== 4) {
      throw new Error(`unexpected row ${JSON.stringify(text(body as string).slice(0, 80))}`);
    }
    if (rows.some((r) => r.tld === tld)) throw new Error(`duplicate row .${tld}`);
    rows.push({
      tld,
      specialTerms: label?.[2] !== undefined,
      yearly: (cells[2] as { text: string }).text,
    });
  }
  if (header !== HEADER) throw new Error(`unexpected table header ${JSON.stringify(header)}`);
  return rows;
}

export const chnetDomains: Adapter = {
  id: 'chnet-domains',
  async fetch(ctx) {
    const res = await ctx.http.get(CHNET_DOMAINS_SOURCE_URL, 'text/html');
    const fetchedAt = isoSeconds(ctx.now());
    const rows = parseTable(res.text);
    const hash = evidenceHash(res.bytes);
    const result = newResult();
    for (const tld of ctx.tlds) {
      if (TWO_YEAR_TLDS.includes(tld)) {
        result.skipped.push({ tld, reason: TWO_YEAR });
        continue;
      }
      const row = rows.find((r) => r.tld === tld);
      if (!row) {
        result.notOffered.push(tld);
        continue;
      }
      if (!LISTED_TLDS.includes(tld)) {
        result.skipped.push({ tld, reason: NOT_LISTED });
        continue;
      }
      let yearly;
      try {
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
          setup: 0,
          year1: yearly,
          year1_regular: yearly,
          renewal: yearly,
          term_years: 1,
          renewal_term_years: 1,
        },
        promo: null,
        evidence: {
          source_url: CHNET_DOMAINS_SOURCE_URL,
          fetched_at: fetchedAt,
          method: 'scrape',
          evidence_hash: hash,
          // as in the offers before this adapter; the renewal price is the current list price
          // (AGB § 4 Abs. 1, see the header comment)
          confidence: 'high',
        },
      });
    }
    return result;
  },
};
