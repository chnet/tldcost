import { computeBasket, type FxRates, type Offer, type Provider } from '@tldcost/core';
import { describe, expect, it } from 'vitest';
import {
  basket,
  MAX_BASKET_ROWS,
  NOTE_REGULAR_FROM_RENEWAL,
  parseBasket,
  parseMode,
  poolNote,
  promoNote,
  transferTermNote,
} from '../src/basket.js';
import { BASE, fakeApi, fixture } from './helpers.js';

interface AllDoc {
  providers: Provider[];
  offers: Offer[];
  fx: FxRates[];
}
const all = () => fixture<AllDoc>('all.json');
const vatRates = (doc: AllDoc) =>
  Object.fromEntries(doc.providers.map((p) => [p.id, { vat_rate: p.vat_rate }]));
const cents = (eur: number | null) => (eur === null ? null : Math.round(eur * 100));

describe('basket tool', () => {
  it('returns exactly what core computeBasket computes, in its order', async () => {
    const { api } = fakeApi();
    const doc = all();
    const items = [
      { tld: 'de', count: 2 },
      { tld: 'com', count: 1 },
    ];
    for (const mode of ['new', 'transfer'] as const) {
      for (const vat of ['gross', 'net'] as const) {
        const r = await basket(api, { basket: items, years: 3, vat, mode });
        const core = computeBasket(doc.offers, items, 3, mode, {
          price: vat,
          providers: vatRates(doc),
          fx: doc.fx,
        });
        expect(r.providers.map((p) => p.provider)).toEqual(core.providers.map((p) => p.provider));
        expect(r.providers.map((p) => cents(p.total_eur))).toEqual(
          core.providers.map((p) => p.total),
        );
        expect(cents(r.mix.total_eur)).toBe(core.mix.total);
        expect(r.mix.lines.map((l) => l.providers)).toEqual(core.mix.lines.map((l) => l.providers));
        expect(r.providers.map((p) => p.position)).toEqual(r.providers.map((_, i) => i + 1));
      }
    }
  });

  it('carries the calculator rules as notes, neutral wording, operator marked', async () => {
    const { api } = fakeApi();
    const r = await basket(api, {
      basket: [
        { tld: '.DE', count: 2 },
        { tld: 'com', count: 1 },
      ],
    });
    expect(r).toMatchObject({ years: 3, vat: 'gross', mode: 'new', currency: 'EUR' });
    expect(r.basket).toEqual([
      { tld: 'de', count: 2 },
      { tld: 'com', count: 1 },
    ]);
    expect(r.note).toContain('not a recommendation');
    expect(JSON.stringify(r)).not.toMatch(/\b(best|cheapest|recommended|empfohlen)\b/i);
    expect(r.notes[0]).toMatch(/^Promotional prices count only/);
    // core's term guard: no renewal-price fallback when the first and renewal terms differ
    expect(r.notes[0]).toContain('but only if the registration and renewal terms are equal');
    expect(r.notes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^A provider without an offer/),
        expect.stringMatching(/^Mix: per TLD/),
        expect.stringMatching(/no VAT statement/), // porkbun (USD, vat_included null)
        expect.stringMatching(/monthly prices/), // ionos, netcup
      ]),
    );
    expect(r.providers.filter((p) => p.operator).map((p) => p.provider)).toEqual(['chnet-domains']);
    // ionos has promos for .de and .com without a stated limit: ONE promo domain in total
    const ionos = r.providers.find((p) => p.provider === 'ionos');
    expect(ionos?.promo_pool).toMatchObject({ budget: 1, limited: true });
    expect(ionos?.notes).toEqual([expect.stringMatching(/^Promotion only once per customer/)]);
    const ionosDe = ionos?.lines.find((l) => l.tld === 'de');
    expect(ionosDe).toMatchObject({ raw_unit: 'month', raw_currency: 'EUR', status: 'ok' });
    expect(ionosDe?.notes[0]).toMatch(/^Year 1 of \.de is a promotional price: „/);
    // porkbun: USD at the ECB rate, the conversion is noted on the line
    const porkbun = r.providers.find((p) => p.provider === 'porkbun');
    expect(porkbun?.vat_not_stated).toBe(true);
    const pbCom = porkbun?.lines.find((l) => l.tld === 'com');
    expect(pbCom?.notes).toContain(
      'Converted from USD at the ECB reference rate of 2026-11-12 (1 EUR = 1.1081 USD).',
    );
    expect(r.source.api_url).toBe(`${BASE}/all.json`);
  });

  it('transfer mode: no promos, the transfer note, the stated transfer term on the line', async () => {
    const doc = all();
    doc.offers = doc.offers.map((o) =>
      o.provider === 'inwx' && o.tld === 'de'
        ? {
            ...o,
            price: {
              ...o.price,
              transfer_includes_term: true,
              transfer_includes_term_source: { url: 'https://x.test/t', quote: 'inkl. 1 Jahr' },
            },
          }
        : o,
    );
    const { api } = fakeApi({ 'all.json': { body: doc } });
    const r = await basket(api, { basket: [{ tld: 'de', count: 1 }], mode: 'transfer' });
    expect(r.notes[0]).toMatch(/^Transfer mode: the transfer fee plus the renewal price/);
    expect(r.notes.some((n) => n.startsWith('Promotional prices'))).toBe(false);
    expect(r.providers.every((p) => p.lines.every((l) => l.promo_domains === null))).toBe(true);
    const inwx = r.providers.find((p) => p.provider === 'inwx')?.lines[0];
    expect(inwx).toMatchObject({ transfer_includes_term: true, status: 'ok' });
    expect(inwx?.notes).toEqual([
      'According to the provider, the transfer of .de includes a term; the first renewal is due after it. „inkl. 1 Jahr“ Source: https://x.test/t',
    ]);
  });

  it('limit_scope unlimited: every domain of the TLD at the promo price, outside the pool', async () => {
    const doc = all();
    const quote = 'Alle anderen TLDs unbegrenzt, jedoch nur für Neuregistrierungen.';
    doc.offers = doc.offers.map((o) =>
      o.provider === 'ionos' && o.tld === 'com'
        ? {
            ...o,
            promo: {
              conditions: 'Willkommensangebot',
              max_per_customer: null,
              limit_scope: 'unlimited' as const,
              max_per_customer_source: { quote },
            },
          }
        : o,
    );
    const { api } = fakeApi({ 'all.json': { body: doc } });
    const r = await basket(api, {
      basket: [
        { tld: 'de', count: 2 },
        { tld: 'com', count: 3 },
      ],
      years: 3,
    });
    const ionos = r.providers.find((p) => p.provider === 'ionos');
    const com = ionos?.lines.find((l) => l.tld === 'com');
    expect(com).toMatchObject({ promo_scope: 'unlimited', promo_domains: 3 });
    expect(com?.notes[0]).toContain(
      `According to the provider there is no limit per customer (provider’s wording, German: “${quote}”); every domain of this TLD is counted at the promotional price.`,
    );
    // .com is outside the pool: the pool holds only .de
    expect(ionos?.promo_pool).toMatchObject({ budget: 1, credited: [{ tld: 'de', domains: 1 }] });
    expect(r.notes[0]).toContain('no limit (verbatim quote)');
    // the same numbers as core
    const core = computeBasket(
      doc.offers,
      [
        { tld: 'de', count: 2 },
        { tld: 'com', count: 3 },
      ],
      3,
      'new',
      { providers: vatRates(doc), fx: doc.fx },
    ).providers.find((p) => p.provider === 'ionos');
    expect(cents(ionos?.total_eur ?? null)).toBe(core?.total);
    // the quote equal to the condition is not repeated
    expect(
      promoNote(
        {
          ...(doc.offers.find((o) => o.provider === 'ionos' && o.tld === 'de') as Offer),
          promo: {
            conditions: quote,
            limit_scope: 'unlimited',
            max_per_customer_source: { quote },
          },
        },
        true,
      ),
    ).toBe(
      `Year 1 of .de is a promotional price: „${quote}“ According to the provider there is no limit per customer; every domain of this TLD is counted at the promotional price.`,
    );
  });

  it('a provider missing a basket TLD has no total and comes last; a stated per-TLD limit is noted', async () => {
    const doc = all();
    doc.offers = [
      ...doc.offers.filter((o) => o.tld !== 'com' || o.provider === 'inwx'),
      // a TLD only one provider sells
      { ...(doc.offers.find((o) => o.provider === 'inwx' && o.tld === 'de') as Offer), tld: 'xyz' },
    ].map((o) =>
      o.provider === 'one-com' && o.tld === 'de'
        ? {
            ...o,
            promo: {
              conditions: 'nur Neukunden',
              valid_until: '2026-12-31',
              max_per_customer: 1,
              limit_scope: 'per_tld',
              max_per_customer_source: { url: 'https://x.test/p' },
            },
          }
        : o,
    );
    const { api } = fakeApi({ 'all.json': { body: doc } });
    const r = await basket(api, {
      basket: [
        { tld: 'de', count: 3 },
        { tld: 'xyz', count: 1 },
      ],
      years: 2,
    });
    expect(r.providers[0]).toMatchObject({ provider: 'inwx', complete: true });
    const rest = r.providers.slice(1);
    expect(rest.every((p) => p.total_eur === null && !p.complete)).toBe(true);
    expect(rest[0]?.lines[1]).toMatchObject({
      tld: 'xyz',
      status: 'not_offered',
      subtotal_eur: null,
      raw_unit: null,
      raw_currency: null,
      source_url: null,
      fetched_at: null,
      notes: [],
    });
    const oneDe = r.providers.find((p) => p.provider === 'one-com')?.lines[0];
    expect(oneDe).toMatchObject({ promo_domains: 1, promo_scope: 'per_tld' });
    expect(oneDe?.notes[0]).toBe(
      'Year 1 of .de is a promotional price: „nur Neukunden“ Valid until 2026-12-31. According to the provider it applies to at most 1 domain of this TLD; further domains are counted at the regular price in year 1.',
    );
    expect(r.mix.lines.find((l) => l.tld === 'xyz')?.providers).toEqual(['inwx']);
  });

  it('no regular year-1 price stated: further domains at the renewal price, marked per line', async () => {
    const doc = all();
    doc.offers = doc.offers.map((o) =>
      o.provider === 'ionos' ? { ...o, price: { ...o.price, year1_regular: null } } : o,
    );
    const { api } = fakeApi({ 'all.json': { body: doc } });
    const r = await basket(api, { basket: [{ tld: 'de', count: 3 }], years: 3 });
    const de = r.providers.find((p) => p.provider === 'ionos')?.lines[0];
    expect(de).toMatchObject({ status: 'ok', promo_domains: 1, regular_year1_from_renewal: true });
    expect(de?.notes).toContain(NOTE_REGULAR_FROM_RENEWAL);
    expect(NOTE_REGULAR_FROM_RENEWAL).toBe(
      'Regular first-year price not stated; calculated with the renewal price.',
    );
    // same numbers as core
    const core = computeBasket(doc.offers, [{ tld: 'de', count: 3 }], 3, 'new', {
      providers: vatRates(doc),
      fx: doc.fx,
    }).providers.find((p) => p.provider === 'ionos');
    expect(cents(de?.subtotal_eur ?? null)).toBe(core?.lines[0]?.subtotal);
    expect(r.notes[0]).toMatch(/renewal price is used instead/);
    // other providers' lines and the mix carry the flag as false unless chosen with it
    expect(
      r.providers.find((p) => p.provider === 'inwx')?.lines[0]?.regular_year1_from_renewal,
    ).toBe(false);
    expect(typeof r.mix.lines[0]?.regular_year1_from_renewal).toBe('boolean');
  });

  it('leaves out notes that do not apply; a provider without a record keeps its id', async () => {
    const doc = all();
    const inwxDe = doc.offers.find((o) => o.provider === 'inwx' && o.tld === 'de') as Offer;
    doc.offers = [
      { ...inwxDe, tld: 'xyz' },
      { ...inwxDe, provider: 'unlisted', tld: 'xyz' },
    ];
    const { api } = fakeApi({ 'all.json': { body: doc } });
    const r = await basket(api, { basket: [{ tld: 'xyz', count: 2 }], years: 1 });
    // no promo, no month price, VAT stated: only the general notes
    expect(r.notes).toEqual([
      expect.stringMatching(/^A provider without an offer/),
      expect.stringMatching(/^Mix: per TLD/),
    ]);
    const unlisted = r.providers.find((p) => p.provider === 'unlisted');
    expect(unlisted).toMatchObject({ provider_name: 'unlisted', operator: false, notes: [] });
    // net offer without a provider VAT rate: no gross total, the line says why
    expect(unlisted).toMatchObject({ total_eur: null, complete: false });
    expect(unlisted?.lines[0]).toMatchObject({ status: 'missing', missing: ['vat_rate'] });
    expect(r.mix.lines[0]?.providers).toEqual(['inwx']);
  });

  it('offered without any amount (Route 53 .ai): line missing, no total, no FX note', async () => {
    const doc = all();
    // snapshot of the Route 53 .ai record from Archiv-Issue 118 (test/fixtures/null-prices.json)
    const ai = fixture<{ offer: Offer }>('null-prices.json').offer;
    const deOffer = doc.offers.find((o) => o.provider === 'inwx' && o.tld === 'de') as Offer;
    doc.offers = [ai, { ...deOffer, tld: 'ai' }];
    const { api } = fakeApi({ 'all.json': { body: doc } });
    const items = [{ tld: 'ai', count: 2 }];
    // core does convert the line (USD, fx table present), but it has no amount to show
    const core = computeBasket(doc.offers, items, 3, 'new', {
      price: 'net',
      providers: vatRates(doc),
      fx: doc.fx,
    });
    const coreLine = core.providers.find((p) => p.provider === 'aws-route53')?.lines[0];
    expect(coreLine?.fx).toMatchObject({ currency: 'USD' });
    const r = await basket(api, { basket: items, years: 3, vat: 'net' });
    expect(r.providers.map((p) => p.provider)).toEqual(['inwx', 'aws-route53']);
    const r53 = r.providers[1];
    expect(r53).toMatchObject({ total_eur: null, complete: false, notes: [] });
    expect(r53?.lines[0]).toMatchObject({
      status: 'missing',
      subtotal_eur: null,
      each_eur: null,
      each_at_regular_year1_eur: null,
      missing: ['price.setup', 'price.year1', 'price.renewal'],
      raw_currency: 'USD',
      notes: [],
    });
    expect(r.mix.lines[0]?.providers).toEqual(['inwx']);
  });

  it('rejects wrong input as input errors', async () => {
    const { api } = fakeApi();
    const bad: [unknown, RegExp][] = [
      [undefined, /basket must be a list/],
      [[], /basket must be a list/],
      [
        Array.from({ length: MAX_BASKET_ROWS + 1 }, (_, i) => ({ tld: `t${i}`, count: 1 })),
        /1\.\.20/,
      ],
      [['de'], /items must be objects/],
      [[null], /items must be objects/],
      [[[1]], /items must be objects/],
      [[{ tld: 'de', count: 1, n: 2 }], /unknown basket item field\(s\): n/],
      [[{ tld: 'de', count: 0 }], /count for \.de must be an integer 1\.\.9999/],
      [[{ tld: 'de', count: 1.5 }], /count for \.de/],
      [[{ tld: 'de', count: '2' }], /count for \.de/],
      [[{ tld: 'de', count: 10000 }], /count for \.de/],
      [[{ tld: 'de x', count: 1 }], /not a TLD/],
      [
        [
          { tld: 'de', count: 1 },
          { tld: '.DE', count: 2 },
        ],
        /\.de is listed twice/,
      ],
      [
        [
          { tld: 'zz', count: 1 },
          { tld: 'yy', count: 1 },
        ],
        /no offers for \.zz, \.yy/,
      ],
    ];
    for (const [value, message] of bad) {
      await expect(basket(api, { basket: value })).rejects.toThrow(message);
    }
    await expect(basket(api, { basket: [{ tld: 'de', count: 1 }], mode: 'move' })).rejects.toThrow(
      /mode must be/,
    );
    await expect(basket(api, { basket: [{ tld: 'de', count: 1 }], years: 11 })).rejects.toThrow(
      /years must be/,
    );
    expect(parseMode(undefined)).toBe('new');
    expect(parseBasket([{ tld: 'co.uk', count: 9999 }])).toEqual([{ tld: 'co.uk', count: 9999 }]);
  });

  it('formats the notes for every variant', () => {
    expect(
      poolNote({
        budget: 3,
        credited: [
          { tld: 'de', domains: 2 },
          { tld: 'com', domains: 1 },
        ],
        limited: true,
      }),
    ).toBe(
      'Promotion for at most 3 domains per customer; counted for .de (2), .com (1). If it applies to other TLDs instead, the total can be lower.',
    );
    const offer = all().offers.find((o) => o.provider === 'inwx' && o.tld === 'de') as Offer;
    expect(promoNote({ ...offer, promo: {} })).toBe('Year 1 of .de is a promotional price.');
    expect(
      promoNote({ ...offer, promo: { max_per_customer: 2, limit_scope: 'per_customer' } }),
    ).toBe('Year 1 of .de is a promotional price.');
    expect(promoNote({ ...offer, promo: { max_per_customer: 2, limit_scope: 'per_tld' } })).toMatch(
      /at most 2 domains of this TLD/,
    );
    expect(transferTermNote(offer)).toBe(
      'According to the provider, the transfer of .de includes a term; the first renewal is due after it.',
    );
  });
});
