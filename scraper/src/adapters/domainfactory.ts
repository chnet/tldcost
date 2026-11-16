// DomainFactory: the public domain page https://www.df.eu/de/domains/ (static HTML, one request).
// Its accordion "Alle Domainendungen" lists every TLD with "Aktionspreis im 1. Jahr" and
// "Regulärer- und Verlängerungspreis"; the same table as the price list /de/preislisten/.
// - Prices are MONTHLY prices for a 12-month billing period ("Die folgenden Preise sind
//   Monatspreise und verstehen sich für einen Abrechnungszeitraum von 12 Monaten."), stored as
//   `unit: month` like netcup.
// - Gross: footnote "*Alle Beträge inklusive gesetzlicher Mehrwertsteuer."
// - Setup: row "Einrichtungsgebühr 0,00 €*" in "Preise und Laufzeit".
// - Promo conditions: the footnote "Für alle TLDs mit einem Aktionspreis im ersten Jahr gilt: …",
//   quoted verbatim. No end date is stated (valid_until null).
// - ICANN fee: "Diese Gebühr ist im angezeigten Preis enthalten." (gTLDs; two-letter ccTLDs: null).
// - Marker "#" after a TLD label: footnote "#Reseller-Rabatt: Rabattfähig auf Basis des für Sie
//   geltenden Rabattniveaus." (eligible for the reseller discount; no condition for other
//   customers). A marked TLD fails if that footnote is missing or reads differently.
// - Not collected: the volume discount in the price tooltip ("Mengenrabatt", tiers such as
//   "ab 50 Domains: -10%" and "ab 100 Domains: -20%").
// The gross note, the monthly-price note, the promo conditions (for a promo) and the "#" footnote
// (for a marked TLD) are checked on each run; a missing one fails instead of guessing. A missing
// setup or ICANN statement gives `null` (unknown).
// robots.txt allows /de/domains/ (checked 2026-11-15); the AGB contain no rule on automated access.
import { evidenceHash } from '../evidence.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter, type ScrapedOffer } from '../types.js';

export const DOMAINFACTORY_SOURCE_URL = 'https://www.df.eu/de/domains/';

const MONTHLY =
  'Die folgenden Preise sind Monatspreise und verstehen sich für einen Abrechnungszeitraum von 12 Monaten.';
const GROSS = 'Alle Beträge inklusive gesetzlicher Mehrwertsteuer.';
const ICANN_INCLUDED = 'Diese Gebühr ist im angezeigten Preis enthalten.';
const MARKER_NOTE = '#Reseller-Rabatt: Rabattfähig auf Basis des für Sie geltenden Rabattniveaus.';

/** Text of an HTML fragment: tags removed, common entities decoded, whitespace collapsed. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/\u00ad/g, '') // soft hyphen (U+00AD, as in the page's "Einrichtungs-gebühr")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DomainFactoryRow {
  /** Promo price per month in year 1 ("Aktionspreis im 1. Jahr"), cents; null if none. */
  promo: number | null;
  /** Regular and renewal price per month, cents. */
  regular: number;
  /** The label carries the "#" marker (reseller discount footnote). */
  marked: boolean;
  /** The "Aktionspreis" is above the regular price: the table has changed, the TLD fails. */
  promoAboveRegular: boolean;
}

/**
 * First "x,yy €" amount of a cell as cents, or null. The tooltip attribute
 * (`data-tooltip-content="<p><strong>Mengenrabatt</strong>…"`) holds raw markup that `textOf`
 * would partly keep as text, so it is removed first: an amount in a tooltip is never the price.
 */
function amount(cell: string): number | null {
  const bare = cell.replace(/\sdata-tooltip-content="[^"]*"/g, '');
  const m = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/.exec(textOf(bare));
  return m ? toCents((m[1] as string).replace(/\./g, '').replace(',', '.')) : null;
}

