// Hetzner: the public price list of the Domain Registration Robot (static HTML, one page, 8 TLDs).
// The other domain channel (konsoleH, /de/whois/) answers automated requests with a 307 loop to
// itself and is not used (docs/research/providers.md). robots.txt allows everything except the
// internal search (`?search=`); the AGB have no clause on automated access (checked 2026-11-15).
//
// The page has one table "Preise" with the columns "jährlich" and "einmalig". Each row is either
// ".<tld>-Registrierung" (yearly price; one-time setup fee or a cross for none) or ".<tld>-Transfer"
// (transfer price, only .de). The prices are server-rendered as gross amounts for Germany in
// `<span class="visually-hidden">3,90 €, inkl. 19 % MwSt.</span>` (the web component around them
// only switches the display for other countries). Stored gross as displayed (vat_included true).
//
// The page shows one yearly amount per TLD in the column "jährlich" and no separate renewal price:
// it is taken as both year1 and renewal (yearly billing), with confidence medium for that reason.
import { evidenceHash } from '../evidence.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const HETZNER_SOURCE_URL = 'https://www.hetzner.com/de/registrationrobot/';

const TABLE = /<table\b[^>]*\bprod-conf-overview-table\b[^>]*>([\s\S]*?)<\/table>/g;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/g;
const LABEL = /^\.([a-z0-9-]+)-(Registrierung|Transfer)\b/;
const HIDDEN = /<span class="visually-hidden">([^<]*)<\/span>/;
const GROSS_PRICE =
  /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2}) €(?: einmalige Einrichtungsgebühr)?, inkl\. 19 % MwSt\.$/;
const NO_FEE = /\bfa-times\b/;

/** Tags removed, entities and whitespace normalised. */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/\s+/g, ' ')
    .trim();

/** "1.234,56 €, inkl. 19 % MwSt." -> 123456 cents (gross). Throws on anything else. */
export function grossCents(label: string): number {
  const m = GROSS_PRICE.exec(label.trim());
  if (!m) throw new RangeError(`unexpected price text ${JSON.stringify(label)}`);
  return toCents(`${(m[1] as string).replace(/\./g, '')}.${m[2] as string}`);
}

export interface HetznerRow {
  tld: string;
  kind: 'Registrierung' | 'Transfer';
  /** Text of the yearly price cell (the hidden gross label). */
  yearly: string;
  /** Text of the one-time cell: the hidden label, or null when it shows the "none" cross. */
  oneTime: string | null;
}

/** Rows of the price table. Throws when the table or its two columns are not where expected. */
export function parseTable(html: string): HetznerRow[] {
  const tables = [...html.matchAll(TABLE)];
  if (tables.length !== 1) throw new Error(`expected one price table, found ${tables.length}`);
  const rows: HetznerRow[] = [];
  let header: string[] | undefined;
  for (const [, body] of (tables[0] as RegExpMatchArray)[1]!.matchAll(ROW)) {
    const cells = [...(body as string).matchAll(CELL)];
    if (cells.every((c) => c[1] === 'h')) {
      header = cells.map((c) => text(c[2] as string));
      continue;
    }
    // not a header row, so there is at least one cell (`every` is true for none)
    const label = LABEL.exec(text((cells[0] as RegExpMatchArray)[2] as string));
    if (!label || cells.length !== 3) {
      throw new Error(`unexpected row ${JSON.stringify(text(body as string).slice(0, 80))}`);
    }
    // the labels use a no-break space before "€"; text() normalises it
    const hidden = (cell: string) => {
      const label = HIDDEN.exec(cell)?.[1];
      return label === undefined ? undefined : text(label) || undefined;
    };
    const yearly = hidden(cells[1]?.[2] as string);
    const oneTimeCell = cells[2]?.[2] as string;
    const oneTime = hidden(oneTimeCell);
    if (!yearly || (!oneTime && !NO_FEE.test(oneTimeCell))) {
      throw new Error(`unreadable price cells for .${label[1] as string}`);
    }
    rows.push({
      tld: label[1] as string,
      kind: label[2] as HetznerRow['kind'],
      yearly,
      oneTime: oneTime ?? null,
    });
  }
  if (header?.join('|') !== '|jährlich|einmalig') {
    throw new Error(`unexpected table header ${JSON.stringify(header)}`);
  }
  return rows;
}

export const hetzner: Adapter = {
  id: 'hetzner',
  async fetch(ctx) {
    const res = await ctx.http.get(HETZNER_SOURCE_URL, 'text/html');
    const fetchedAt = isoSeconds(ctx.now());
    const rows = parseTable(res.text);
    const hash = evidenceHash(res.bytes);
    const result = newResult();
    for (const tld of ctx.tlds) {
      const reg = rows.find((r) => r.tld === tld && r.kind === 'Registrierung');
      if (!reg) {
        result.notOffered.push(tld);
        continue;
      }
      const transfer = rows.find((r) => r.tld === tld && r.kind === 'Transfer');
      let price;
      try {
        const yearly = grossCents(reg.yearly);
        price = {
          unit: 'year' as const,
          setup: reg.oneTime === null ? 0 : grossCents(reg.oneTime),
          year1: yearly,
          year1_regular: yearly,
          renewal: yearly,
          term_years: 1,
          renewal_term_years: 1,
          ...(transfer ? { transfer_in: grossCents(transfer.yearly) } : {}),
        };
      } catch (err) {
        result.failed.push({ tld, reason: (err as Error).message });
        continue;
      }
      result.offers.push({
        tld,
        currency: 'EUR',
        vat_included: true,
        price,
        promo: null,
        evidence: {
          source_url: HETZNER_SOURCE_URL,
          fetched_at: fetchedAt,
          method: 'scrape',
          evidence_hash: hash,
          // one yearly amount, renewal not stated separately (see the header comment)
          confidence: 'medium',
        },
      });
    }
    return result;
  },
};
