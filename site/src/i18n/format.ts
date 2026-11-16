// Number, money and date formats per language (Archiv-Issue 33). German: the formats the site has always used
// (6,00 €, 13.11.2026). English: en-GB (€6.00, 13 Nov 2026), owner style rule. Dates are always the
// UTC date of the ISO value, never the browser zone; month names are fixed here instead of
// Intl's, so every engine prints the same text (some print "Sept" for en-GB).

export type Lang = 'de' | 'en';

export interface Format {
  /** Cents -> "6,00 €" / "€6.00". */
  eur(cents: number): string;
  /** Minor units of any ISO 4217 currency, e.g. "2,90 $" / "US$2.90". */
  amount(cents: number, currency: string): string;
  /** ISO date or timestamp -> "13.11.2026" / "13 Nov 2026" (UTC date). */
  date(iso: string): string;
  /** ISO timestamp -> "13.11.2026, 05:04 UTC" / "13 Nov 2026, 05:04 UTC". */
  dateTime(iso: string): string;
  /** Decimal number as written in the text: "7,7" / "7.7". */
  decimal(n: number): string;
  /** Money input ("6", "6,5", "1.234,50" / "6", "6.5", "1,234.50") -> cents; '' -> null; invalid -> undefined. */
  parseEuro(raw: string): number | null | undefined;
  /** Cents -> the money input text without currency sign: "6,00" / "6.00". */
  euroInput(cents: number): string;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; // prettier-ignore

const pad = (n: number) => String(n).padStart(2, '0');

function parseMoney(raw: string, group: string, dec: string): number | null | undefined {
  const t = raw.replace(/\s|€/g, '');
  if (t === '') return null;
  const g = `\\${group}`;
  const d = `\\${dec}`;
  const m = new RegExp(`^(\\d{1,3}(?:${g}\\d{3})*|\\d+)(?:${d}(\\d{1,2}))?$`).exec(t);
  if (!m) return undefined;
  const euros = Number((m[1] as string).split(group).join(''));
  const cents = Number((m[2] ?? '').padEnd(2, '0') || '0');
  return euros * 100 + cents;
}

export function createFormat(lang: Lang): Format {
  const tag = lang === 'de' ? 'de-DE' : 'en-GB';
  const eur = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' });
  const amounts = new Map<string, Intl.NumberFormat>();
  const decimal = (n: number) => (lang === 'de' ? String(n).replace('.', ',') : String(n));
  const date = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (lang === 'de') return `${d}.${m}.${y}`;
    return `${Number(d)} ${MONTHS_EN[Number(m) - 1] ?? m} ${y}`;
  };
  return {
    eur: (cents) => eur.format(cents / 100),
    amount(cents, currency) {
      let f = amounts.get(currency);
      if (!f) {
        try {
          f = new Intl.NumberFormat(tag, { style: 'currency', currency });
        } catch {
          const s = (cents / 100).toFixed(2);
          return `${lang === 'de' ? s.replace('.', ',') : s} ${currency}`;
        }
        amounts.set(currency, f);
      }
      return f.format(cents / 100);
    },
    date,
    dateTime(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return `${date(d.toISOString())}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    },
    decimal,
    parseEuro: (raw) => (lang === 'de' ? parseMoney(raw, '.', ',') : parseMoney(raw, ',', '.')),
    euroInput: (cents) => {
      const s = (cents / 100).toFixed(2);
      return lang === 'de' ? s.replace('.', ',') : s;
    },
  };
}
