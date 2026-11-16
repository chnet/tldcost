// STRATO: one public, server-rendered product page per TLD (https://www.strato.de/domains/<tld>-domain/)
// with a price card at the top: monthly price, "für 12 Monate" / "12 Monate nur" plus
// "danach X € /Mon." for a first-year price, "Einrichtung: X €", and the order button
// data-buy="STRATO_DOMAIN_<TLD>[_AKTION]_VLZ12" (VLZ12: 12-month contract term). The cards of other
// TLDs on the same page are ignored. robots.txt only disallows /apps/ and /error/. The AGB (17.90)
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
}

/** The price card of `tld` on its product page. Throws when the card is missing or not as expected. */
export function parseCard(html: string, tld: string): StratoCard {
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
  const setup = /Einrichtung: (\S+) €/.exec(disclaimer)?.[1];
  if (setup === undefined) throw new Error('setup fee missing');
  const afterText = /danach (\S+) € \/Mon\./.exec(disclaimer)?.[1];
  if ((term === undefined) !== (afterText === undefined)) {
    throw new Error(
      `first-year term "${term ?? ''}" without a "danach" price, or the other way round`,
    );
  }
  if (term !== undefined && !FIRST_YEAR.has(term)) throw new Error(`unknown term "${term}"`);
  const after = afterText === undefined ? null : euroCents(afterText);
  if (after !== null && after < current) throw new Error('first-year price above the later price');
  return { current, after, term: term ?? null, setup: euroCents(setup) };
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
        const card = parseCard(res.text, tld);
        if (card.after !== null && card.after > card.current && !promoNote) {
          throw new Error(
            `first-year price without the note "${PROMO_NOTE}" on ${STRATO_OVERVIEW}`,
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
