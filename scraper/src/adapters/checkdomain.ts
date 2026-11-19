// checkdomain: the domain data embedded in https://www.checkdomain.de/domains/ (`window.tldList`,
// one entry per TLD with the monthly price, setup, contract period and the current promo), checked
// against the public price list https://www.checkdomain.de/agb/preisliste/ („Preise und
// Kündigungsfristen“). robots.txt has no Disallow; the AGB (PDF as of 23.10.2024) have no clause on
// automated access (checked 2026-11-15). Both pages are ISO-8859-1; the TLD pages (below) are UTF-8.
//
// Owner rule (Archiv-Issue 75): domains are sold on their own, each TLD as its own contract with its own minimum
// term and notice period (price list); no base fee besides the price list. Hosting is optional
// („Und natürlich kannst du bei uns auch das Domainhosting buchen!“, /de-domain/).
//
// Mapping: gross („*Preise sind inkl. 19% MwSt. (Deutschland)“), per month as displayed („Preis /
// Monat“), billed 12 months in advance (`unit: month`). A promo („Die .de-Domain kostet im ersten
// Jahr nur 0,07EUR/Monat, danach 1,49EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde.“)
// goes to year1 with the hint as condition, only when the hint names this TLD and both of its
// amounts match the price data. When the hint in the domain data does not match, the footnote of the
// TLD's own page (the evidence source_url) is read instead: its hint is taken when it matches
// (seen for .com: domain data "danach 2,19", price list, domain price and page footnote 2,39). A
// hint that names another TLD with exactly this TLD's amounts (seen for .at: „Die .de-Domain kostet
// … 0,49 … 2,99“ in both sources) states no promo for this TLD: the regular price applies, with a
// warning, but only when the TLD page has such a hint too (a page without one may be a new layout).
// Anything else fails the TLD, naming what the page said. evidence_hash stays the hash of the domain
// data (prices and promo amounts); a hint taken from the TLD page is named in the run warnings. Every TLD must match the price list in
// price, setup and minimum term, or it fails. TLDs with a minimum term other than 12 months (.ai: 24)
// are skipped: the payment per term with a first-year promo inside it is not stated.
import { evidenceHash } from '../evidence.js';
import type { HttpResponse } from '../http.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const CHECKDOMAIN_ENDPOINT = 'https://www.checkdomain.de/domains/';
export const CHECKDOMAIN_PRICE_LIST = 'https://www.checkdomain.de/agb/preisliste/';

const VAT_NOTE = '*Preise sind inkl. 19% MwSt. (Deutschland)';
const HEADER =
  'Domainendung|Kündigungsfrist|Mindestlaufzeit / Abrechnungszeitraum|Einrichtung|Preis / Monat';
const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/g;
const ROW = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/g;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/g;
// "/de-domain/" for .de; second-level TLDs as "/nz-domain/ac/" for .ac.nz
const HREF =
  /^ data-href="(https:\/\/www\.checkdomain\.de\/([a-z0-9-]+)-domain\/(?:([a-z0-9-]+)\/)?)"$/;
const EURO = /^(\d+),(\d{2}) €\*$/;
const MONTHS = /^(\d+) Monate$/;
const HINT_TEXT =
  /Die \.([a-z0-9.-]+)-Domain kostet im ersten Jahr nur (\d+),(\d{2})EUR\/Monat, danach (\d+),(\d{2})EUR\/Monat\. Das Angebot ist limitiert auf 1 Domain pro Kunde\./;
const HINT = new RegExp(`^${HINT_TEXT.source}$`);
const FOOTNOTES = /<ol data-app-main-footnotes-list>([\s\S]*?)<\/ol>/g;

/** Body as text: ISO-8859-1 when the response says so, else UTF-8. */
export function decode(res: Pick<HttpResponse, 'contentType' | 'bytes' | 'text'>): string {
  return /charset=iso-8859-1/i.test(res.contentType)
    ? new TextDecoder('latin1').decode(res.bytes)
    : res.text;
}

/** Tags removed, soft hyphens dropped, entities and whitespace normalised. */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&shy;|\u00ad/g, '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** "1,49 €*" -> 149 (gross, footnote *). Throws on anything else. */
export function parseEuro(cell: string): number {
  const m = EURO.exec(cell);
  if (!m) throw new RangeError(`unexpected price text ${JSON.stringify(cell)}`);
  return toCents(`${m[1] as string}.${m[2] as string}`);
}

export interface ListRow {
  tld: string;
  /** The TLD's own page, linked from the row. */
  url: string;
  minTerm: string;
  setup: string;
  monthly: string;
}

