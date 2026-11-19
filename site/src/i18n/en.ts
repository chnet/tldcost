// English texts of the site (Archiv-Issue 33). Same keys and signatures as de.ts (type Messages). Style (owner
// rules): en-GB formats (€4.07, €0.42/month, avg €5.09/yr, 13 Nov 2026), the reader is "you",
// sentence case for headings, labels and buttons. German data text (promo conditions, editorial
// notes, country notes, AGB sections) is never translated: it is quoted verbatim and marked
// lang="de" ({ de: text } parts, rendered by NoteBody).
import type { NotePart, NoteText } from '../lib/payload';
import { createFormat } from './format';
import type { Locale, Messages } from './de';

const n2 = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const en: Messages = {
  lang: 'en',

  common: {
    missing: 'n/a',
    yes: 'yes',
    no: 'no',
    gross: 'gross',
    net: 'net',
    footnote: (n) => `Footnote ${n}`,
    stale: 'out of date',
  },

  columns: {
    provider: { label: 'Provider' },
    country: { label: 'Country' },
    setup: { label: 'Setup' },
    year1: { label: 'Year 1' },
    year2: { label: 'Year 2' },
    year3: { label: 'Year 3' },
    sum_2y: { label: 'Total 2 yrs' },
    sum_3y: { label: 'Total 3 yrs' },
    sum_5y: { label: 'Total 5 yrs' },
    notice_days: { label: 'Notice period', unit: 'days', unitOne: 'day' },
    min_term_months: {
      label: 'Minimum term',
      unit: 'months',
      unitOne: 'month',
      zero: 'no minimum term',
    },
    ssl_free: { label: 'SSL certificate' },
    fwd_301: { label: '301' },
    fwd_302: { label: '302' },
    dns_editor: { label: 'DNS editor' },
    custom_ns: { label: 'Custom NS' },
    renewal: { label: 'Regular renewal' },
    transfer_in: { label: 'Transfer in' },
    transfer_out: { label: 'Transfer out' },
    billing_cycle: { label: 'Billing' },
    auto_renew: { label: 'Auto-renewal' },
    dnssec: { label: 'DNSSEC' },
    email_fwd: { label: 'Email forwarding' },
    whois_privacy: { label: 'Whois privacy' },
    api: { label: 'API' },
    two_factor: { label: '2FA' },
    payment: { label: 'Payment methods' },
    fetched_at: { label: 'Data as of' },
  },

  enums: {
    monthly: 'monthly',
    yearly: 'yearly',
    'multi-year': 'multi-year',
    free: 'free',
    paid: 'paid',
    none: 'not offered',
    'n/a': 'not applicable',
  },

  badges: {
    text: {
      promo: 'Promotional price',
      verified: 'Confirmed by provider',
      operator: 'Operator’s own offer',
    },
    legend: {
      promo:
        'Year 1 is a promotional price. Its term and conditions are in the footnote and in the details.',
      verified: 'The provider has confirmed its data; the affiliation has been checked.',
      operator:
        'The operator of tldcost sells domains under this name itself. The same rules apply as for everyone: no highlighting, no different sorting.',
    },
    bestSample: 'highlighted',
    bestLegend: {
      all: 'Lowest value in this column among all providers of the extension.',
      filtered: 'Lowest value in this column among the filtered providers.',
    },
    paidLegend: {
      yes: 'Included, no extra charge.',
      paid: 'Only for a fee. The price and the source are in the details.',
    },
  },

  table: {
    empty: 'No data yet. The first prices will follow soon.',
    perMonth: (eur) => `${eur}/month`,
    perMonthSpoken: (eur) => ` per year, equivalent to ${eur} per month`,
    avg: (eur) => `avg ${eur}/yr`,
    promoExpired: 'Promotion expired',
    unitGross: '€ gross',
    unitNet: '€ net',
    asc: 'ascending',
    desc: 'descending',
    bestSpoken: {
      all: ', lowest value in this column',
      filtered: ', lowest value among the filtered providers',
    },
    status: (p) =>
      (p.filtered
        ? `${p.shown} of ${p.total} providers`
        : `${p.shown} ${n2(p.shown, 'provider', 'providers')}`) +
      ` for .${p.tld}` +
      (p.filtered ? ` · filtered by ${p.filters.join(', ')}` : '') +
      ` · sorted by ${p.sort} · prices ` +
      (p.vat === 'gross' ? 'gross incl. VAT' : 'net excl. VAT') +
      ' in €' +
      (p.asOf ? ` · data as of ${p.asOf}` : '') +
      (p.best
        ? ` · highlighted: ${
            p.best === 'filtered'
              ? 'lowest value among the filtered providers'
              : 'lowest value per column'
          }`
        : ''),
    activeFilters: 'Active filters',
    removeFilter: (label) => `Remove filter ${label}`,
    resetFilters: 'Reset all filters',
    filterPanel: (active) => `Filters${active > 0 ? ` (${active} active)` : ''}`,
    region: (tld) => `Prices for .${tld}, scrolls horizontally`,
    caption: (tld, sort) => `Domain prices for .${tld}, sorted by ${sort}`,
    noMatch:
      'No provider matches the filters. With “Reset all filters” you see all providers again.',
    details: 'Details',
    detailsFor: (name) => ` for ${name}`,
  },

  controls: {
    tld: 'TLD',
    prices: 'Prices',
    search: 'Search providers',
    searchPlaceholder: 'e.g. INWX',
    columns: (checked, total) => `Columns (${checked} of ${total})`,
  },

  filters: {
    contains: (text) => `contains “${text}”`,
    containsPlaceholder: 'contains …',
    ariaText: (label) => `Filter ${label}: contains`,
    ariaGroup: (label) => `Filter ${label}`,
    from: 'from',
    to: 'to',
    ariaFrom: (label, unit) => `Filter ${label}: from${unit ? ` (${unit})` : ''}`,
    ariaTo: (label, unit) => `Filter ${label}: to${unit ? ` (${unit})` : ''}`,
    ariaNa: (label) => `Filter ${label}: show rows without a value (n/a)`,
    ariaPick: (label, summary) => `Filter ${label}: ${summary}`,
    all: 'all',
    any: 'any',
    none: 'nothing selected',
    maxDays: (d) => `≤ ${d} days`,
    between: (a, b) => `${a} to ${b}`,
    atLeast: (a) => `from ${a}`,
    atMost: (b) => `up to ${b}`,
    withoutNa: 'without n/a',
  },

  detail: {
    sources: { offer: 'per offer', provider: 'per terms' },
    statedVat: { gross: 'gross', net: 'net', none: 'no VAT statement' },
    perMonthUnit: '/month',
    pricesHeading: 'Prices as stated by the provider',
    raw: {
      year1: 'Year 1',
      year1Regular: 'Year 1 regular',
      renewal: 'Renewal',
      setup: 'Setup',
    },
    term: 'Term',
    termText: (years) => `The first payment covers ${years} years.`,
    renewalTerm: 'Renewal by',
    renewalTermText: (years) => `${years} years per payment`,
    promo: 'Promotion',
    promoExpired: 'Promotion (expired)',
    conditionsMissing: 'Conditions not stated',
    validUntil: 'Valid until',
    notStated: 'not stated',
    expiredNote: 'expired, the price may be out of date',
    regularYear1: 'Regular in the first year',
    paidHeading: 'Paid features',
    paidUnit: { year: '/year', month: '/month', once: ' one-off' },
    paidSource: 'source',
    contractHeading: 'Contract',
    country: 'Country',
    terms: 'Terms',
    termsOf: (name) => `Terms of ${name}`,
    section: 'Reference',
    reviewed: 'Terms reviewed on',
    evidenceHeading: 'Evidence',
    method: 'Collection',
    confidence: 'Reliability',
    endpoint: 'Fetched via',
    hash: 'Checksum',
    screenshot: 'Screenshot',
    screenshotLink: 'Screenshot of the source',
    verified: 'Confirmed by provider',
    verifiedYes: 'yes, affiliation checked',
    source: 'Source:',
    priceSourceOf: (name) => `price page of ${name}`,
    fetchedOn: 'collected on',
    report: 'Report an error',
    reportGithub: (hint) => `(form on GitHub; ${hint})`,
    reportMail: (email) => `(email to ${email})`,
    noGithubHint: (email) => `Without a GitHub account: email ${email}.`,
    reportPrivacy:
      'Issues on GitHub are public: please do not enter personal data (name, address, customer number, invoices, screenshots with personal data).',
    methods: {
      api: 'from a price list or interface of the provider',
      scrape: 'read automatically from the price page',
      manual: 'entered by hand',
    },
    confidences: { high: 'high', medium: 'medium', low: 'low' },
  },

  quote: {
    conditions: (text) => ['“', { de: text }, '”'],
    data: (text) => [{ de: text }],
    statement: (text, lang) => (lang === 'en' ? `“${text}”` : ['“', { de: text }, '”']),
  },

  basket: {
    notes: {
      vatNotStated:
        'The provider makes no statement on VAT. The prices are taken as stated, gross and net ' +
        'are the same. The total should therefore not be read as a gross price.',
      monthly: 'The provider states monthly prices. The totals count them at 12 months per year.',
      transfer:
        'For a transfer we count the transfer fee plus the renewal price from the first year, ' +
        'unless the provider states that the transfer includes one year of registration. ' +
        'Promotional prices for new registrations do not apply to transfers.',
      regularFromRenewal: 'Regular first-year price not stated; calculated with the renewal price.',
      mix:
        'The cheapest provider per extension (all of them on a tie). This means several ' +
        'customer accounts; the effort of moving and managing them is not included.',
      fx: (currency, date, rate) =>
        `Converted from ${currency} at the ECB reference rate of ${date} ` +
        `(1 EUR = ${rate} ${currency}).`,
      foreignMarket: (country, date, pct) =>
        `${country} price, converted at the rate of ${date}, plus ${pct}% VAT; ` +
        'the price for customers in Germany may differ.',
      foreignMarketNet: (country, date) =>
        `${country} price, converted at the rate of ${date}; ` +
        'the price for customers in Germany may differ.',
      vatNet: (pct) => `The provider states net prices. Gross = net plus ${pct}% VAT.`,
      vatGross: (pct) =>
        `The provider states gross prices. Net = gross without the included ${pct}% VAT.`,
      promo: (p): NoteText => {
        const parts: NotePart[] = [`Year 1 of .${p.tld} is a promotional price`];
        if (p.conditions) parts.push(' (provider’s wording, German): “', { de: p.conditions }, '”');
        else parts.push('.');
        if (p.until) parts.push(` Valid until ${p.until}.`);
        if (p.max !== null) {
          parts.push(
            ` According to the provider it applies to at most ${p.max} ` +
              `${n2(p.max, 'domain', 'domains')} of this extension; we count any further ones ` +
              'at the regular price in year 1.',
          );
        }
        if (p.unlimited) {
          parts.push(' According to the provider there is no limit per customer');
          if (p.unlimited.quote) {
            parts.push(' (provider’s wording, German: “', { de: p.unlimited.quote }, '”)');
          }
          parts.push('; we count the promotional price for every domain of this extension.');
        }
        return parts;
      },
      poolOne: (where) =>
        `Promotion only once per customer; counted for ${where}. ` +
        'If it applies to another TLD, the total can be lower.',
      pool: (budget, counted) =>
        `Promotion per customer for at most ${budget} domains; counted for ${counted}. ` +
        'If it applies to other TLDs, the total can be lower.',
      term: (tld, quote, url): NoteText => {
        const parts: NotePart[] = [
          `According to the provider the transfer for .${tld} includes a term; the first ` +
            'renewal is due after it.',
        ];
        if (quote) parts.push(' “', { de: quote }, '”');
        if (url) parts.push(` Source: ${url}`);
        return parts;
      },
    },
    perDomain: (eur) => `${eur} per domain`,
    promoTag: ' (promotion)',
    promoSplit: (promo, each, regular, eachRegular) =>
      `${promo} × ${each} (promotion), ${regular} × ${eachRegular}`,
    gap: {
      notOffered: { text: 'missing', spoken: 'not offered' },
      noTransfer: { text: 'transfer price missing', spoken: 'no transfer price known' },
      termUnclear: {
        text: 'transfer term unclear',
        spoken: 'unclear which term the transfer includes',
      },
      missing: (fields) => `value missing: ${fields}`,
    },
    domains: 'Domains',
    modes: { new: 'register new', transfer: 'move existing ones (transfer)' },
    period: 'Period',
    years: (y) => (y === 1 ? '1 year' : `${y} years`),
    prices: 'Prices',
    portfolio: 'Portfolio',
    countOf: (tld) => `Number of .${tld} domains`,
    remove: (tld) => `Remove .${tld}`,
    add: 'Add extension',
    choose: 'Choose extension …',
    emptyBefore: 'No domains in your portfolio yet. Add extensions with a count, for example',
    emptyAfter: '.',
    status: (p) =>
      (p.filtered
        ? `${p.shown} of ${p.providers} providers`
        : `${p.providers} ${n2(p.providers, 'provider', 'providers')}`) +
      ` · ${p.domains} ${n2(p.domains, 'domain', 'domains')} · ` +
      `${p.years === 1 ? '1 year' : `${p.years} years`} · ` +
      `${p.mode === 'new' ? 'new registration' : 'transfer of existing domains'} · prices ` +
      `${p.vat === 'gross' ? 'gross incl. VAT' : 'net excl. VAT'} in €` +
      (p.filtered ? ` · filtered by ${p.filters.join(', ')}` : '') +
      ` · sorted by ${p.sort}` +
      (p.best
        ? ` · highlighted: ${
            p.best === 'filtered'
              ? 'lowest value among the filtered providers'
              : 'lowest value per column'
          }`
        : ''),
    region: 'Portfolio cost per provider, scrolls horizontally',
    caption: (years, sort) =>
      `Cost of the portfolio over ${years} ${n2(years, 'year', 'years')} per provider, ` +
      `sorted by ${sort}`,
    provider: 'Provider',
    country: 'Country',
    complete: 'Complete',
    assumption: 'Assumption',
    sortName: {
      provider: 'provider',
      country: 'country',
      total: 'total',
      complete: 'complete',
      assumption: 'assumption',
    },
    sortText: (name, dir) => `${name}, ${dir === 'asc' ? 'ascending' : 'descending'}`,
    bestLegend: {
      all: 'Lowest value in this column among all providers.',
      filtered: 'Lowest value in this column among the filtered providers.',
    },
    total: (years) => `Total ${years} ${n2(years, 'yr', 'yrs')}`,
    incomplete: 'incomplete',
    incompleteSpoken: ', no total',
    noPrices: 'There are no prices for these extensions yet.',
    mix: 'Cheapest combination',
    mixMissing: 'missing',
    mixMissingSpoken: ' (not complete at any provider)',
  },
};

export const EN: Locale = { lang: 'en', m: en, f: createFormat('en') };
