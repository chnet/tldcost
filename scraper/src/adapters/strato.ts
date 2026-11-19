// STRATO: one public, server-rendered product page per TLD (https://www.strato.de/domains/<tld>-domain/)
// with a price card at the top: monthly price, "für 12 Monate" / "12 Monate nur" plus
// "danach X € /Mon." for a first-year price, "Einrichtung: X €", and the order button
// data-buy="STRATO_DOMAIN_<TLD>[_AKTION]_VLZ12" (VLZ12: 12-month contract term). The cards of other
// TLDs on the same page are ignored. Since 2026-11-19 the cards of TLDs without a setup fee have no
// "Einrichtung" line (.de: "danach 1 € /Mon." only); the setup fee is then taken from the row
// "Einrichtungsgebühr | 0 €" of the product table on the same page (header "TLD | .de" or
// "Domainendung | .com", both seen on 2026-11-19). Without both, the setup fee is taken from the
// domain list https://www.strato.de/domains/ (fetched once per run): the one 12-month entry
// (data-contract-duration="12") whose order button has the card's order code, e.g. ".net für 12
// Monate 0,90 €/Mon., danach 1,50 €/Mon., Einrichtung: 0 €". Entries listed twice with the same
// text count once; its prices must equal the card. The "Zusatz-Domains" entries (no order code) and
// the 1-month entries (code _VLZ1) never match. The run reports a warning that quotes the table row
// or the list entry. When card, table and list entry state different setup fees, or none states
// one, the TLD fails. The list also cross-checks TLDs whose fee comes from the card or the table
// (a TLD missing from the list is not checked). When the list cannot be fetched, only the TLDs
// that need it fail. A list that is fetched but cannot be read (an entry text of another form, two
// different entries for one order code, entry prices that differ from the card) fails every TLD
// with a list entry, also those whose fee comes from the card or the table (fail closed): a layout
// change of the list stops practically all STRATO TLDs until the adapter is adapted. A card line
// with "Einrichtung" in another form than "Einrichtung: X €" fails the TLD too. robots.txt only disallows /apps/ and /error/. The AGB (17.90)
// say nothing about automated access to the website. Domains are sold stand-alone (bundling rule
// Archiv-Issue 75 not affected): "Sobald sie im Warenkorb ist, können Sie die ausgewählte Domain kaufen.
// Optional kombinieren Sie Ihre neue Domain auch mit einer der STRATO Website-Lösungen" (domain-kaufen).
//
// Prices are gross ("Preise inkl. MwSt."), per month, for the 12-month billing period (the order
// page also offers 1 month at higher prices and a 10-30 € setup fee: not collected). Stored as
// `unit: month` like the page. A first-year price is year1, the "danach" price is the renewal.
// The card names no regular first-year price, so year1_regular is null during a promo (the
// "danach" price is the later price, not a stated first-year list price). The promo condition
// is quoted from the FAQ of the price overview (domain-kosten), which is fetched once per run;
// without that sentence a first-year price fails the TLD (fail closed). The `_AKTION` suffix is not
// used: .xyz, .berlin and .cloud show a first-year price without it. A TLD without a product page
// (HTTP 404) is not offered.
import { evidenceHash } from '../evidence.js';
import { HttpError } from '../http.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter, type ScrapedOffer } from '../types.js';

export const STRATO_OVERVIEW = 'https://www.strato.de/domains/domain-kosten/';
export const stratoPage = (tld: string): string => `https://www.strato.de/domains/${tld}-domain/`;
export const STRATO_DOMAIN_LIST = 'https://www.strato.de/domains/';

export const PROMO_NOTE =
  'Der Aktionspreis ist ein reduzierter Angebotspreis, der Ihnen als Neukunde meistens für die ersten 12 Monate gewährt wird.';
const GROSS_NOTE = 'Preise inkl. MwSt.';
const FIRST_YEAR = new Set(['für 12 Monate', '12 Monate nur']);

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "3,33" -> 333, "2" -> 200, "12,00" -> 1200. */
export function euroCents(text: string): number {
  const m = /^(\d+)(?:,(\d{2}))?$/.exec(text.trim());
  if (!m) throw new RangeError(`not a German euro price: ${JSON.stringify(text)}`);
  return Number(m[1]) * 100 + Number(m[2] ?? 0);
}