/** Rows of the domain table of the price list. Throws when its layout or the VAT note changes. */
export function parsePriceList(html: string): Map<string, ListRow> {
  if (!text(html).includes(VAT_NOTE)) throw new Error('VAT note (gross prices) not found');
  const tables = [...html.matchAll(TABLE)].filter((t) =>
    text(t[1] as string).startsWith('Domainendung'),
  );
  if (tables.length !== 1) throw new Error(`expected one domain table, found ${tables.length}`);
  const rows = new Map<string, ListRow>();
  let header: string | undefined;
  for (const [, attrs, body] of (tables[0] as RegExpMatchArray)[1]!.matchAll(ROW)) {
    const cells = [...(body as string).matchAll(CELL)].map((c) => ({
      kind: c[1],
      text: text(c[2] as string),
    }));
    if (cells.length > 0 && cells.every((c) => c.kind === 'h')) {
      header = cells.map((c) => c.text).join('|');
      continue;
    }
    const href = HREF.exec(attrs as string) ?? [];
    const tld = href[3] ? `${href[3]}.${href[2] as string}` : (href[2] as string);
    // five cells, the first one the TLD of the row link
    if (cells.length !== 5 || (cells[0] as { text: string }).text.toLowerCase() !== tld) {
      throw new Error(`unexpected row ${JSON.stringify(text(body as string).slice(0, 80))}`);
    }
    if (rows.has(tld)) throw new Error(`duplicate TLD .${tld} in the price list`);
    rows.set(tld, {
      tld,
      url: href[1] as string,
      minTerm: (cells[2] as { text: string }).text,
      setup: (cells[3] as { text: string }).text,
      monthly: (cells[4] as { text: string }).text,
    });
  }
  if (header !== HEADER) throw new Error(`unexpected table header ${JSON.stringify(header)}`);
  return rows;
}

export interface TldEntry {
  tld: string;
  price: number;
  setup?: number;
  contractPeriod?: number;
  discount?: { price: number; hint?: unknown };
}

/** `window.tldList` of /domains/ by TLD. Throws when it or the default contract period changes. */
export function parseTldList(html: string): Map<string, TldEntry> {
  const list = [...html.matchAll(/window\.tldList = (\[.*\])\n/g)];
  if (list.length !== 1) throw new Error(`expected one tldList, found ${list.length}`);
  const defaults = /window\.articleDefaults = (\{.*\})\n/.exec(html);
  const contractPeriod = defaults
    ? (JSON.parse(defaults[1] as string) as { contractPeriod?: unknown }).contractPeriod
    : undefined;
  // entries without contractPeriod rely on this default
  if (contractPeriod !== 12) {
    throw new Error(`unexpected default contract period ${JSON.stringify(contractPeriod)}`);
  }
  const entries = JSON.parse((list[0] as RegExpMatchArray)[1] as string) as TldEntry[];
  const map = new Map<string, TldEntry>();
  for (const e of entries) {
    if (map.has(e.tld)) throw new Error(`duplicate TLD .${e.tld} in the domain data`);
    map.set(e.tld, e);
  }
  return map;
}

/** Cents of a tldList amount; throws unless it is a plain decimal. */
const cents = (value: unknown, what: string): number => {
  if (typeof value !== 'number') throw new RangeError(`${what} is not a number`);
  return toCents(value);
};

export interface Hint {
  /** The hint, whitespace normalised. */
  text: string;
  /** The TLD the hint names. */
  tld: string;
  promo: number;
  regular: number;
}

/** A promo hint in the known wording, or null. */
export function parseHint(hint: string): Hint | null {
  const text = hint.replace(/\s+/g, ' ').trim();
  const m = HINT.exec(text);
  if (!m) return null;
  return {
    text,
    tld: m[1] as string,
    promo: toCents(`${m[2] as string}.${m[3] as string}`),
    regular: toCents(`${m[4] as string}.${m[5] as string}`),
  };
}

/** The promo hint, checked against the TLD and the amounts; returns the normalised text. */
export function checkHint(tld: string, promo: number, regular: number, hint: unknown): string {
  if (typeof hint !== 'string') throw new Error('promo without a hint text');
  if (promo >= regular) throw new Error(`promo price ${promo} not below the regular ${regular}`);
  const h = parseHint(hint);
  if (h?.tld !== tld || h.promo !== promo || h.regular !== regular) {
    throw new Error(`promo hint does not match the price data: ${JSON.stringify(hint)}`);
  }
  return h.text;
}

/** The distinct promo hints in the footnote list of a TLD page (`<ol data-app-main-footnotes-list>`). */
export function pageHints(html: string): string[] {
  const hints = new Set<string>();
  for (const [, list] of html.matchAll(FOOTNOTES)) {
    for (const [hint] of text(list as string).matchAll(new RegExp(HINT_TEXT.source, 'g'))) {
      hints.add(hint);
    }
  }
  return [...hints];
}

