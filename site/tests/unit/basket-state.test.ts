// Archiv-Issue 74 portfolio calculator: URL state of /portfolio/ and the embedded payload.
import { fileURLToPath } from 'node:url';
import { loadData } from '@tldcost/core/load';
import { MAX_BASKET_COUNT } from '@tldcost/core';
import { DE } from '../../src/i18n/de';
import { EN } from '../../src/i18n/en';
import { describe, expect, it } from 'vitest';
import {
  lineGap,
  perDomain,
  poolNoteText,
  marketNoteId,
  marketNoteText,
  promoNoteText,
} from '../../src/components/BasketCalculator';
import { buildBasketPayload } from '../../src/lib/basket-payload';
import {
  MAX_BASKET_ROWS,
  MAX_COUNT,
  defaultBasketState,
  parseBasket,
  parseBasketState,
  parseCount,
  serializeBasketState,
} from '../../src/lib/basket-state';

const TLDS = ['de', 'com', 'io'];

describe('basket URL state', () => {
  it('round-trips in canonical order and leaves defaults out', () => {
    const s = parseBasketState('?basket=de:10,com:3&years=5&vat=net&mode=transfer', TLDS);
    expect(s).toEqual({
      basket: [
        { tld: 'de', count: 10 },
        { tld: 'com', count: 3 },
      ],
      years: 5,
      vat: 'net',
      mode: 'transfer',
      sort: 'total',
      dir: 'asc',
      q: '',
      f: {},
    });
    expect(serializeBasketState(s)).toBe('?basket=de:10,com:3&years=5&vat=net&mode=transfer');
    expect(serializeBasketState(defaultBasketState())).toBe('');
    expect(serializeBasketState({ ...defaultBasketState(), years: 1 }, 'theme=dark&years=2')).toBe(
      '?years=1&theme=dark',
    );
  });

  it('never fails: unknown TLDs, bad counts, duplicates and bad values fall back', () => {
    expect(parseBasket('de:1,.COM:2,xx:3,io:0,io:10000,io:1.5,de:4,io:2:3,io', TLDS)).toEqual([
      { tld: 'de', count: 1 },
      { tld: 'com', count: 2 },
    ]);
    expect(parseBasket(null, TLDS)).toEqual([]);
    expect(parseBasketState('?years=4&vat=x&mode=new', TLDS)).toEqual(defaultBasketState());
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(parseBasket(many.map((t) => `${t}:1`).join(','), many)).toHaveLength(MAX_BASKET_ROWS);
  });

  it('counts: integers 1..9999, the core limit', () => {
    expect(MAX_COUNT).toBe(MAX_BASKET_COUNT);
    expect([' 7 ', '1', '9999'].map(parseCount)).toEqual([7, 1, 9999]);
    expect(['0', '10000', '', '-1', '2,5', 'x'].map(parseCount)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('basket payload', () => {
  const payload = buildBasketPayload(
    loadData(fileURLToPath(new URL('../fixtures/data', import.meta.url))),
  );

  it('holds the price part of every offer, VAT rates, operator flag and the needed FX rates', () => {
    expect(payload.tlds).toEqual(['de', 'com', 'io']);
    const echo = payload.offers.find((o) => o.provider === 'echo' && o.tld === 'com');
    expect(echo).toMatchObject({ currency: 'USD', vat_included: null });
    expect(echo).not.toHaveProperty('features');
    expect(echo).not.toHaveProperty('contract');
    expect(payload.providers.charlie).toMatchObject({ operator: true, vat_rate: 1900 });
    expect(payload.providers.alpha?.operator).toBe(false);
    for (const t of payload.fx) expect(Object.keys(t.rates)).toEqual(['USD']);
    expect(payload.fx.length).toBeGreaterThan(0);
  });
});

describe('cells without a subtotal', () => {
  it('say why: fehlt, Transfer-Preis fehlt, Transferlaufzeit unklar, k. A.', () => {
    expect(lineGap(DE, { status: 'not_offered', missing: [] }).text).toBe('fehlt');
    expect(lineGap(DE, { status: 'missing', missing: ['price.transfer_in'] }).text).toBe(
      'Transfer-Preis fehlt',
    );
    expect(lineGap(DE, { status: 'missing', missing: ['transfer_term_unclear'] }).text).toBe(
      'Transferlaufzeit unklar',
    );
    expect(lineGap(DE, { status: 'missing', missing: ['price.renewal'] })).toEqual({
      text: 'k. A.',
      spoken: 'Angabe fehlt: price.renewal',
    });
  });
});

describe('promo texts', () => {
  const base = buildBasketPayload(
    loadData(fileURLToPath(new URL('../fixtures/data', import.meta.url))),
  ).offers.find((o) => o.provider === 'alpha' && o.tld === 'de')!;

  it('quote the provider condition; a stated per-TLD limit is named', () => {
    expect(base.promo?.conditions).toBe('nur für Neukunden');
    expect(promoNoteText(DE, base)).toBe(
      'Jahr 1 von .de ist ein Aktionspreis: „nur für Neukunden“ Gültig bis 31.12.2099.',
    );
    const perTld = { ...base, promo: { max_per_customer: 3, limit_scope: 'per_tld' as const } };
    expect(promoNoteText(DE, perTld)).toBe(
      'Jahr 1 von .de ist ein Aktionspreis. Laut Anbieter gilt er für höchstens 3 Domains dieser ' +
        'Endung; weitere rechnen wir in Jahr 1 zum regulären Preis.',
    );
  });

  it('unlimited (owner decision 2026-11-15): the provider quote and the rule, DE and EN', () => {
    const quote = 'Alle anderen TLDs unbegrenzt, jedoch nur für Neuregistrierungen.';
    const free = {
      ...base,
      promo: {
        conditions: 'Aktion im ersten Jahr',
        limit_scope: 'unlimited' as const,
        max_per_customer_source: { quote },
      },
    };
    expect(promoNoteText(DE, free, true)).toBe(
      'Jahr 1 von .de ist ein Aktionspreis: „Aktion im ersten Jahr“ Laut Anbieter ohne ' +
        `Höchstzahl je Kunde („${quote}“); wir rechnen den Aktionspreis für alle Domains ` +
        'dieser Endung.',
    );
    const en = promoNoteText(EN, free, true);
    const text = Array.isArray(en)
      ? en.map((x) => (typeof x === 'string' ? x : 'de' in x ? x.de : x.en)).join('')
      : en;
    expect(text).toContain(
      `According to the provider there is no limit per customer (provider’s wording, German: “${quote}”); ` +
        'we count the promotional price for every domain of this extension.',
    );
    // the quote equal to the condition is not repeated; not unlimited: no sentence
    const same = { ...free, promo: { ...free.promo, conditions: quote } };
    expect(promoNoteText(DE, same, true)).toBe(
      `Jahr 1 von .de ist ein Aktionspreis: „${quote}“ Laut Anbieter ohne Höchstzahl je Kunde; ` +
        'wir rechnen den Aktionspreis für alle Domains dieser Endung.',
    );
    expect(promoNoteText(DE, free)).toBe(
      'Jahr 1 von .de ist ein Aktionspreis: „Aktion im ersten Jahr“',
    );
  });

  it('pool note: the owner wording verbatim for one promo domain', () => {
    expect(
      poolNoteText(DE, { budget: 1, credited: [{ tld: 'com', domains: 1 }], limited: true }),
    ).toBe(
      'Aktion pro Kunde nur einmal; angerechnet auf .com. Gilt sie für eine andere TLD, kann die ' +
        'Summe niedriger sein.',
    );
    expect(
      poolNoteText(DE, {
        budget: 3,
        credited: [
          { tld: 'com', domains: 2 },
          { tld: 'de', domains: 1 },
        ],
        limited: true,
      }),
    ).toBe(
      'Aktion pro Kunde für höchstens 3 Domains; angerechnet auf .com (2), .de (1). Gilt sie für ' +
        'andere TLDs, kann die Summe niedriger sein.',
    );
  });

  it('second line of a cell: per domain, or the promo split', () => {
    const line = (promoDomains: number | null) => ({
      tld: 'de',
      count: 3,
      status: 'ok' as const,
      each: 2100,
      eachRegular: 3000,
      regularFromRenewal: false,
      promoDomains,
      promoScope: null,
      subtotal: 0,
      missing: [],
      vatNotStated: false,
      fx: null,
      transferIncludesTerm: null,
    });
    const t = (p: number | null) => perDomain(DE, line(p)).replace(/\u00a0/g, ' ');
    expect(t(null)).toBe('je Domain 21,00 €');
    expect(t(3)).toBe('je Domain 21,00 € (Aktion)');
    expect(t(0)).toBe('je Domain 30,00 €');
    expect(t(1)).toBe('1 × 21,00 € (Aktion), 2 × 30,00 €');
  });
});

describe('market note of the calculator (owner decision 2026-11-19, Fremdmarkt)', () => {
  const note = {
    fx: { currency: 'USD', perEur: 1.0834, date: '2026-11-11' },
    market: 'US',
    rate: 1900,
  };
  it('gross: the owner wording with the VAT part; net: without it, own ids per mode', () => {
    expect(marketNoteId(note, 'gross')).toBe('market-US-USD-2026-11-11-1900');
    expect(marketNoteId(note, 'net')).toBe('market-net-US-USD-2026-11-11');
    expect(marketNoteText(DE, note, 'gross')).toBe(
      'US-Preis, umgerechnet zum Kurs vom 11.11.2026, zzgl. 19 % MwSt.; der Preis für Kunden in Deutschland kann abweichen.',
    );
    expect(marketNoteText(DE, note, 'net')).toBe(
      'US-Preis, umgerechnet zum Kurs vom 11.11.2026; der Preis für Kunden in Deutschland kann abweichen.',
    );
    expect(marketNoteText(EN, note, 'gross')).toBe(
      'US price, converted at the rate of 11 Nov 2026, plus 19% VAT; the price for customers in Germany may differ.',
    );
    expect(marketNoteText(EN, note, 'net')).toBe(
      'US price, converted at the rate of 11 Nov 2026; the price for customers in Germany may differ.',
    );
  });
});