export interface StratoCard {
  /** Price shown now, cents per month. */
  current: number;
  /** "danach" price, cents per month; null when the card shows only one price. */
  after: number | null;
  /** First-year term as shown ("für 12 Monate" / "12 Monate nur"); null without a "danach" price. */
  term: string | null;
  setup: number;
  /** Where the setup fee was read (card line, product table row, domain list entry), with its text. */
  setupSource: { from: 'card' | 'table' | 'list'; text: string };
  /** The domain list for this TLD: its source, cross-check ok, no entry, or not fetched. */
  listCheck: 'source' | 'ok' | 'no entry' | 'not fetched';
}

/** The domain list page, or why it could not be fetched. */
export type DomainList = { html: string } | { error: string };

export interface ListEntry {
  current: number;
  after: number | null;
  setup: number;
  text: string;
}

const LIST_TEXT =
  /^\.([a-z0-9.-]+) (?:(?:für 12 Monate|12 Monate nur) )?(\S+) €\/Mon\.,(?: danach (\S+) €\/Mon\.,)? Einrichtung: (\S+) €$/;

/**
 * The 12-month entry of the domain list whose order button has the code `buy`; null when there is
 * none. Entries with the same text count once; entries with different text, or a text that is not
 * "<.tld> [term] X €/Mon., [danach Y €/Mon.,] Einrichtung: Z €", throw.
 */
export function listEntry(html: string, tld: string, buy: string): ListEntry | null {
  const texts = new Set(
    [
      ...html.matchAll(
        /(<div\b[^>]*\bdata-domain-infoBox\b[^>]*>)((?:(?!data-domain-infoBox)[\s\S])*?)<button\b[^>]*\bdata-buy="([^"]+)"/g,
      ),
    ]
      .filter((m) => m[3] === buy && /\bdata-contract-duration="12"/.test(m[1] as string))
      .map((m) => plain(m[2] as string)),
  );
  if (texts.size === 0) return null;
  if (texts.size > 1) {
    throw new Error(
      `${texts.size} different 12-month entries for ${buy} on ${STRATO_DOMAIN_LIST}: ${[...texts].map((t) => JSON.stringify(t)).join(', ')}`,
    );
  }
  const text = [...texts][0] as string;
  const m = LIST_TEXT.exec(text);
  if (!m || m[1] !== tld) {
    throw new Error(
      `unexpected entry for ${buy} on ${STRATO_DOMAIN_LIST}: ${JSON.stringify(text)}`,
    );
  }
  return {
    current: euroCents(m[2] as string),
    after: m[3] === undefined ? null : euroCents(m[3]),
    setup: euroCents(m[4] as string),
    text,
  };
}

const TABLE_SETUP = 'Einrichtungsgebühr';
const TABLE_HEADS = new Set(['TLD', 'Domainendung']);

/**
 * The "Einrichtungsgebühr" row of the product table of `tld` (a table whose header is exactly two
 * cells, "TLD" or "Domainendung", then ".<tld>"); null when the page has no such table. Throws when there are several such
 * tables, or the row is missing, doubled or not "<amount> €".
 */
export function tableSetup(html: string, tld: string): { cents: number; text: string } | null {
  const cellsOf = (row: string, tag: string) =>
    [...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) =>
      plain(m[1] as string),
    );
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)]
    .map((m) => m[1] as string)
    .filter((table) => {
      const head = cellsOf(table, 'th');
      return head.length === 2 && TABLE_HEADS.has(head[0] as string) && head[1] === `.${tld}`;
    });
  if (tables.length === 0) return null;
  if (tables.length > 1) {
    throw new Error(`expected 1 product table for .${tld}, found ${tables.length}`);
  }
  const rows = [...(tables[0] as string).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => cellsOf(m[1] as string, 'td'))
    .filter((cells) => cells[0] === TABLE_SETUP);
  if (rows.length !== 1) {
    throw new Error(
      `expected 1 "${TABLE_SETUP}" row in the .${tld} product table, found ${rows.length}`,
    );
  }
  const cells = rows[0] as string[];
  const amount = cells.length === 2 ? /^(\S+) €$/.exec(cells[1] as string)?.[1] : undefined;
  if (amount === undefined) {
    throw new Error(
      `"${TABLE_SETUP}" row ${JSON.stringify(cells.join(' | '))} is not "<amount> €"`,
    );
  }
  return { cents: euroCents(amount), text: `${TABLE_SETUP} | ${cells[1]}` };
}