/** Rows of the accordion item "Alle Domainendungen", by TLD (without dot). */
export function parseTable(html: string): Map<string, DomainFactoryRow> {
  // anchored on the accordion header, not on any other mention of the words
  const header = /m-accordion__header">\s*Alle Domainendungen\s*</.exec(html);
  if (!header) throw new Error('domainfactory: section "Alle Domainendungen" not found');
  const start = header.index;
  const next = html.indexOf('m-accordion__item', start);
  const section = html.slice(start, next < 0 ? undefined : next);
  if (!textOf(section).includes(MONTHLY)) {
    throw new Error('domainfactory: monthly-price statement missing in "Alle Domainendungen"');
  }
  const rows = new Map<string, DomainFactoryRow>();
  for (const tr of section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const body = tr[1] as string;
    // the whole label (.com.de, .co.uk, .köln), not only up to the first dot or non-ASCII letter;
    // letters, digits, dots and hyphens only, so a trailing footnote sign (* or ")") is not taken
    const label = /class="df-tld__item-label caption">\s*\.([\p{L}\p{N}.-]+)(\s*#)?/u.exec(body);
    if (!label) continue;
    const tld = (label[1] as string).toLowerCase();
    if (rows.has(tld)) throw new Error(`domainfactory .${tld}: listed twice`);
    const cells = [...body.matchAll(/<td class="df-tld__item-info[^"]*">([\s\S]*?)<\/td>/g)].map(
      (c) => c[1] as string,
    );
    if (cells.length !== 2) throw new Error(`domainfactory .${tld}: expected 2 price cells`);
    const regular = amount(cells[1] as string);
    if (regular === null) throw new Error(`domainfactory .${tld}: no regular price`);
    const promo = amount(cells[0] as string);
    // a "promo" equal to the regular price is no promo; one above it points to a changed table
    rows.set(tld, {
      promo: promo !== null && promo < regular ? promo : null,
      regular,
      marked: label[2] !== undefined,
      promoAboveRegular: promo !== null && promo > regular,
    });
  }
  if (rows.size === 0) throw new Error('domainfactory: no TLD rows in "Alle Domainendungen"');
  return rows;
}

/** Page-wide statements: setup fee (cents or null), promo conditions, VAT, ICANN and "#" notes. */
export function parseTerms(html: string): {
  setup: number | null;
  promoConditions: string | null;
  icannIncluded: boolean;
  markerIsResellerDiscount: boolean;
} {
  const text = textOf(html);
  if (!text.includes(GROSS)) throw new Error('domainfactory: gross-price note missing');
  const setup = /Einrichtungsgebühr\s*(\d{1,3},\d{2})\s*€/.exec(text);
  const promo =
    /Für alle TLDs mit einem Aktionspreis im ersten Jahr gilt\s*:\s*(.+?Neuregistrierungen\.)/.exec(
      text,
    );
  return {
    setup: setup ? toCents((setup[1] as string).replace(',', '.')) : null,
    promoConditions: promo ? (promo[1] as string) : null,
    icannIncluded: text.includes(ICANN_INCLUDED),
    markerIsResellerDiscount: text.includes(MARKER_NOTE),
  };
}

export const domainfactory: Adapter = {
  id: 'domainfactory',
  async fetch(ctx) {
    const res = await ctx.http.get(DOMAINFACTORY_SOURCE_URL, 'text/html');
    const fetchedAt = isoSeconds(ctx.now());
    const rows = parseTable(res.text);
    const terms = parseTerms(res.text);
    const result = newResult();
    for (const tld of ctx.tlds) {
      const row = rows.get(tld);
      if (!row) {
        result.notOffered.push(tld);
        continue;
      }
      if (row.promoAboveRegular) {
        result.failed.push({ tld, reason: 'promo price above the regular price' });
        continue;
      }
      if (row.marked && !terms.markerIsResellerDiscount) {
        result.failed.push({ tld, reason: 'marker "#" without the reseller-discount footnote' });
        continue;
      }
      if (row.promo !== null && terms.promoConditions === null) {
        result.failed.push({ tld, reason: 'promo price without the stated promo conditions' });
        continue;
      }
      const offer: ScrapedOffer = {
        tld,
        currency: 'EUR',
        vat_included: true,
        price: {
          unit: 'month',
          setup: terms.setup,
          year1: row.promo ?? row.regular,
          year1_regular: row.regular,
          renewal: row.regular,
          term_years: 1,
          renewal_term_years: 1,
          // gTLDs: the ICANN fee is in the shown price; two-letter ccTLDs have none
          icann_fee_included: tld.length === 2 ? null : terms.icannIncluded ? true : null,
        },
        promo: row.promo === null ? null : { conditions: terms.promoConditions, valid_until: null },
        evidence: {
          source_url: DOMAINFACTORY_SOURCE_URL,
          fetched_at: fetchedAt,
          method: 'scrape',
          evidence_hash: evidenceHash(res.bytes),
          confidence: 'high',
        },
      };
      result.offers.push(offer);
    }
    return result;
  },
};
