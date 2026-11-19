// German texts that only the build uses (Archiv-Issue 33): layout, page texts, the footnotes of the price
// table (built into the payload by rows.ts). Kept out of de.ts, so the islands do not ship them.
// site-en.ts has the same keys and signatures (type SiteMessages).
import type { NoteText } from '../lib/payload';

const n2 = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const siteDe = {
  layout: {
    skip: 'Zum Inhalt',
    tagline: 'Domainpreise über 2, 3 und 5 Jahre, mit Vertragsbedingungen',
    // Open Graph image (public/og/de.png, scripts/og-images.mjs) and its alt text
    ogPrinciples: 'Offene Daten (CC BY 4.0) · keine Affiliate-Links · kein Tracking',
    ogImageAlt:
      'tldcost.io: Domainpreise über 2, 3 und 5 Jahre, mit Vertragsbedingungen. Offene Daten (CC BY 4.0), keine Affiliate-Links, kein Tracking.',
    navLabel: 'Hauptnavigation',
    nav: {
      compare: 'Vergleich',
      portfolio: 'Portfolio-Rechner',
      // below 640 px, so the header fits (Archiv-Issue 123)
      portfolioShort: 'Portfolio',
      methodik: 'Methodik',
      api: 'API',
    },
    themeLabel: 'Farbschema',
    themes: { system: 'System', light: 'Hell', dark: 'Dunkel' },
    footerLabel: 'Rechtliches und Informationen',
    project: 'Ein Projekt der CHnet Solutions Plus UG',
    data: 'Daten',
    noTracking: 'Keine Cookies, kein Tracking, keine Affiliate-Links',
    repoPending: 'Der Quellcode wird in Kürze veröffentlicht.',
    /** Footer link to GitHub Sponsors (voluntary support). */
    support: 'Unterstützen',
    switchLabel: 'Sprache',
    /** Footer suffix of a page that exists only in German (never shown on German pages). */
    germanOnly: '',
    /** Note on top of a translated text page; none in German. */
    translationNote: { methodik: '', legal: '', drift: '' },
  },
  /** Footnotes of the price table, built at build time (rows.ts). */
  notes: {
    fx: (currency: string, date: string, rate: string) =>
      `Umgerechnet aus ${currency} zum EZB-Referenzkurs vom ${date} ` +
      `(1 EUR = ${rate} ${currency}).`,
    foreignMarket: (country: string, date: string, pct: string) =>
      // owner decision 2026-11-19 (Fremdmarkt), verbatim for country US
      `${country}-Preis, umgerechnet zum Kurs vom ${date}, zzgl. ${pct} % MwSt.; ` +
      'der Preis für Kunden in Deutschland kann abweichen.',
    foreignMarketNet: (country: string, date: string) =>
      // net mode; owner-approved wording 2026-11-19, verbatim for country US
      `${country}-Preis, umgerechnet zum Kurs vom ${date}; ` +
      'der Preis für Kunden in Deutschland kann abweichen.',
    fxMissing: (currency: string) =>
      `Kein EZB-Kurs für ${currency} vorhanden: Beträge nicht umrechenbar.`,
    vatNotStated:
      'Der Anbieter macht keine Angabe zur Umsatzsteuer. Der Preis ist wie angegeben ' +
      'übernommen, brutto und netto gleich.',
    vatNet: (pct: string) =>
      `Der Anbieter nennt Nettopreise. Brutto = netto zuzüglich ${pct} % Umsatzsteuer.`,
    vatGross: (pct: string) =>
      `Der Anbieter nennt Bruttopreise. Netto = brutto ohne die enthaltenen ${pct} % Umsatzsteuer.`,
    termYears: (term: number, renewalTerm: number) =>
      [
        term > 1 ? `Die erste Zahlung deckt ${term} Jahre ab.` : '',
        renewalTerm > 1 ? `Jede Verlängerung deckt ${renewalTerm} Jahre ab.` : '',
        'Die Jahresspalten zeigen jede Zahlung im Jahr ihrer Fälligkeit, die Summen alle im ' +
          'Zeitraum fälligen Zahlungen in voller Höhe.',
      ]
        .filter(Boolean)
        .join(' '),
    monthly:
      'Der Anbieter nennt einen Monatspreis. Die Summen rechnen ihn auf 12 Monate pro Jahr ' +
      'hoch; der Monatspreis steht klein unter den Jahreswerten. Monats- und Jahreswert sind ' +
      'getrennt umgerechnet und gerundet, 12 × Monatspreis kann deshalb um wenige Cent vom ' +
      'Jahreswert abweichen.',
    promoExpired: (fetched: string, until: string): NoteText =>
      `Aktionspreis laut Datenstand vom ${fetched}. Die Aktion lief laut ` +
      `Anbieter bis ${until} und ist abgelaufen; der Preis im ersten Jahr kann veraltet sein.`,
    promo: (conditions: string | null, until: string | null): NoteText =>
      [
        'Aktionspreis im ersten Jahr.',
        conditions
          ? `Bedingungen: ${conditions.replace(/\.$/, '')}.`
          : 'Bedingungen laut Anbieter nicht angegeben.',
        until ? `Gültig bis ${until}.` : 'Laufzeit der Aktion nicht angegeben.',
        'Ab Jahr 2 gilt der Verlängerungspreis.',
      ].join(' '),
    /** Editorial note of the provider's terms or its country note (German data text). */
    dataNote: (text: string): NoteText => text,
  },
  pages: {
    index: {
      title: 'tldcost: Domainpreise im Vergleich',
      description:
        'Transparenter Preisvergleich für Domains: echte Gesamtkosten über 2, 3 und 5 Jahre, Verlängerungspreise und Vertragsbedingungen. Offene Daten, keine Affiliate-Links.',
      h1: 'Domainpreise im Vergleich',
      noscript:
        'Ohne JavaScript zeigt die Tabelle nur .de mit der Standard-Sortierung (Summe 3 Jahre, brutto).',
    },
    tld: {
      title: (tld: string) => `.${tld}-Domains: Preise und Gesamtkosten im Vergleich | tldcost`,
      description: (tld: string, n: number) =>
        `Was kostet eine .${tld}-Domain wirklich? Preise von ${n} ${n2(n, 'Anbieter', 'Anbietern')} mit Gesamtkosten über 2, 3 und 5 Jahren, Verlängerung und Vertragsbedingungen. Offene Daten, keine Affiliate-Links.`,
      h1: (tld: string) => `.${tld}-Domains: Preise und Gesamtkosten über 2, 3 und 5 Jahre`,
      lead: (tld: string, n: number, oldest: string, newest: string) =>
        `Preise von ${n} ${n2(n, 'Anbieter', 'Anbietern')} für .${tld}. Datenstand ${
          oldest === newest ? `vom ${newest}` : `vom ${oldest} bis ${newest}`
        }. Die Reihenfolge folgt der gewählten Spalte (Standard: Summe über 3 Jahre, brutto) und ist keine Empfehlung.`,
      machineReadable: 'Maschinenlesbar:',
      otherTlds: 'Andere Endungen',
    },
    portfolio: {
      title: 'Portfolio-Rechner: mehrere Domains im Vergleich · tldcost',
      description:
        'Was kostet ein ganzes Domain-Portfolio über 1, 2, 3 oder 5 Jahre? Gesamtpreis je Anbieter für mehrere Endungen und Anzahlen, neu registriert oder per Transfer. Offene Daten, keine Affiliate-Links.',
      h1: 'Portfolio-Rechner',
      intro:
        'Mehrere Domains, mehrere Endungen: Gib dein Portfolio ein und sieh, was es je Anbieter über den gewählten Zeitraum kostet. Gerechnet wird wie in der Tabelle (Einrichtungsgebühr einmal je Domain, jede fällige Zahlung voll, Methodik). Ein Anbieter ohne eine der Endungen oder ohne nötige Angabe bekommt keinen Gesamtpreis.',
      noscript: 'Der Portfolio-Rechner rechnet im Browser und braucht JavaScript.',
    },
    /** /api/ (ApiPage.astro). HTML strings: inline <code>/<strong> markup; arguments are HTML too. */
    api: {
      title: 'API: Domainpreise als offene Daten | tldcost',
      description:
        'Alle Preise und Vertragsbedingungen von tldcost als statische JSON-Dateien: ohne Schlüssel, ohne Cookies, mit OpenAPI-Beschreibung und JSON Schema.',
      h1: 'API: alle Daten als JSON',
      intro: (base: string) =>
        `Alle Daten dieser Seite gibt es als statische JSON-Dateien unter <code>${base}/</code>. Sie entstehen bei jedem Datenstand neu aus denselben Daten wie die Tabelle. Kein API-Schlüssel, keine Anmeldung, keine Cookies, keine Abfrageparameter. Abrufe von anderen Websites sind erlaubt (CORS für jede Herkunft, nur <code>GET</code> und <code>HEAD</code>).`,
      files: {
        h2: 'Dateien',
        aria: 'Dateien der API',
        path: 'Pfad',
        content: 'Inhalt',
        all: 'Alle Anbieter, Angebote und EZB-Kurse, dazu abgeleitete Gesamtkosten',
        tlds: 'Alle Endungen mit Angeboten, mit Anzahl und Link auf die Datei je Endung',
        offers: (example: string) =>
          `Angebote einer Endung und die Anbieter dazu, z. B. ${example}`,
        openapi: 'Beschreibung aller Dateien als OpenAPI 3.1',
        schema: (list: string) => `JSON Schema (2020-12) der Rohdaten: ${list}`,
      },
      tldCount: (n: number, list: string) =>
        `Aktuell ${n} ${n2(n, 'Endung', 'Endungen')}: ${list}.`,
      structure: {
        h2: 'Aufbau',
        intro: 'Jede Datei beginnt mit denselben Feldern:',
        versions:
          'Version der API (1) und des Schemas der Datensätze (2). Seit Schema 2 können die Ja/Nein-Merkmale auch <code>"paid"</code> (kostenpflichtig) sein; <code>feature_costs</code> nennt dazu Quelle und, falls angegeben, Preis.',
        dataVersion:
          'Prüfsumme über alle Daten (<code>sha256:…</code>). Sie ändert sich genau dann, wenn sich die Daten ändern. Zum Erkennen neuer Daten genügt ein Vergleich dieses Felds.',
        license: (link: string) =>
          `Lizenz der Daten und Vorschlag für die Namensnennung, siehe ${link}.`,
        dates: (oldest: string, newest: string) =>
          `Jüngster und ältester Abrufzeitpunkt (<code>evidence.fetched_at</code>) der Angebote in der Datei. Derzeit für alle Daten: ${oldest} bis ${newest}.`,
        raw: '<code>providers</code>, <code>offers</code> und <code>fx</code> sind die Rohdaten genau so, wie sie im Repository liegen. Beträge sind ganze Cent in der Währung des Angebots, <code>vat_included</code> sagt, ob die Umsatzsteuer enthalten ist. Jeder Preis hat einen Beleg (<code>evidence.source_url</code>, <code>evidence.fetched_at</code>).',
        unit: '<strong>Wichtig:</strong> Die wiederkehrenden Preise (<code>price.year1</code>, <code>year1_regular</code>, <code>renewal</code>, <code>year2</code>, <code>year3</code>) stehen in der Einheit von <code>price.unit</code>: bei <code>"year"</code> pro Jahr, bei <code>"month"</code> pro <strong>Monat</strong>. <code>price.setup</code> und die Transferpreise sind einmalig.',
        derived:
          '<code>derived</code> enthält daraus berechnete Werte, mit demselben Code wie die Tabelle: unter <code>derived.tco["&lt;anbieter&gt;/&lt;tld&gt;"]</code> die Gesamtkosten über 2, 3 und 5 Jahre (<code>sum_2y</code> … <code>sum_5y</code>) und der Durchschnitt pro Jahr (<code>avg_2y</code> … <code>avg_5y</code>), brutto und netto, dazu die einmalige Einrichtungsgebühr (<code>setup</code>). Alle Werte sind Euro-Cent; <strong>Monatspreise sind auf das Jahr hochgerechnet (× 12)</strong>, Fremdwährungen zum EZB-Kurs umgerechnet. Fehlt eine Angabe, sind die Summen <code>null</code> und <code>missing</code> nennt, was fehlt. Maßgeblich sind immer die Rohdaten.',
        example:
          'Beispiel: Ein Angebot mit <code>price.unit: "month"</code>, <code>price.year1: 42</code> und <code>vat_included: true</code> kostet 0,42 € pro Monat inklusive Umsatzsteuer, also 5,04 € pro Jahr. In <code>derived.tco[…].gross</code> steht dafür <code>avg_3y: 504</code> und <code>sum_3y: 1512</code> (ohne Einrichtungsgebühr).',
      },
      example: {
        h2: 'Beispiel',
        /** Comments in the fetch example (plain text, inside the code block). */
        unknownPaths: 'unbekannte Pfade liefern HTML',
        unit: 'price.year1 gilt pro price.unit (Jahr oder Monat); derived ist immer EUR pro Jahr',
        cents: 'Cent',
      },
      rules: {
        h2: 'Regeln',
        noWarranty:
          'Ohne Gewähr und ohne zugesicherte Verfügbarkeit. Die Dateien liegen auf einem CDN; übliche Abrufe sind kein Problem.',
        notFound:
          'Unbekannte Pfade liefern die HTML-Fehlerseite mit Status 404, kein JSON. Bitte den Status prüfen, bevor die Antwort als JSON gelesen wird.',
        v1: '<code>v1</code> ändert sich nur durch Ergänzungen (neue Felder, neue Dateien). Unbekannte Felder bitte ignorieren. Was nicht abwärtskompatibel ist, kommt unter <code>/api/v2/</code>.',
        report: (href: string) =>
          `Fehler in den Daten bitte <a href="${href}">melden</a>, mit Beleg.`,
      },
      license: {
        h2: 'Lizenz',
        /** Anchor id of the licence section (also linked from the structure list). */
        id: 'lizenz',
        deed: 'https://creativecommons.org/licenses/by/4.0/deed.de',
        text: (link: string) =>
          `Die Daten der API stehen unter der Lizenz ${link}. Nutzung, Weitergabe und Bearbeitung sind für jeden Zweck erlaubt, auch kommerziell, wenn Sie die Quelle nennen, die Lizenz verlinken und Änderungen kenntlich machen. Jede Datei nennt die Lizenz im Feld <code>license</code>. Namensnennung zum Beispiel so:`,
        after: (site: string, code: string) =>
          `mit Link auf ${site}. Der Code von tldcost steht unter der ${code}.`,
      },
    },
    /** `/api/v1/`: one bilingual page (German part), see pages/api/v1/index.astro. */
    apiIndex: {
      title: 'API v1',
      description: 'Dateien der tldcost-API v1 und Link zur Dokumentation.',
      h: 'API v1',
      intro:
        'Unter dieser Adresse liegen die JSON-Dateien der tldcost-API. Wie sie aufgebaut sind und wofür sie gelten, steht in der Dokumentation.',
      doc: 'Zur API-Dokumentation',
      files: 'Dateien',
    },
    suggest: { question: 'Anbieter fehlt?', link: 'Vorschlagen' },
  },
};

export type SiteMessages = typeof siteDe;