/** The price card of `tld` on its product page. Throws when the card is missing or not as expected. */
export function parseCard(html: string, tld: string, list?: DomainList): StratoCard {
  if (!plain(html).includes(GROSS_NOTE)) {
    throw new Error(`page without "${GROSS_NOTE}": layout or VAT statement changed`);
  }
  const product = `STRATO_DOMAIN_${tld.toUpperCase()}`;
  const cards = [
    ...html.matchAll(
      /<div class="pricecard__plan">\.([a-z0-9-]+)<\/div>([\s\S]*?)data-buy="(STRATO_DOMAIN_[A-Z0-9_]+)"/g,
    ),
  ].filter((m) => m[1] === tld);
  if (cards.length !== 1)
    throw new Error(`expected 1 price card for .${tld}, found ${cards.length}`);
  const [, , body, buy] = cards[0] as unknown as [string, string, string, string];
  const code = new RegExp(`^${product}(?:_AKTION)?_VLZ(\\d+)$`).exec(buy);
  if (!code) throw new Error(`order code ${buy} is not a ${product} product`);
  if (code[1] !== '12') throw new Error(`contract term ${code[1]} months, expected 12`);

  const values = [
    ...body.matchAll(
      /<data value="(\d+(?:\.\d{1,2})?)">([\s\S]*?)<\/data>(?:<span class="pricecard__planprice__additionalinfo"[^>]*>([^<]*)<\/span>)?/g,
    ),
  ];
  if (values.length !== 1) throw new Error(`expected 1 price in the card, found ${values.length}`);
  const [, value, shown, unit] = values[0] as unknown as [string, string, string, string?];
  // the stored unit is month: a card priced per year (or without a unit) must not pass as monthly
  if (unit?.trim() !== '/Mon.')
    throw new Error(`card price unit "${unit ?? ''}", expected "/Mon."`);
  const current = Math.round(Number(value) * 100);
  const shownText = plain(shown);
  if (shownText !== `${euroText(current)} €`) {
    throw new Error(`shown price "${shownText}" differs from value ${value}`);
  }

  const termMatch = /<div class="pricecard__plantermcontract">([^<]*)<\/div>/.exec(body);
  const term = termMatch ? (termMatch[1] as string).trim() : undefined;
  const disclaimer = plain(
    /<div class="pricecard__plandisclaimer">([\s\S]*?)<\/div>/.exec(body)?.[1] ?? '',
  );
  const afterText = /danach (\S+) € \/Mon\./.exec(disclaimer)?.[1];
  if ((term === undefined) !== (afterText === undefined)) {
    throw new Error(
      `first-year term "${term ?? ''}" without a "danach" price, or the other way round`,
    );
  }
  if (term !== undefined && !FIRST_YEAR.has(term)) throw new Error(`unknown term "${term}"`);
  const after = afterText === undefined ? null : euroCents(afterText);
  if (after !== null && after < current) throw new Error('first-year price above the later price');

  // setup fee: card line, product table row, domain list entry; all that are there must agree
  const sources: { from: StratoCard['setupSource']['from']; cents: number; text: string }[] = [];
  const cardSetup = /Einrichtung: (\S+) €/.exec(disclaimer);
  if (!cardSetup && disclaimer.includes('Einrichtung')) {
    throw new Error(`card line ${JSON.stringify(disclaimer)} is not "Einrichtung: X €"`);
  }
  if (cardSetup) {
    sources.push({ from: 'card', cents: euroCents(cardSetup[1] as string), text: cardSetup[0] });
  }
  const table = tableSetup(html, tld);
  if (table) sources.push({ from: 'table', ...table });
  let listCheck: StratoCard['listCheck'] = 'not fetched';
  if (list && 'html' in list) {
    const entry = listEntry(list.html, tld, buy);
    listCheck = entry ? 'ok' : 'no entry';
    if (entry) {
      if (entry.current !== current || entry.after !== after) {
        throw new Error(
          `prices of the entry on ${STRATO_DOMAIN_LIST} (${JSON.stringify(entry.text)}) differ from the price card`,
        );
      }
      sources.push({ from: 'list', cents: entry.setup, text: entry.text });
    }
  }
  const first = sources[0];
  if (!first) {
    const why = list && 'error' in list ? `; ${STRATO_DOMAIN_LIST} not fetched: ${list.error}` : '';
    throw new Error(
      `setup fee missing: no "Einrichtung: X €" on the card, no .${tld} product table with "${TABLE_SETUP}" and no entry for ${buy} on ${STRATO_DOMAIN_LIST}${why}`,
    );
  }
  if (sources.some((x) => x.cents !== first.cents)) {
    throw new Error(
      `setup fees differ: ${sources.map((x) => `${x.from} ${JSON.stringify(x.text)}`).join(', ')}`,
    );
  }
  if (first.from === 'list') listCheck = 'source';
  return {
    current,
    after,
    term: term ?? null,
    setup: first.cents,
    setupSource: { from: first.from, text: first.text },
    listCheck,
  };
}

