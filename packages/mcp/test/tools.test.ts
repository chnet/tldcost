import { describe, expect, it } from 'vitest';
import {
  compare,
  getOffers,
  getProvider,
  listTlds,
  parseProviders,
  parseTld,
  ToolInputError,
} from '../src/tools.js';
import { BASE, fakeApi, fixture } from './helpers.js';

// snapshot of the Route 53 .ai record from Archiv-Issue 118: offered, every price null (k. A.)
const { offer: AI_OFFER, provider: ROUTE53 } = fixture<{ offer: unknown; provider: unknown }>(
  'null-prices.json',
);

interface RawDoc {
  offers: { provider: string; tld: string; price: Record<string, unknown> }[];
  providers: { id: string }[];
  derived: { tco: Record<string, Record<'gross' | 'net', Record<string, number | null>>> };
}

const LICENSE = {
  name: 'CC BY 4.0',
  spdx: 'CC-BY-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
};

describe('list_tlds', () => {
  it('lists TLDs with offer counts, data date and license', async () => {
    const { api } = fakeApi();
    const r = await listTlds(api);
    const doc = fixture<{ tlds: { tld: string; offers: number }[]; data_updated: string }>(
      'tlds.json',
    );
    expect(r.tlds).toEqual(doc.tlds.map((t) => ({ tld: t.tld, offers: t.offers })));
    expect(r.tlds[0]).toEqual({ tld: 'de', offers: expect.any(Number) });
    expect(r.source).toMatchObject({
      api_url: `${BASE}/tlds.json`,
      data_updated: doc.data_updated,
      retrieved_at: '2026-11-15T08:00:00.000Z',
      license: LICENSE,
    });
    expect(r.source.license.attribution).toContain('tldcost.io');
  });
});

