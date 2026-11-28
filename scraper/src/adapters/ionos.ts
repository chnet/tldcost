// IONOS (owner decision 2026-11-27, docs/decisions.md): the public price table
// https://www.ionos.de/domains/domain-preistabelle (static HTML, one table with a row per TLD,
// 441 TLDs on 2026-11-27). robots.txt allows the page. It disallows /terms-, where the AGB are, so
// their rules on automated access cannot be checked; the owner accepts that risk. One request for
// robots.txt, one for the table, nothing else on the host.
//
// The adapter never works around a challenge, bot sensor or login page: a redirect away from the
// table, or a page without the table, its header, the first-year condition or the VAT footer,
// throws (fail closed) and nothing of IONOS is written. Rows of TLDs the run does not request are
// not read, so one unusual row among the 441 cannot stop the run (see parseTable).
//
// Mapping, as for the hand-entered offers before this adapter (docs/research/providers.md, IONOS):
// - unit month: the table states no unit, the .de page shows the same amounts per month;
// - year1: „Willkommensangebot“, else „Limitiertes Angebot“, else the regular renewal price. The
//   „Domain-Bundle-Preis“ needs another product and is ignored;
// - renewal: „Reguläre Verlängerungsgebühr“. year1_regular: null with a promo (the table states no
//   regular first-year price), else year1;
// - setup 0: the table lists every fee per TLD (renewal, transfer, reactivation, ICANN) and no
//   setup fee;
// - promo.conditions: the column, the first-year condition and the VAT footer, valid_until null.
// Not set, so the stored values stay: transfer_in (null: „Domain-Umzug“ states no unit, and a
// transfer includes a term), transfer_out and icann_fee_included.
import { evidenceHash } from '../evidence.js';
import { toCents } from '../money.js';
import { isoSeconds } from '../tlds.js';
import { newResult, type Adapter } from '../types.js';

export const IONOS_SOURCE_URL = 'https://www.ionos.de/domains/domain-preistabelle';

const COMPONENT = '<ionos-domain-price-table';
const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/;
const ROW = /<tr(?: data-dpt-row="([^"]*)" class="[^"]*")?>([\s\S]*?)<\/tr>/g;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/g;
const EURO = /^(\d+)(?:\.(\d{2}))? €$/;
const NONE = '-';
const HEADER =
  'TLDs|Limitiertes Angebot|Domain-Bundle-Preis|Willkommensangebot|Reguläre Verlängerungsgebühr|Domain-Umzug|Reaktivierungsgebühr|ICANN-Gebühr';
export const FIRST_YEAR_NOTE =
  'Die Angebotspreise gelten im ersten Jahr und sind im Voraus zahlbar.';
export const VAT_FOOTER =
  'Preise inkl. MwSt., Angebote sind nur für begrenzte Zeit gültig und sind teils abhängig von Mindestvertragslaufzeiten.';

/** Tags removed, entities and whitespace normalised. */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/\s+/g, ' ')
    .trim();

/** "0.08 €" / "90 €" -> cents (gross), "-" -> null. Throws on anything else. */
export function parsePrice(cell: string): number | null {
  if (cell === NONE) return null;
  const m = EURO.exec(cell);
  if (!m) throw new RangeError(`unexpected price text ${JSON.stringify(cell)}`);
  return toCents(`${m[1] as string}.${m[2] ?? '00'}`);
}

export interface IonosRow {
  tld: string;
  limited: string;
  welcome: string;
  renewal: string;
}

/**
 * Rows of the requested TLDs in the price table. Throws when the page is not the price table as
 * expected (another page, e.g. a challenge or login page, or a changed layout).
 *
 * Strict checks apply to the structure (one component, first-year note, VAT footer, header, every
 * <tr> parsed, at least one plain TLD row) and to the rows of the requested TLDs: such a row must
 * read `.tld` in its first cell, carry the same TLD in data-dpt-row and have 8 cells, and must not
 * appear twice. A row is "requested" when data-dpt-row or the first word of its first cell names a
 * requested TLD. All other rows are not read, whatever their form (e.g. a second-level label like
 * „co.uk“, an IDN or a note in the cell), so one unusual row among the 441 does not stop the run.
 */
