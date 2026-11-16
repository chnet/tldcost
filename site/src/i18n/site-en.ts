// English texts that only the build uses (Archiv-Issue 33): layout, page texts, the footnotes of the price
// table. Same keys and signatures as site-de.ts. German data text is quoted verbatim, lang="de".
import type { NoteText } from '../lib/payload';
import type { SiteMessages } from './site-de';

const n2 = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const siteEn: SiteMessages = {
  layout: {
    skip: 'Skip to content',
    tagline: 'Domain prices over 2, 3 and 5 years, with contract terms',
    // Open Graph image (public/og/en.png, scripts/og-images.mjs) and its alt text
    ogPrinciples: 'Open data (CC BY 4.0) · no affiliate links · no tracking',
    ogImageAlt:
      'tldcost.io: domain prices over 2, 3 and 5 years, with contract terms. Open data (CC BY 4.0), no affiliate links, no tracking.',
    navLabel: 'Main navigation',
    nav: {
      compare: 'Compare',
      portfolio: 'Portfolio calculator',
      // below 640 px, so the header fits (Archiv-Issue 123)
      portfolioShort: 'Portfolio',
      methodik: 'Methodology',
      api: 'API',
    },
    themeLabel: 'Colour scheme',
    themes: { system: 'System', light: 'Light', dark: 'Dark' },
    footerLabel: 'Legal and information',
    project: 'A project of CHnet Solutions Plus UG',
    data: 'Data',
    noTracking: 'No cookies, no tracking, no affiliate links',
    repoPending: 'The source code will be published soon.',
    switchLabel: 'Language',
    germanOnly: ' (German)',
    translationNote: {
      methodik: 'This is a translation. The German version is authoritative.',
      legal: 'This is a translation. The German version is binding.',
      drift:
        'The German version has changed since this translation. Until the translation is updated, the German version applies.',
    },
  },
  notes: {
    fx: (currency, date, rate) =>
      `Converted from ${currency} at the ECB reference rate of ${date} ` +
      `(1 EUR = ${rate} ${currency}).`,
    fxMissing: (currency) => `No ECB rate for ${currency}: amounts cannot be converted.`,
    vatNotStated:
      'The provider makes no statement on VAT. The price is taken as stated, gross and net ' +
      'are the same.',
    vatNet: (pct) => `The provider states net prices. Gross = net plus ${pct}% VAT.`,
    vatGross: (pct) =>
      `The provider states gross prices. Net = gross without the included ${pct}% VAT.`,
    termYears: (term, renewalTerm) =>
      [
        term > 1 ? `The first payment covers ${term} years.` : '',
        renewalTerm > 1 ? `Each renewal covers ${renewalTerm} years.` : '',
        'The year columns show each payment in the year it is due; the totals contain every ' +
          'payment due within the period, in full.',
      ]
        .filter(Boolean)
        .join(' '),
    monthly:
      'The provider states a monthly price. The totals count it at 12 months per year; the ' +
      'monthly price is shown in small print below the yearly values. Monthly and yearly values ' +
      'are converted and rounded separately, so 12 × the monthly price can differ from the ' +
      'yearly value by a few cents.',
    promoExpired: (fetched, until) =>
      `Promotional price as of the data from ${fetched}. According to the provider the ` +
      `promotion ran until ${until} and has expired; the first-year price may be out of date.`,
    promo: (conditions, until): NoteText => {
      const rest =
        (until ? ` Valid until ${until}.` : ' The end of the promotion is not stated.') +
        ' From year 2 the renewal price applies.';
      if (!conditions) {
        return `Promotional price in the first year. Conditions not stated by the provider.${rest}`;
      }
      return [
        'Promotional price in the first year. Conditions (provider’s wording, German): “',
        // verbatim, including a closing full stop of the provider's text
        { de: conditions },
        // a full stop after the quote only when the quote does not end a sentence itself
        `”${/[.!?]$/.test(conditions) ? '' : '.'}${rest}`,
      ];
    },
    dataNote: (text): NoteText => ['Note (German): ', { de: text }],
  },
  pages: {
    index: {
      title: 'tldcost: domain prices compared',
      description:
        'Transparent price comparison for domains: real total cost over 2, 3 and 5 years, renewal prices and contract terms. Open data, no affiliate links.',
      h1: 'Domain prices compared',
      noscript:
        'Without JavaScript the table only shows .de with the default sort (total over 3 years, gross).',
    },
    tld: {
      title: (tld) => `.${tld} domains: prices and total cost compared | tldcost`,
      description: (tld, n) =>
        `What does a .${tld} domain really cost? Prices from ${n} ${n2(n, 'provider', 'providers')} with total cost over 2, 3 and 5 years, renewal and contract terms. Open data, no affiliate links.`,
      h1: (tld) => `.${tld} domains: prices and total cost over 2, 3 and 5 years`,
      lead: (tld, n, oldest, newest) =>
        `Prices from ${n} ${n2(n, 'provider', 'providers')} for .${tld}. ${
          oldest === newest ? `Data as of ${newest}` : `Data from ${oldest} to ${newest}`
        }. The order follows the selected column (default: total over 3 years, gross) and is not a recommendation.`,
      machineReadable: 'Machine-readable:',
      otherTlds: 'Other extensions',
    },
    portfolio: {
      title: 'Portfolio calculator: several domains compared · tldcost',
      description:
        'What does a whole domain portfolio cost over 1, 2, 3 or 5 years? Total price per provider for several extensions and counts, newly registered or transferred. Open data, no affiliate links.',
      h1: 'Portfolio calculator',
      intro:
        'Several domains, several extensions: enter your portfolio and see what it costs per provider over the selected period. The calculation is the same as in the table (setup fee once per domain, every payment due in full, see the methodology). A provider without one of the extensions or without a required value gets no total.',
      noscript: 'The portfolio calculator runs in your browser and needs JavaScript.',
    },
    api: {
      title: 'API: domain prices as open data | tldcost',
      description:
        'All tldcost prices and contract terms as static JSON files: no key, no cookies, with an OpenAPI description and JSON Schema.',
      h1: 'API: all data as JSON',
      intro: (base) =>
        `All data on this site is available as static JSON files at <code>${base}/</code>. They are rebuilt with every data update from the same data as the table. No API key, no sign-up, no cookies, no query parameters. Requests from other websites are allowed (CORS for any origin, only <code>GET</code> and <code>HEAD</code>).`,
      files: {
        h2: 'Files',
        aria: 'Files of the API',
        path: 'Path',
        content: 'Content',
        all: 'All providers, offers and ECB rates, plus the derived total cost',
        tlds: 'All extensions with offers, with their count and a link to the file per extension',
        offers: (example) => `Offers of one extension and their providers, e.g. ${example}`,
        openapi: 'Description of all files as OpenAPI 3.1',
        schema: (list) => `JSON Schema (2020-12) of the raw data: ${list}`,
      },
      tldCount: (n, list) => `Currently ${n} ${n2(n, 'extension', 'extensions')}: ${list}.`,
      structure: {
        h2: 'Structure',
        intro: 'Every file starts with the same fields:',
        versions:
          'Version of the API (1) and of the record schema (2). Since schema 2, the yes/no features can also be <code>"paid"</code>; <code>feature_costs</code> gives the source and, where stated, the price.',
        dataVersion:
          'Checksum over all data (<code>sha256:…</code>). It changes exactly when the data changes. To detect new data, comparing this field is enough.',
        license: (link) => `Licence of the data and a suggested attribution, see ${link}.`,
        dates: (oldest, newest) =>
          `Newest and oldest fetch time (<code>evidence.fetched_at</code>) of the offers in the file. Currently for all data: ${oldest} to ${newest}.`,
        raw: '<code>providers</code>, <code>offers</code> and <code>fx</code> are the raw data exactly as they are in the repository. Amounts are whole cents in the currency of the offer; <code>vat_included</code> says whether VAT is included. Every price has evidence (<code>evidence.source_url</code>, <code>evidence.fetched_at</code>).',
        unit: '<strong>Important:</strong> the recurring prices (<code>price.year1</code>, <code>year1_regular</code>, <code>renewal</code>, <code>year2</code>, <code>year3</code>) are in the unit of <code>price.unit</code>: per year for <code>"year"</code>, per <strong>month</strong> for <code>"month"</code>. <code>price.setup</code> and the transfer prices are one-off.',
        derived:
          '<code>derived</code> contains values calculated from these, with the same code as the table: under <code>derived.tco["&lt;provider&gt;/&lt;tld&gt;"]</code> the total cost over 2, 3 and 5 years (<code>sum_2y</code> … <code>sum_5y</code>) and the average per year (<code>avg_2y</code> … <code>avg_5y</code>), gross and net, plus the one-off setup fee (<code>setup</code>). All values are euro cents; <strong>monthly prices are annualised (× 12)</strong>, foreign currencies converted at the ECB rate. If a value is missing, the totals are <code>null</code> and <code>missing</code> names what is missing. The raw data always prevails.',
        example:
          'Example: an offer with <code>price.unit: "month"</code>, <code>price.year1: 42</code> and <code>vat_included: true</code> costs €0.42 per month including VAT, i.e. €5.04 per year. <code>derived.tco[…].gross</code> then has <code>avg_3y: 504</code> and <code>sum_3y: 1512</code> (without setup fee).',
      },
      example: {
        h2: 'Example',
        unknownPaths: 'unknown paths return HTML',
        unit: 'price.year1 is per price.unit (year or month); derived is always EUR per year',
        cents: 'cents',
      },
      rules: {
        h2: 'Rules',
        noWarranty:
          'No warranty and no guaranteed availability. The files are served from a CDN; normal use is no problem.',
        notFound:
          'Unknown paths return the HTML error page with status 404, not JSON. Please check the status before reading the response as JSON.',
        v1: '<code>v1</code> only changes by additions (new fields, new files). Please ignore unknown fields. Anything that is not backwards compatible comes under <code>/api/v2/</code>.',
        report: (href) => `Please <a href="${href}">report</a> errors in the data, with evidence.`,
      },
      license: {
        h2: 'Licence',
        id: 'licence',
        deed: 'https://creativecommons.org/licenses/by/4.0/deed.en',
        text: (link) =>
          `The API data is licensed under ${link}. Use, sharing and adaptation are allowed for any purpose, including commercially, if you credit the source, link to the licence and indicate changes. Every file names the licence in the field <code>license</code>. Attribution, for example:`,
        after: (site, code) =>
          `with a link to ${site}. The tldcost code is licensed under the ${code}.`,
      },
    },
    apiIndex: {
      title: 'API v1',
      description: 'Files of the tldcost API v1 and a link to the documentation.',
      h: 'API v1',
      intro:
        'This address holds the JSON files of the tldcost API. The documentation explains their structure and the rules that apply.',
      doc: 'To the API documentation',
      files: 'Files',
    },
    suggest: { question: 'Provider missing?', link: 'Suggest one' },
  },
};