describe('get_offers', () => {
  it('returns every offer with raw price, TCO, promo flag and evidence', async () => {
    const { api } = fakeApi();
    const r = await getOffers(api, { tld: '.DE', years: 3 });
    expect(r).toMatchObject({ tld: 'de', years: 3, vat: 'gross', currency: 'EUR' });
    expect(r.offers.map((o) => o.provider)).toEqual([...r.offers.map((o) => o.provider)].sort());
    expect(r.note).toContain('not ranked');
    // the operator's own offer is marked, nothing else
    expect(r.offers.filter((o) => o.operator).map((o) => o.provider)).toEqual(['chnet-domains']);
    const ionos = r.offers.find((o) => o.provider === 'ionos');
    // monthly price: raw unit kept, TCO annualised (12 x 0,08 € in year 1, 12 x 1,30 € after)
    expect(ionos?.raw).toMatchObject({ unit: 'month', year1: 8, renewal: 130 });
    expect(ionos?.tco).toMatchObject({
      years: 3,
      per_year_eur: [0.96, 15.6, 15.6],
      total_eur: 32.16,
    });
    expect(ionos?.promo).toMatchObject({ active: true, valid_until: null });
    expect(ionos?.evidence).toMatchObject({ source_url: expect.stringMatching(/^https:\/\//) });
    const inwx = r.offers.find((o) => o.provider === 'inwx');
    expect(inwx?.promo).toEqual({ active: false, conditions: null, valid_until: null });
    expect(r.source.api_url).toBe(`${BASE}/offers/de.json`);
  });

  it('converts non-EUR offers at the ECB rate the API names', async () => {
    const { api } = fakeApi();
    const r = await getOffers(api, { tld: 'com', years: 1 });
    const porkbun = r.offers.find((o) => o.provider === 'porkbun');
    expect(porkbun?.raw).toMatchObject({ currency: 'USD', vat_included: null });
    expect(porkbun?.tco.fx).toEqual({ currency: 'USD', date: '2026-11-12', per_eur: 1.1081 });
    expect(porkbun?.tco.vat_not_stated).toBe(true);
    expect(porkbun?.tco.missing).toEqual([]);
  });

  it('names a foreign market display in raw (owner decision 2026-11-19)', async () => {
    const doc = fixture<{ offers: Record<string, unknown>[] }>('offers/com.json');
    const offers = doc.offers.map((o) =>
      o.provider === 'porkbun'
        ? {
            ...o,
            foreign_market: { country: 'US', currency: 'USD', quote: 'Price list: .com 11.08' },
          }
        : o,
    );
    const { api } = fakeApi({ 'offers/com.json': { body: { ...doc, offers } } });
    const r = await getOffers(api, { tld: 'com', years: 1 });
    expect(r.offers.find((o) => o.provider === 'porkbun')?.raw.foreign_market).toBe('US');
    for (const o of r.offers.filter((x) => x.provider !== 'porkbun')) {
      expect(o.raw.foreign_market).toBeNull();
    }
  });

  it('agrees with the API derived block (same computeTco as the site), gross and net', async () => {
    const { api } = fakeApi();
    for (const tld of ['de', 'com']) {
      const doc = fixture<RawDoc>(`offers/${tld}.json`);
      for (const vat of ['gross', 'net'] as const) {
        for (const years of [2, 3, 5]) {
          const r = await getOffers(api, { tld, years, vat });
          for (const o of r.offers) {
            const d = doc.derived.tco[`${o.provider}/${tld}`]?.[vat];
            const sum = d?.[`sum_${years}y`];
            expect(o.tco.total_eur, `${o.provider}/${tld} ${vat} ${years}y`).toBe(
              sum === null || sum === undefined ? null : sum / 100,
            );
            expect(o.tco.setup_eur).toBe(d?.setup === null ? null : (d?.setup as number) / 100);
          }
        }
      }
    }
  });

  it('rejects wrong input and unknown TLDs as input errors', async () => {
    const { api } = fakeApi();
    await expect(getOffers(api, {})).rejects.toThrow('tld must be a string');
    await expect(getOffers(api, { tld: 'de com' })).rejects.toThrow('not a TLD');
    await expect(getOffers(api, { tld: 'a'.repeat(64) })).rejects.toThrow('not a TLD');
    await expect(getOffers(api, { tld: 'de', years: 0 })).rejects.toThrow('years must be');
    await expect(getOffers(api, { tld: 'de', years: 11 })).rejects.toThrow('years must be');
    await expect(getOffers(api, { tld: 'de', years: 2.5 })).rejects.toThrow('years must be');
    await expect(getOffers(api, { tld: 'de', years: '3' })).rejects.toThrow('years must be');
    await expect(getOffers(api, { tld: 'de', vat: 'brutto' })).rejects.toThrow('vat must be');
    const missing = getOffers(api, { tld: 'zz' });
    await expect(missing).rejects.toBeInstanceOf(ToolInputError);
    await expect(missing).rejects.toThrow('no offers for .zz');
    expect(parseTld(' co.UK ')).toBe('co.uk');
  });

  it('passes other API failures through', async () => {
    const { api } = fakeApi({ 'offers/de.json': { status: 503, text: 'down' } });
    await expect(getOffers(api, { tld: 'de' })).rejects.toThrow('HTTP 503');
  });

  it('copes with offers whose provider record or optional fields are missing', async () => {
    const doc = fixture<RawDoc>('offers/de.json');
    const offer = doc.offers.find((o) => o.provider === 'inwx');
    const lone = {
      ...doc,
      providers: [],
      offers: [{ ...offer, price: { unit: 'year', setup: null, year1: 500, renewal: null } }],
    };
    const { api } = fakeApi({ 'offers/de.json': { body: lone } });
    // inwx states net prices: gross mode needs the provider's VAT rate, which is missing here
    const r = await getOffers(api, { tld: 'de', years: 2, vat: 'gross' });
    expect(r.offers[0]).toMatchObject({
      provider: 'inwx',
      provider_name: 'inwx',
      operator: false,
      raw: { year1_regular: null, transfer_in: null, term_years: 1, renewal_term_years: 1 },
      tco: { total_eur: null, setup_eur: null },
    });
    expect(r.offers[0]?.tco.missing).toEqual(expect.arrayContaining(['vat_rate']));
  });

  it('offered without any amount (Route 53 .ai): no default term, nulls pass through', async () => {
    const doc = fixture<RawDoc>('offers/de.json');
    // the API's derived entry names the ECB USD rate (taken from porkbun/de, also USD)
    const derived = { ...doc.derived, tco: { 'aws-route53/ai': doc.derived.tco['porkbun/de'] } };
    const ai = { ...doc, tld: 'ai', providers: [ROUTE53], offers: [AI_OFFER], derived };
    const { api } = fakeApi({ 'offers/ai.json': { body: ai } });
    const r = await getOffers(api, { tld: 'ai', years: 3, vat: 'net' });
    expect(r.offers[0]).toMatchObject({
      provider: 'aws-route53',
      raw: {
        currency: 'USD',
        setup: null,
        year1: null,
        year1_regular: null,
        renewal: null,
        transfer_in: null,
        term_years: null,
        renewal_term_years: null,
      },
      tco: {
        total_eur: null,
        avg_per_year_eur: null,
        per_year_eur: [null, null, null],
        fx: { currency: 'USD' },
      },
    });
    expect(r.offers[0]?.tco.missing).toEqual(['price.setup', 'price.year1', 'price.renewal']);
  });
});

describe('compare', () => {
  it('sorts by total cost, lowest first, without rating', async () => {
    const { api } = fakeApi();
    const r = await compare(api, { tld: 'de', years: 3 });
    expect(r).toMatchObject({ tld: 'de', years: 3, vat: 'gross', sort: 'total' });
    const totals = r.rows.map((row) => row.total_eur as number);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(r.rows.map((row) => row.position)).toEqual(r.rows.map((_, i) => i + 1));
    expect(r.note).toContain('not a recommendation');
    expect(JSON.stringify(r)).not.toMatch(/\b(best|recommended|empfohlen)\b/i);
    expect(r.rows.find((row) => row.provider === 'ionos')).toMatchObject({
      raw_unit: 'month',
      raw_currency: 'EUR',
      promo: true,
      year1_eur: 0.96,
    });
  });

  it('filters providers and sorts by first-year payment or provider id', async () => {
    const { api } = fakeApi();
    const two = await compare(api, {
      tld: 'de',
      providers: ['netcup', 'inwx', 'inwx'],
      sort: 'year1',
    });
    // netcup 12 x 0,42 € = 5,04 € before inwx 5,02 € net = 5,97 € gross
    expect(two.rows.map((row) => row.provider)).toEqual(['netcup', 'inwx']);
    expect(two.note).toContain('first-year payment');
    const byId = await compare(api, { tld: 'de', sort: 'provider' });
    expect(byId.rows.map((row) => row.provider)).toEqual(
      [...byId.rows.map((row) => row.provider)].sort(),
    );
    expect(byId.note).toBe('Listed by provider id.');
    await expect(compare(api, { tld: 'de', providers: ['inwx', 'nope'] })).rejects.toThrow(
      'no .de offer from: nope',
    );
    await expect(compare(api, { tld: 'de', sort: 'cheapest' })).rejects.toThrow('sort must be');
  });

  it('puts offers with unknown amounts last, ties by provider id', async () => {
    const doc = fixture<RawDoc>('offers/de.json');
    const unknown = (id: string) => ({
      ...doc.offers.find((o) => o.provider === id),
      price: { unit: 'year', setup: 0, year1: null, renewal: null },
    });
    const body = {
      ...doc,
      offers: [unknown('netcup'), doc.offers.find((o) => o.provider === 'inwx'), unknown('ionos')],
    };
    const { api } = fakeApi({ 'offers/de.json': { body } });
    const r = await compare(api, { tld: 'de' });
    expect(r.rows.map((row) => [row.provider, row.total_eur])).toEqual([
      ['inwx', expect.any(Number)],
      ['ionos', null],
      ['netcup', null],
    ]);
    const y1 = await compare(api, { tld: 'de', sort: 'year1' });
    expect(y1.rows.map((row) => row.provider)).toEqual(['inwx', 'ionos', 'netcup']);
    const same = {
      ...body,
      offers: [doc.offers.find((o) => o.provider === 'inwx'), unknown('ionos')],
    };
    const { api: api2 } = fakeApi({
      'offers/de.json': { body: { ...same, offers: [...same.offers].reverse() } },
    });
    expect((await compare(api2, { tld: 'de' })).rows.map((row) => row.provider)).toEqual([
      'inwx',
      'ionos',
    ]);
  });

  it('validates the provider list', () => {
    expect(parseProviders(undefined)).toBeUndefined();
    for (const bad of [[], 'inwx', [1], ['INWX'], Array.from({ length: 51 }, (_, i) => `p${i}`)]) {
      expect(() => parseProviders(bad)).toThrow('providers must be');
    }
  });
});

describe('get_provider', () => {
  it('returns contract terms, country and features per offer', async () => {
    const { api } = fakeApi();
    const r = await getProvider(api, { provider: 'inwx' });
    expect(r.provider).toMatchObject({ id: 'inwx', operator: false, vat_rate_percent: 19 });
    expect(r.terms).toMatchObject({
      url: expect.stringMatching(/^https:\/\//),
      min_term_months: expect.any(Number),
    });
    expect(r.offers.map((o) => o.tld).sort()).toEqual(['com', 'de']);
    expect(r.offers[0]?.contract).toHaveProperty('notice_period_days');
    expect(r.source.api_url).toBe(`${BASE}/all.json`);
    const op = await getProvider(api, { provider: 'chnet-domains' });
    expect(op.provider.operator).toBe(true);
  });

  it('handles providers without terms, VAT rate or offers', async () => {
    const all = fixture<RawDoc>('all.json');
    const body = {
      ...all,
      providers: [
        {
          schema_version: 1,
          id: 'x',
          name: 'X',
          website: 'https://x.test/',
          country: 'US',
          vat_rate: null,
        },
      ],
    };
    const { api } = fakeApi({ 'all.json': { body } });
    const r = await getProvider(api, { provider: 'x' });
    expect(r.provider).toMatchObject({
      vat_rate_percent: null,
      operator: false,
      reviewed_at: null,
    });
    expect(r.terms).toEqual({
      url: null,
      section: null,
      min_term_months: null,
      notice_period_days: null,
      billing_cycle: null,
      auto_renew_default: null,
      notes: {},
    });
    expect(r.offers).toEqual([]);
  });

  it('reports unknown providers with the known ids', async () => {
    const { api } = fakeApi();
    await expect(getProvider(api, { provider: 'nope' })).rejects.toThrow(
      /unknown provider "nope"; known: .*inwx/,
    );
    await expect(getProvider(api, { provider: 'Bad Id' })).rejects.toThrow('provider must be');
    await expect(getProvider(api, {})).rejects.toThrow('provider must be');
  });

  it('defaults features to an empty object', async () => {
    const all = fixture<RawDoc & { offers: Record<string, unknown>[] }>('all.json');
    const body = {
      ...all,
      offers: all.offers.map((o) => {
        const rest = { ...(o as Record<string, unknown>) };
        delete rest.features;
        delete rest.feature_costs;
        return rest;
      }),
    };
    const { api } = fakeApi({ 'all.json': { body } });
    const r = await getProvider(api, { provider: 'inwx' });
    expect(r.offers.every((o) => JSON.stringify(o.features) === '{}')).toBe(true);
    expect(r.offers.every((o) => JSON.stringify(o.feature_costs) === '{}')).toBe(true);
  });

  it('passes "paid" and feature_costs through unchanged (Archiv-Issue 124)', async () => {
    const all = fixture<RawDoc & { offers: Record<string, unknown>[] }>('all.json');
    const cost = {
      source: { url: 'https://www.inwx.de/de/offer/dns', quote: 'DNS 1,90 € je Jahr' },
      price_cents: 190,
      unit: 'year',
      note: 'je Domain',
    };
    const body = {
      ...all,
      offers: all.offers.map((o) =>
        o.provider === 'inwx' && o.tld === 'de'
          ? {
              ...o,
              features: { ...(o.features as object), dns_editor: 'paid' },
              feature_costs: { dns_editor: cost },
            }
          : o,
      ),
    };
    const { api } = fakeApi({ 'all.json': { body } });
    const r = await getProvider(api, { provider: 'inwx' });
    const de = r.offers.find((o) => o.tld === 'de');
    expect(de?.features.dns_editor).toBe('paid');
    expect(de?.feature_costs).toEqual({ dns_editor: cost });
    expect(r.note).toContain('"paid"');
  });
});