export const checkdomain: Adapter = {
  id: 'checkdomain',
  async fetch(ctx) {
    const list = parsePriceList(decode(await ctx.http.get(CHECKDOMAIN_PRICE_LIST, 'text/html')));
    const res = await ctx.http.get(CHECKDOMAIN_ENDPOINT, 'text/html');
    const fetchedAt = isoSeconds(ctx.now());
    const tlds = parseTldList(decode(res));
    const hash = evidenceHash(res.bytes);
    const result = newResult();

    /**
     * Conditions of a promo: the hint of the domain data, else the one footnote hint of the TLD
     * page; undefined (regular price, warning) when every hint names another TLD with exactly
     * these amounts. Throws the domain data's mismatch otherwise.
     */
    const promoConditions = async (
      tld: string,
      promo: number,
      regular: number,
      hint: unknown,
      page: string,
    ): Promise<string | undefined> => {
      try {
        return checkHint(tld, promo, regular, hint);
      } catch (err) {
        // no hint text or no discount: nothing on the page can change that
        if (typeof hint !== 'string' || promo >= regular) throw err;
        let onPage: string[];
        try {
          onPage = pageHints(decode(await ctx.http.get(page, 'text/html')));
        } catch (pageErr) {
          throw new Error(`${(err as Error).message}; TLD page: ${(pageErr as Error).message}`, {
            cause: pageErr,
          });
        }
        if (onPage.length === 1) {
          try {
            const quoted = checkHint(tld, promo, regular, onPage[0]);
            result.warnings.push(
              `.${tld}: promo hint taken from ${page}; the domain data states ${JSON.stringify(hint)}`,
            );
            return quoted;
          } catch {
            // the page hint does not match either
          }
        }
        const other = [hint, ...onPage].map(parseHint);
        if (
          onPage.length > 0 &&
          other.every((h) => h && h.tld !== tld && h.promo === promo && h.regular === regular)
        ) {
          result.warnings.push(
            `.${tld}: promo hint names another TLD, regular price without the promo: ${JSON.stringify(hint)}`,
          );
          return undefined;
        }
        const said = onPage.length
          ? onPage.map((h) => JSON.stringify(h)).join(', ')
          : 'no promo hint';
        throw new Error(`${(err as Error).message}; TLD page: ${said}`, { cause: err });
      }
    };

    for (const tld of ctx.tlds) {
      const row = list.get(tld);
      const entry = tlds.get(tld);
      if (!row && !entry) {
        result.notOffered.push(tld);
        continue;
      }
      try {
        if (!row || !entry) {
          throw new Error(`only in the ${row ? 'price list' : 'domain data'}, not in both`);
        }
        const months = entry.contractPeriod ?? 12;
        const term = MONTHS.exec(row.minTerm);
        if (Number(term?.[1]) !== months) {
          throw new Error(`minimum term ${JSON.stringify(row.minTerm)} vs ${months} months`);
        }
        const monthly = cents(entry.price, 'price');
        const setup = entry.setup === undefined ? 0 : cents(entry.setup, 'setup');
        if (monthly !== parseEuro(row.monthly) || setup !== parseEuro(row.setup)) {
          throw new Error(
            `price data ${monthly}/${setup} vs price list ${JSON.stringify(row.monthly)}/${JSON.stringify(row.setup)}`,
          );
        }
        if (months !== 12) {
          result.skipped.push({
            tld,
            reason: `minimum term ${months} months: payment per term not stated`,
          });
          continue;
        }
        let year1 = monthly;
        let conditions: string | undefined;
        const discount = entry.discount;
        if (discount) {
          const promoPrice = cents(discount.price, 'promo price');
          // a "discount" at the regular price is no promo
          if (promoPrice !== monthly) {
            conditions = await promoConditions(tld, promoPrice, monthly, discount.hint, row.url);
            if (conditions) year1 = promoPrice;
          }
        }
        result.offers.push({
          tld,
          currency: 'EUR',
          vat_included: true,
          price: { unit: 'month', setup, year1, year1_regular: monthly, renewal: monthly },
          promo: conditions ? { conditions, valid_until: null } : null,
          evidence: {
            source_url: row.url,
            source_endpoint: CHECKDOMAIN_ENDPOINT,
            fetched_at: fetchedAt,
            method: 'scrape',
            evidence_hash: hash,
            // a promo hint states the price after year 1; without one, renewal is inferred
            confidence: conditions ? 'high' : 'medium',
          },
        });
      } catch (err) {
        result.failed.push({ tld, reason: (err as Error).message });
      }
    }
    return result;
  },
};
