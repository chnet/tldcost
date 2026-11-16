// one.com: one public, server-rendered price list for all TLDs ("Domainpreise in EUR",
// https://www.one.com/de/domains/preise, the URL the AGB 2.3 refer to). robots.txt disallows only
// admin, maintenance, *.do and the order paths (/de/bestellung, ...); the price list is allowed.
// The AGB (v.17) say nothing about automated access to the website. One request per run.
//
// Table columns: Registrierung, Umzug, Erneuerung, Redemption. Prices are gross, as the page says
// ("Alle Preise inkl. 19% MwSt."), per year, German notation ("17,99", "4,-", "2.791,09").
// A first-year offer is shown as the current price followed by the struck-through standard price,
// often with the badge "Gratis mit Hosting" (free with a hosting package; the shown price is the
// price without hosting). Registration and transfer include the first year's fee (column tooltip).
// "Sonderangebote gelten nur für den ersten Vertragszeitraum" (note under the table): year1 is the
// current price, year1_regular the struck-through one, renewal the Erneuerung column. The bundle
// offer "Gratis mit Hosting" needs another product and is ignored (Methodik criterion, Archiv-Issue 87). The page
// names no end date for the offers (valid_until null) and no separate setup fee: "Die
// Registrierungs- und Umzugsgebühren beinhalten die Jahresgebühr für das erste Vertragsjahr."
// (column tooltip; setup 0; see docs/research/providers.md, one.com setup_fee).
import { evidenceHash } from '../evidence.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const ONECOM_PRICE_LIST = 'https://www.one.com/de/domains/preise';

/**
 * TLDs with a multi-year minimum registration where the price list does not say whether its price
 * is per year or per term (.ai: 2-year minimum at the registry). Left out until checked by hand.
 */
const UNVERIFIED_TERM = new Set(['ai']);

const GROSS_NOTE = 'Alle Preise inkl. 19% MwSt.';
const FIRST_TERM_NOTE = 'Sonderangebote gelten nur für den ersten Vertragszeitraum.';

/** "17,99" -> 1799, "4,-" -> 400, "2.791,09" -> 279109. */
export function euroCents(text: string): number {
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2}|-)$/.exec(text.trim());
  if (!m) throw new RangeError(`not a German euro price: ${JSON.stringify(text)}`);
  const euros = Number((m[1] as string).replaceAll('.', ''));
  return euros * 100 + (m[2] === '-' ? 0 : Number(m[2]));
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface OneComCell {
  /** Price shown now (without hosting). */
  current: number;
  /** Struck-through standard price, if the cell shows one. */
  regular: number | null;
}

/** One price cell; null for an empty cell. Badges (e.g. "Gratis mit Hosting") are dropped. */
export function parseCell(html: string): OneComCell | null {
  const struck = /<span class="line-through">([\s\S]*?)<\/span>/.exec(html);
  const rest = plain(
    html
      .replace(/<span class="line-through">[\s\S]*?<\/span>/, ' ')
      .replace(/<span class="pubPriceList-badge">[\s\S]*?<\/span>/, ' '),
  );
  if (rest === '' && !struck) return null;
  return {
    current: euroCents(rest),
    regular: struck ? euroCents(plain(struck[1] as string)) : null,
  };
}

export interface OneComRow {
  registration: OneComCell | null;
  transfer: OneComCell | null;
  renewal: OneComCell | null;
}

/** TLD (without dot) -> row. Throws when the page no longer looks like the price list. */
export function parsePriceList(html: string): Map<string, OneComRow> {
  if (!plain(html).includes(GROSS_NOTE)) {
    throw new Error(`price list without "${GROSS_NOTE}": layout or VAT statement changed`);
  }
  const rows = new Map<string, OneComRow>();
  for (const m of html.matchAll(/<tr data-pub-price-row>([\s\S]*?)<\/tr>/g)) {
    const row = m[1] as string;
    const tld = /<th scope="row"[^>]*>\s*\.([a-z0-9.-]+)\s/.exec(row)?.[1];
    if (!tld) continue;
    const cell = (label: string) => {
      const c = new RegExp(`<td data-label='${label}'>([\\s\\S]*?)</td>`).exec(row);
      return c ? parseCell(c[1] as string) : null;
    };
    rows.set(tld, {
      registration: cell('Registrierung'),
      transfer: cell('Umzug'),
      renewal: cell('Erneuerung'),
    });
  }
  if (rows.size === 0) throw new Error('no price rows found: layout changed');
  return rows;
}

export const oneCom: Adapter = {
  id: 'one-com',
  async fetch(ctx) {
    const res = await ctx.http.get(ONECOM_PRICE_LIST, 'text/html');
    const fetchedAt = isoSeconds(ctx.now());
    const rows = parsePriceList(res.text);
    const firstTermOnly = plain(res.text).includes(FIRST_TERM_NOTE);
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
      const { registration: reg, transfer, renewal } = row;
      if (!reg || !renewal) {
        result.failed.push({ tld, reason: 'registration or renewal price missing' });
        continue;
      }
      const regular = reg.regular ?? reg.current;
      if (reg.current > regular) {
        result.failed.push({ tld, reason: 'current price above the struck-through price' });
        continue;
      }
      const sale = reg.current < regular;
      if (sale && !firstTermOnly) {
        result.failed.push({ tld, reason: `reduced price without the note "${FIRST_TERM_NOTE}"` });
        continue;
      }
      if (regular !== renewal.current) {
        result.warnings.push(
          `.${tld}: standard registration price ${regular} differs from renewal ${renewal.current}`,
        );
      }
      result.offers.push({
        tld,
        currency: 'EUR',
        vat_included: true,
        price: {
          unit: 'year',
          setup: 0,
          year1: reg.current,
          year1_regular: regular,
          renewal: renewal.current,
          term_years: 1,
          renewal_term_years: 1,
          // current "Umzug" price, may be a first-term offer too; promo flags only year1 (schema)
          transfer_in: transfer ? transfer.current : null,
        },
        // condition quoted verbatim; "Gratis mit Hosting" needs another product (bundle): ignored
        promo: sale ? { conditions: FIRST_TERM_NOTE, valid_until: null } : null,
        evidence: {
          source_url: ONECOM_PRICE_LIST,
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
