// German texts of the site (Archiv-Issue 33): the source catalogue. en.ts has the same keys and signatures
// (type Messages, checked by tsc and tests/unit/i18n.test.ts). Every text here is exactly the text
// the site showed before the catalogue existed, so the German pages stay unchanged.
//
// Data text (promo conditions, editorial notes, country notes) is German in data/ and quoted
// verbatim: in German it is plain text, in English it is marked lang="de" (NoteText parts).
import type { NoteText } from '../lib/payload';
import { createFormat } from './format';

const n2 = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const de = {
  /** html lang, hreflang. */
  lang: 'de' as 'de' | 'en',

  common: {
    missing: 'k. A.',
    yes: 'ja',
    no: 'nein',
    gross: 'brutto',
    net: 'netto',
    footnote: (n: number) => `Fußnote ${n}`,
    stale: 'veraltet',
  },

  /** Column header labels, units (plural, singular) and the text for the value 0. */
  columns: {
    provider: { label: 'Anbieter' },
    country: { label: 'Land' },
    setup: { label: 'Einrichtung' },
    year1: { label: 'Jahr 1' },
    year2: { label: 'Jahr 2' },
    year3: { label: 'Jahr 3' },
    sum_2y: { label: 'Summe 2 J.' },
    sum_3y: { label: 'Summe 3 J.' },
    sum_5y: { label: 'Summe 5 J.' },
    notice_days: { label: 'Kündigungsfrist', unit: 'Tage', unitOne: 'Tag' },
    min_term_months: {
      label: 'Mindestlaufzeit',
      unit: 'Monate',
      unitOne: 'Monat',
      zero: 'keine Mindestlaufzeit',
    },
    ssl_free: { label: 'SSL-Zertifikat' },
    fwd_301: { label: '301' },
    fwd_302: { label: '302' },
    dns_editor: { label: 'DNS-Editor' },
    custom_ns: { label: 'Eigene NS' },
    renewal: { label: 'Verlängerung regulär' },
    transfer_in: { label: 'Transfer-in' },
    transfer_out: { label: 'Transfer-out' },
    billing_cycle: { label: 'Abrechnung' },
    auto_renew: { label: 'Auto-Verlängerung' },
    dnssec: { label: 'DNSSEC' },
    email_fwd: { label: 'E-Mail-Weiterleitung' },
    whois_privacy: { label: 'Whois-Privacy' },
    api: { label: 'API' },
    two_factor: { label: '2FA' },
    payment: { label: 'Zahlungsarten' },
    fetched_at: { label: 'Datenstand' },
  } as Record<string, { label: string; unit?: string; unitOne?: string; zero?: string }>,

  /** Display labels of enum values (the rank lives in columns.ts). */
  enums: {
    monthly: 'monatlich',
    yearly: 'jährlich',
    'multi-year': 'mehrjährig',
    free: 'kostenlos',
    paid: 'kostenpflichtig',
    none: 'nicht angeboten',
    'n/a': 'entfällt',
  } as Record<string, string>,

  badges: {
    text: {
      promo: 'Aktionspreis',
      verified: 'Anbieter-bestätigt',
      operator: 'Angebot des Portalbetreibers',
    },
    legend: {
      promo:
        'Jahr 1 ist ein Aktionspreis. Laufzeit und Bedingungen stehen in der Fußnote und in den Details.',
      verified: 'Der Anbieter hat seine Daten bestätigt, die Zugehörigkeit ist geprüft.',
      operator:
        'Der Betreiber von tldcost verkauft unter diesem Namen selbst Domains. Gleiche Regeln wie für alle: keine Hervorhebung, keine andere Sortierung.',
    },
    bestSample: 'hervorgehoben',
    bestLegend: {
      all: 'Niedrigster Wert in dieser Spalte unter allen Anbietern der Endung.',
      filtered: 'Niedrigster Wert in dieser Spalte unter den gefilterten Anbietern.',
    },
    /**
     * Shown when a cell says „kostenpflichtig“ (Archiv-Issue 124); plain text, no badge. `yes` explains „ja“
     * in every column that can be „kostenpflichtig“.
     */
    paidLegend: {
      yes: 'Inklusive, ohne Aufpreis.',
      paid: 'Nur gegen Aufpreis. Preis und Quelle stehen in den Details.',
    },
  },

  table: {
    empty: 'Noch keine Daten. Die ersten Preise folgen in Kürze.',
    perMonth: (eur: string) => `${eur}/Monat`,
    perMonthSpoken: (eur: string) => ` pro Jahr, entspricht ${eur} pro Monat`,
    avg: (eur: string) => `Ø ${eur}/J.`,
    promoExpired: 'Aktion abgelaufen',
    unitGross: '€ brutto',
    unitNet: '€ netto',
    asc: 'aufsteigend',
    desc: 'absteigend',
    bestSpoken: {
      all: ', niedrigster Wert in dieser Spalte',
      filtered: ', niedrigster Wert unter den gefilterten Anbietern',
    },
    status: (p: {
      shown: number;
      total: number;
      filtered: boolean;
      tld: string;
      filters: string[];
      sort: string;
      vat: 'gross' | 'net';
      asOf: string | null;
      best: 'all' | 'filtered' | null;
    }) =>
      (p.filtered ? `${p.shown} von ${p.total} Anbietern` : `${p.shown} Anbieter`) +
      ` für .${p.tld}` +
      (p.filtered ? ` · gefiltert nach ${p.filters.join(', ')}` : '') +
      ` · sortiert nach ${p.sort} · Preise ` +
      (p.vat === 'gross' ? 'brutto inkl. USt.' : 'netto ohne USt.') +
      ' in €' +
      (p.asOf ? ` · Datenstand ${p.asOf}` : '') +
      (p.best
        ? ` · hervorgehoben: ${
            p.best === 'filtered'
              ? 'niedrigster Wert unter den gefilterten Anbietern'
              : 'niedrigster Wert je Spalte'
          }`
        : ''),
    activeFilters: 'Aktive Filter',
    removeFilter: (label: string) => `Filter ${label} entfernen`,
    resetFilters: 'Alle Filter zurücksetzen',
    filterPanel: (active: number) => `Filter${active > 0 ? ` (${active} aktiv)` : ''}`,
    region: (tld: string) => `Preise für .${tld}, horizontal scrollbar`,
    caption: (tld: string, sort: string) => `Domainpreise für .${tld}, sortiert nach ${sort}`,
    noMatch:
      'Kein Anbieter passt zu den Filtern. Mit „Alle Filter zurücksetzen“ sehen Sie wieder alle Anbieter.',
    details: 'Details',
    detailsFor: (name: string) => ` zu ${name}`,
  },

  controls: {
    tld: 'TLD',
    prices: 'Preise',
    search: 'Anbieter suchen',
    searchPlaceholder: 'z. B. INWX',
    columns: (checked: number, total: number) => `Spalten (${checked} von ${total})`,
  },

  filters: {
    contains: (text: string) => `enthält „${text}“`,
    containsPlaceholder: 'enthält …',
    ariaText: (label: string) => `Filter ${label}: enthält`,
    ariaGroup: (label: string) => `Filter ${label}`,
    from: 'von',
    to: 'bis',
    ariaFrom: (label: string, unit: string) => `Filter ${label}: von${unit ? ` (${unit})` : ''}`,
    ariaTo: (label: string, unit: string) => `Filter ${label}: bis${unit ? ` (${unit})` : ''}`,
    ariaNa: (label: string) => `Filter ${label}: Zeilen ohne Angabe (k. A.) zeigen`,
    ariaPick: (label: string, summary: string) => `Filter ${label}: ${summary}`,
    all: 'alle',
    any: 'beliebig',
    none: 'keine Auswahl',
    maxDays: (d: number) => `≤ ${d} Tage`,
    between: (a: string, b: string) => `${a} bis ${b}`,
    atLeast: (a: string) => `ab ${a}`,
    atMost: (b: string) => `bis ${b}`,
    withoutNa: 'ohne k. A.',
  },

  detail: {
    sources: { offer: 'laut Angebot', provider: 'laut AGB' } as Record<string, string>,
    statedVat: { gross: 'brutto', net: 'netto', none: 'ohne USt.-Angabe' },
    perMonthUnit: '/Monat',
    pricesHeading: 'Preise laut Anbieter',
    raw: {
      year1: 'Jahr 1',
      year1Regular: 'Jahr 1 regulär',
      renewal: 'Verlängerung',
      setup: 'Einrichtung',
    },
    term: 'Laufzeit',
    termText: (years: number) => `Die erste Zahlung deckt ${years} Jahre ab.`,
    renewalTerm: 'Verlängerung um',
    renewalTermText: (years: number) => `${years} Jahre je Zahlung`,
    promo: 'Aktion',
    promoExpired: 'Aktion (abgelaufen)',
    conditionsMissing: 'Bedingungen nicht angegeben',
    validUntil: 'Gültig bis',
    notStated: 'nicht angegeben',
    expiredNote: 'abgelaufen, der Preis kann veraltet sein',
    regularYear1: 'Regulär im ersten Jahr',
    paidHeading: 'Kostenpflichtige Leistungen',
    paidUnit: { year: '/Jahr', month: '/Monat', once: ' einmalig' },
    paidSource: 'Quelle',
    contractHeading: 'Vertrag',
    country: 'Land',
    terms: 'AGB',
    termsOf: (name: string) => `AGB von ${name}`,
    section: 'Fundstelle',
    reviewed: 'AGB geprüft am',
    evidenceHeading: 'Beleg',
    method: 'Erhebung',
    confidence: 'Verlässlichkeit',
    endpoint: 'Abgerufen über',
    hash: 'Prüfsumme',
    screenshot: 'Bildschirmfoto',
    screenshotLink: 'Bildschirmfoto der Quelle',
    verified: 'Anbieter-bestätigt',
    verifiedYes: 'ja, Zugehörigkeit geprüft',
    source: 'Quelle:',
    priceSourceOf: (name: string) => `Preisseite von ${name}`,
    fetchedOn: 'erhoben am',
    report: 'Fehler melden',
    reportGithub: (hint: string) => `(Formular auf GitHub; ${hint})`,
    reportMail: (email: string) => `(E-Mail an ${email})`,
    noGithubHint: (email: string) => `Ohne GitHub-Konto: E-Mail an ${email}.`,
    reportPrivacy:
      'Issues auf GitHub sind öffentlich: Bitte keine personenbezogenen Daten eintragen (Name, Adresse, Kundennummer, Rechnungen, Screenshots mit persönlichen Daten).',
    methods: {
      api: 'aus einer Preisliste oder Schnittstelle des Anbieters',
      scrape: 'automatisch von der Preisseite gelesen',
      manual: 'von Hand erfasst',
    } as Record<string, string>,
    confidences: { high: 'hoch', medium: 'mittel', low: 'niedrig' } as Record<string, string>,
  },

  /** Text of German data shown inline (row detail): plain in German. */
  quote: {
    /** Promo conditions in the row detail: „…“. */
    conditions: (text: string): NoteText => `„${text}“`,
    /** Other German data text (country note, AGB section). */
    data: (text: string): NoteText => text,
    /** Provider quote of a paid feature (Archiv-Issue 124): „…“, an English quote marked lang="en". */
    statement: (text: string, lang: 'de' | 'en'): NoteText =>
      lang === 'de' ? `„${text}“` : ['„', { en: text }, '“'],
  },

  basket: {
    notes: {
      vatNotStated:
        'Der Anbieter macht keine Angabe zur Umsatzsteuer. Die Preise sind wie angegeben übernommen, ' +
        'brutto und netto gleich. Die Summe ist deshalb nicht als Bruttopreis zu lesen.',
      monthly:
        'Der Anbieter nennt Monatspreise. Die Summen rechnen sie auf 12 Monate pro Jahr hoch.',
      // methodik, owner decision 2026-11-15 (first sentence verbatim)
      transfer:
        'Beim Transfer rechnen wir die Transfergebühr plus den Verlängerungspreis ab dem ersten Jahr, ' +
        'außer der Anbieter gibt an, dass der Transfer ein Jahr Laufzeit einschließt. Aktionspreise ' +
        'für Neuregistrierungen gelten beim Transfer nicht.',
      // owner decision 2026-11-15, verbatim
      regularFromRenewal:
        'Regulärer Preis im 1. Jahr nicht angegeben; gerechnet mit dem Verlängerungspreis.',
      mix:
        'Je Endung der günstigste Anbieter (bei Gleichstand alle). Das bedeutet mehrere ' +
        'Kundenkonten; Aufwand für Umzug und Verwaltung ist nicht eingerechnet.',
      fx: (currency: string, date: string, rate: string) =>
        `Umgerechnet aus ${currency} zum EZB-Referenzkurs vom ${date} ` +
        `(1 EUR = ${rate} ${currency}).`,
      vatNet: (pct: string) =>
        `Der Anbieter nennt Nettopreise. Brutto = netto zuzüglich ${pct} % Umsatzsteuer.`,
      vatGross: (pct: string) =>
        `Der Anbieter nennt Bruttopreise. Netto = brutto ohne die enthaltenen ${pct} % Umsatzsteuer.`,
      promo: (p: {
        tld: string;
        conditions: string | null;
        until: string | null;
        max: number | null;
        /** limit_scope unlimited: the provider's quote (shown only if not already the condition). */
        unlimited?: { quote: string | null } | null;
      }): NoteText => {
        const parts = [
          `Jahr 1 von .${p.tld} ist ein Aktionspreis${p.conditions ? `: „${p.conditions}“` : '.'}`,
        ];
        if (p.until) parts.push(`Gültig bis ${p.until}.`);
        if (p.max !== null) {
          parts.push(
            `Laut Anbieter gilt er für höchstens ${p.max} ${n2(p.max, 'Domain', 'Domains')} dieser ` +
              'Endung; weitere rechnen wir in Jahr 1 zum regulären Preis.',
          );
        }
        if (p.unlimited) {
          const q = p.unlimited.quote;
          parts.push(
            `Laut Anbieter ohne Höchstzahl je Kunde${q ? ` („${q}“)` : ''}; wir rechnen den ` +
              'Aktionspreis für alle Domains dieser Endung.',
          );
        }
        return parts.join(' ');
      },
      // budget 1: the owner-approved wording, verbatim
      poolOne: (where: string) =>
        `Aktion pro Kunde nur einmal; angerechnet auf ${where}. ` +
        'Gilt sie für eine andere TLD, kann die Summe niedriger sein.',
      pool: (budget: number, counted: string) =>
        `Aktion pro Kunde für höchstens ${budget} Domains; angerechnet auf ${counted}. ` +
        'Gilt sie für andere TLDs, kann die Summe niedriger sein.',
      term: (tld: string, quote: string | null, url: string | null): NoteText => {
        const parts = [
          `Laut Anbieter schließt der Transfer für .${tld} eine Laufzeit ein; die erste ` +
            'Verlängerung ist danach fällig.',
        ];
        if (quote) parts.push(`„${quote}“`);
        if (url) parts.push(`Quelle: ${url}`);
        return parts.join(' ');
      },
    },
    perDomain: (eur: string) => `je Domain ${eur}`,
    promoTag: ' (Aktion)',
    promoSplit: (promo: number, each: string, regular: number, eachRegular: string) =>
      `${promo} × ${each} (Aktion), ${regular} × ${eachRegular}`,
    gap: {
      notOffered: { text: 'fehlt', spoken: 'nicht im Angebot' },
      noTransfer: { text: 'Transfer-Preis fehlt', spoken: 'kein Transfer-Preis bekannt' },
      termUnclear: {
        text: 'Transferlaufzeit unklar',
        spoken: 'unklar, welche Laufzeit der Transfer einschließt',
      },
      missing: (fields: string) => `Angabe fehlt: ${fields}`,
    },
    domains: 'Domains',
    modes: { new: 'neu registrieren', transfer: 'bestehende umziehen (Transfer)' },
    period: 'Zeitraum',
    years: (y: number) => (y === 1 ? '1 Jahr' : `${y} Jahre`),
    prices: 'Preise',
    portfolio: 'Portfolio',
    countOf: (tld: string) => `Anzahl Domains .${tld}`,
    remove: (tld: string) => `.${tld} entfernen`,
    add: 'Endung hinzufügen',
    choose: 'Endung wählen …',
    emptyBefore: 'Noch keine Domains im Portfolio. Füge Endungen mit Anzahl hinzu, zum Beispiel',
    emptyAfter: '.',
    status: (p: {
      shown: number;
      providers: number;
      filtered: boolean;
      filters: string[];
      domains: number;
      years: number;
      mode: 'new' | 'transfer';
      vat: 'gross' | 'net';
      sort: string;
      best: 'all' | 'filtered' | null;
    }) =>
      (p.filtered ? `${p.shown} von ${p.providers} Anbietern` : `${p.providers} Anbieter`) +
      ` · ${p.domains} ${n2(p.domains, 'Domain', 'Domains')} · ` +
      `${p.years === 1 ? '1 Jahr' : `${p.years} Jahre`} · ` +
      `${p.mode === 'new' ? 'Neuregistrierung' : 'Transfer bestehender Domains'} · Preise ` +
      `${p.vat === 'gross' ? 'brutto inkl. USt.' : 'netto ohne USt.'} in €` +
      (p.filtered ? ` · gefiltert nach ${p.filters.join(', ')}` : '') +
      ` · sortiert nach ${p.sort}` +
      (p.best
        ? ` · hervorgehoben: ${
            p.best === 'filtered'
              ? 'niedrigster Wert unter den gefilterten Anbietern'
              : 'niedrigster Wert je Spalte'
          }`
        : ''),
    region: 'Portfolio-Kosten je Anbieter, horizontal scrollbar',
    caption: (years: number, sort: string) =>
      `Kosten des Portfolios über ${years} ${n2(years, 'Jahr', 'Jahre')} je Anbieter, ` +
      `sortiert nach ${sort}`,
    provider: 'Anbieter',
    // result table columns (Archiv-Issue 123); the provider and total labels are above and below
    country: 'Land',
    complete: 'Vollständig',
    assumption: 'Annahme',
    /** Name of the sort column in the status line and the caption. */
    sortName: {
      provider: 'Anbieter',
      country: 'Land',
      total: 'Gesamtpreis',
      complete: 'Vollständig',
      assumption: 'Annahme',
    } as Record<string, string>,
    sortText: (name: string, dir: 'asc' | 'desc') =>
      `${name} ${dir === 'asc' ? 'aufsteigend' : 'absteigend'}`,
    bestLegend: {
      all: 'Niedrigster Wert in dieser Spalte unter allen Anbietern.',
      filtered: 'Niedrigster Wert in dieser Spalte unter den gefilterten Anbietern.',
    },
    total: (years: number) => `Gesamt ${years} J.`,
    incomplete: 'unvollständig',
    incompleteSpoken: ', kein Gesamtpreis',
    noPrices: 'Für diese Endungen gibt es noch keine Preise.',
    mix: 'Günstigste Kombination',
    mixMissing: 'fehlt',
    mixMissingSpoken: ' (bei keinem Anbieter vollständig)',
  },
};

export type Messages = typeof de;

/** Country name in this language for an ISO 3166-1 alpha-2 code; the code itself if unknown. */
export type CountryName = (code: string) => string;

/** Messages plus formats of one language: what pages, lib functions and islands receive. */
export interface Locale {
  lang: 'de' | 'en';
  m: Messages;
  f: ReturnType<typeof createFormat>;
}

export const DE: Locale = { lang: 'de', m: de, f: createFormat('de') };