/** 333 -> "3,33", 200 -> "2", 1250 -> "12,50" (as the cards show it). */
function euroText(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
}

export function toOffer(
  tld: string,
  card: StratoCard,
  bytes: Uint8Array,
  fetchedAt: string,
): ScrapedOffer {
  const regular = card.after ?? card.current;
  const sale = card.current < regular;
  return {
    tld,
    currency: 'EUR',
    vat_included: true,
    price: {
      unit: 'month',
      setup: card.setup,
      year1: card.current,
      // only without a promo is the card price the regular first-year price
      year1_regular: sale ? null : regular,
      renewal: regular,
      // transfer price and transfer-out fee are not on the page (provider research)
      transfer_in: null,
    },
    promo: sale
      ? {
          conditions: `Aktionspreis „${card.term}“ laut Preiskarte. ${PROMO_NOTE}`,
          valid_until: null,
        }
      : null,
    evidence: {
      source_url: stratoPage(tld),
      fetched_at: fetchedAt,
      method: 'scrape',
      evidence_hash: evidenceHash(bytes),
      confidence: 'high',
    },
  };
}

export const strato: Adapter = {
  id: 'strato',
  async fetch(ctx) {
    const overview = await ctx.http.get(STRATO_OVERVIEW, 'text/html');
    const promoNote = plain(overview.text).includes(PROMO_NOTE);
    const result = newResult();
    let list: DomainList;
    try {
      list = { html: (await ctx.http.get(STRATO_DOMAIN_LIST, 'text/html')).text };
    } catch (err) {
      list = { error: (err as Error).message };
      result.warnings.push(`domain list not fetched: ${list.error} (${STRATO_DOMAIN_LIST})`);
    }
    for (const tld of ctx.tlds) {
      let res;
      try {
        res = await ctx.http.get(stratoPage(tld), 'text/html');
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
          result.notOffered.push(tld);
          continue;
        }
        throw err;
      }
      try {
        const card = parseCard(res.text, tld, list);
        ctx.log(
          `strato .${tld}: setup fee from ${card.setupSource.from}; domain list: ${card.listCheck}`,
        );
        if (card.after !== null && card.after > card.current && !promoNote) {
          throw new Error(
            `first-year price without the note "${PROMO_NOTE}" on ${STRATO_OVERVIEW}`,
          );
        }
        if (card.setupSource.from === 'table') {
          result.warnings.push(
            `.${tld}: setup fee from the product table, the price card has no "Einrichtung" line: ${JSON.stringify(card.setupSource.text)}`,
          );
        } else if (card.setupSource.from === 'list') {
          result.warnings.push(
            `.${tld}: setup fee from ${STRATO_DOMAIN_LIST}, the price card has no "Einrichtung" line and the page no product table: ${JSON.stringify(card.setupSource.text)}`,
          );
        }
        result.offers.push(toOffer(tld, card, res.bytes, isoSeconds(ctx.now())));
      } catch (err) {
        result.failed.push({ tld, reason: (err as Error).message });
      }
    }
    return result;
  },
};
