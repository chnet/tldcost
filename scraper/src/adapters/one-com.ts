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
//
// The page shows the prices for the visitor's country, detected on the server from the IP address
// (the English page /en/domain/prices from a German address also says countryCode DE and "All
// prices include 19% VAT"); there is no public country or VAT selection. The inline onecomConfig
// must therefore say countryCode 'DE', showVAT 'true' and vatPercentage '19', besides the gross
// note: any other country's display throws instead of being written, and the error names what the
// page said, so a failed run shows the country the server detected.
//
// One exception, a separate branch (owner decision 2026-11-19, "Fremdmarkt", docs/decisions.md):
// the data run's runners are shown the US display (countryCode 'US', showVAT 'false',
// vatPercentage '0'). Its prices are recorded as quoted, in USD and net, with foreign_market and the
// literal heading and row as the quote; the site converts them at the ECB rate of the fetch date and
// adds German VAT, with a footnote. The branch requires that exact display, the currency USD in both
// onecomConfig.currency and the heading "Domainpreise in USD", and no VAT note; a US display in EUR
// or any other currency throws (no decision for it). The German branch above is unchanged.
import type { ForeignMarket } from '@tldcost/core';
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
/** GROSS_NOTE with tolerant whitespace (line breaks in the markup, "19 %"). */
const GROSS_NOTE_PATTERN = /Alle Preise inkl\.\s*19\s?%\s*MwSt\./;
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

/** `onecomConfig.<key> = '<value>';` from the inline page config, or null. */
const configValue = (html: string, key: string): string | null =>
  new RegExp(`onecomConfig\\.${key} = (['"])([^'"\\n]*)\\1;`).exec(html)?.[2] ?? null;

/**
 * Throws unless the page is the German price display: inline onecomConfig with countryCode 'DE',
 * showVAT 'true' and vatPercentage '19', and the note "Alle Preise inkl. 19% MwSt." under the table.
 */
export function checkGermanVat(html: string): void {
  const display = {
    countryCode: configValue(html, 'countryCode'),
    showVAT: configValue(html, 'showVAT'),
    vatPercentage: configValue(html, 'vatPercentage'),
  };
  const notice = /<p class="notices">([\s\S]*?)<\/p>/.exec(html);
  const noticeText = notice ? plain(notice[1] as string).slice(0, 160) : null;
  const said =
    `countryCode ${JSON.stringify(display.countryCode)}, showVAT ${JSON.stringify(display.showVAT)}, ` +
    `vatPercentage ${JSON.stringify(display.vatPercentage)}, notice ${JSON.stringify(noticeText)}`;
  if (Object.values(display).some((v) => v === null)) {
    throw new Error(
      `price list without the onecomConfig country and VAT settings (${said}): layout changed`,
    );
  }
  if (
    display.countryCode !== 'DE' ||
    display.showVAT !== 'true' ||
    display.vatPercentage !== '19'
  ) {
    throw new Error(`not the German price display (${said}): country detection changed the prices`);
  }
  if (!GROSS_NOTE_PATTERN.test(plain(html))) {
    throw new Error(`price list without "${GROSS_NOTE}" (${said}): VAT statement changed`);
  }
}

/** The country, VAT and currency settings of the US display, as the data run's runners see it. */
const US_DISPLAY = { countryCode: 'US', showVAT: 'false', vatPercentage: '0' } as const;
/** A VAT statement ("inkl. 19% MwSt.", "zzgl. MwSt.", "USt."): the US notices must have none. */
const VAT_STATEMENT = /\b(?:MwSt|USt|VAT|Mehrwertsteuer|Umsatzsteuer)\b/i;

/**
 * The US display's currency heading, e.g. "Domainpreise in USD". Throws unless the page is that
 * display: onecomConfig countryCode 'US', showVAT 'false', vatPercentage '0', currency USD in
 * onecomConfig.currency and in the heading, notices under the table without a VAT statement and no
 * German gross note anywhere on the page.
 */
export function checkUsDisplay(html: string): string {
  const display = {
    countryCode: configValue(html, 'countryCode'),
    showVAT: configValue(html, 'showVAT'),
    vatPercentage: configValue(html, 'vatPercentage'),
    currency: configValue(html, 'currency'),
  };
  const headingMatch = /<h1 class="pubPriceList-title">([\s\S]*?)<\/h1>/.exec(html);
  const heading = headingMatch ? plain(headingMatch[1] as string) : null;
  const notice = /<p class="notices">([\s\S]*?)<\/p>/.exec(html);
  const noticeText = notice ? plain(notice[1] as string) : null;
  const said =
    Object.entries(display)
      .map(([k, v]) => `${k} ${JSON.stringify(v)}`)
      .join(', ') +
    `, heading ${JSON.stringify(heading)}, notice ${JSON.stringify(noticeText?.slice(0, 160) ?? null)}`;
  if (
    display.countryCode !== US_DISPLAY.countryCode ||
    display.showVAT !== US_DISPLAY.showVAT ||
    display.vatPercentage !== US_DISPLAY.vatPercentage
  ) {
    throw new Error(`not the US price display (${said}): country detection changed the prices`);
  }
  if (display.currency === 'EUR') {
    throw new Error(`US view in EUR (${said}): owner decision needed`);
  }
  if (display.currency !== 'USD' || heading !== 'Domainpreise in USD') {
    throw new Error(
      `US view without the currency USD in config and heading (${said}): layout changed`,
    );
  }
  // the notices under the table carry the German gross note; on the US display they must exist
  // and state no VAT, and the gross note must be nowhere on the page
  if (noticeText === null) {
    throw new Error(`US view without the notices under the table (${said}): layout changed`);
  }
  if (VAT_STATEMENT.test(noticeText) || GROSS_NOTE_PATTERN.test(plain(html))) {
    throw new Error(`US view with a VAT statement (${said}): VAT statement changed`);
  }
  return heading;
}

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
  /** The row's text as the page shows it, e.g. ".de Gratis mit Hosting 0,90 17,99 …" (the quote). */
  text: string;
  registration: OneComCell | null;
  transfer: OneComCell | null;
  renewal: OneComCell | null;
}

/** TLD (without dot) -> row. Throws when the page no longer looks like the price list. */
export function parsePriceList(html: string): Map<string, OneComRow> {
  checkGermanVat(html);
  return parseRows(html);
}

/** The US display: TLD -> row (USD, net) and its literal row text for the quote. */
export function parseUsPriceList(html: string): { heading: string; rows: Map<string, OneComRow> } {
  const heading = checkUsDisplay(html);
  return { heading, rows: parseRows(html) };
}

function parseRows(html: string): Map<string, OneComRow> {
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
      text: plain(row),
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
    // the US display is its own branch; every other display goes through the German check
    const us = configValue(res.text, 'countryCode') === US_DISPLAY.countryCode;
    let rows: Map<string, OneComRow>;
    let quoteOf: ((row: OneComRow) => ForeignMarket) | null = null;
    if (us) {
      const list = parseUsPriceList(res.text);
      rows = list.rows;
      quoteOf = (row) => ({
        country: 'US',
        currency: 'USD',
        quote: `${list.heading}: ${row.text}`.slice(0, 500),
      });
      ctx.log(
        `one-com: US price display (${list.heading}), ${rows.size} rows; recorded in USD, net, as foreign_market`,
      );
    } else {
      rows = parsePriceList(res.text);
    }
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
        currency: quoteOf ? 'USD' : 'EUR',
        vat_included: !quoteOf,
        ...(quoteOf ? { foreign_market: quoteOf(row) } : {}),
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