export function parseTable(html: string, tlds: readonly string[]): IonosRow[] {
  const at = html.indexOf(COMPONENT);
  if (at < 0 || html.indexOf(COMPONENT, at + 1) >= 0) {
    throw new Error('expected one IONOS price table (challenge, bot sensor or login page?)');
  }
  const page = text(html);
  if (!page.includes(FIRST_YEAR_NOTE)) throw new Error('first-year condition not found');
  if (!page.includes(VAT_FOOTER)) throw new Error('VAT footer not found');
  const table = TABLE.exec(html.slice(at))?.[1] ?? '';
  const matched = [...table.matchAll(ROW)];
  // a <tr> that ROW does not match (e.g. a new attribute) must not vanish silently
  const opened = table.match(/<tr\b/g)?.length ?? 0;
  if (opened !== matched.length) {
    throw new Error(`found ${opened} <tr> but parsed ${matched.length} rows`);
  }
  const rows: IonosRow[] = [];
  let header: string | undefined;
  let plainRows = 0;
  for (const [, dataTld, body] of matched) {
    const cells = [...(body as string).matchAll(CELL)].map((c) => ({
      kind: c[1],
      text: text(c[2] as string),
    }));
    if (dataTld === undefined && cells.length > 0 && cells.every((c) => c.kind === 'h')) {
      header = cells.map((c) => c.text).join('|');
      continue;
    }
    const tld = dataTld ?? '';
    const plain = /^[a-z0-9-]+$/.test(tld) && cells[0]?.text === `.${tld}` && cells.length === 8;
    if (plain) plainRows++;
    const named = (cells[0]?.text ?? '').split(' ')[0] as string;
    if (!tlds.includes(tld) && !tlds.some((t) => named === `.${t}`)) continue;
    if (!plain) {
      throw new Error(`unexpected row ${JSON.stringify(text(body as string).slice(0, 80))}`);
    }
    if (rows.some((r) => r.tld === tld)) throw new Error(`duplicate row .${tld}`);
    const t = cells.map((c) => c.text);
    rows.push({ tld, limited: t[1] as string, welcome: t[3] as string, renewal: t[4] as string });
  }
  if (header !== HEADER) throw new Error(`unexpected table header ${JSON.stringify(header)}`);
  if (plainRows === 0) throw new Error('no TLD rows found');
  return rows;
}

const conditions = (column: string): string =>
  `${column} laut Preistabelle, gilt im ersten Jahr (12 Monate), im Voraus zahlbar. ` +
  `Fußzeile der Preistabelle: „${VAT_FOOTER}“`;

export const ionos: Adapter = {
  id: 'ionos',
  async fetch(ctx) {
    const res = await ctx.http.get(IONOS_SOURCE_URL, 'text/html');
    if (res.url !== IONOS_SOURCE_URL) {
      throw new Error(`redirected to ${res.url} (challenge, bot sensor or login page?)`);
    }
    const fetchedAt = isoSeconds(ctx.now());
    const rows = parseTable(res.text, ctx.tlds);
    const hash = evidenceHash(res.bytes);
    const result = newResult();
    for (const tld of ctx.tlds) {
      const row = rows.find((r) => r.tld === tld);
      if (!row) {
        result.notOffered.push(tld);
        continue;
      }
      let welcome, limited, renewal;
      try {
        welcome = parsePrice(row.welcome);
        limited = parsePrice(row.limited);
        renewal = parsePrice(row.renewal);
        if (renewal === null) throw new RangeError('no regular renewal price');
      } catch (err) {
        result.failed.push({ tld, reason: (err as Error).message });
        continue;
      }
      const column =
        welcome !== null ? 'Willkommensangebot' : limited !== null ? 'Limitiertes Angebot' : null;
      const year1 = welcome ?? limited ?? renewal;
      result.offers.push({
        tld,
        currency: 'EUR',
        vat_included: true,
        price: {
          unit: 'month',
          setup: 0,
          year1,
          year1_regular: column ? null : year1,
          renewal,
        },
        promo: column ? { conditions: conditions(column), valid_until: null } : null,
        evidence: {
          source_url: IONOS_SOURCE_URL,
          fetched_at: fetchedAt,
          method: 'scrape',
          evidence_hash: hash,
          // as for the hand-entered offers before this adapter: the table states no unit (taken
          // from the .de page), and the first-year columns depend on the customer (header notes:
          // „Willkommensangebot“ only for the first purchase, „Limitiertes Angebot“ for existing
          // customers' additional domains)
          confidence: 'medium',
        },
      });
    }
    return result;
  },
};
