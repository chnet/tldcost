import { describe, expect, it } from 'vitest';
import { grossCents, HETZNER_SOURCE_URL, hetzner, parseTable } from '../src/adapters/hetzner.js';
import { MVP_TLDS } from '../src/tlds.js';
import { ctxFor, fixture, testHttp } from './helpers.js';

const PAGE = fixture('hetzner/registrationrobot.html');
const ROBOTS = 'https://www.hetzner.com/robots.txt';
const run = (html: string, tlds: readonly string[] = MVP_TLDS) => {
  const { http } = testHttp({
    [ROBOTS]: { body: 'User-agent: *\nAllow: /\nDisallow: /*?search=\n' },
    [HETZNER_SOURCE_URL]: { body: html, headers: { 'content-type': 'text/html' } },
  });
  return hetzner.fetch(ctxFor(http, tlds, '2026-11-15T04:26:15Z'));
};
/** The fixture with one cell's hidden price label replaced. */
const withLabel = (from: string, to: string) => {
  expect(PAGE).toContain(from);
  return PAGE.replace(from, to);
};

describe('hetzner price text', () => {
  it('reads German gross amounts, with or without the setup wording', () => {
    expect(grossCents('3,90 €, inkl. 19 % MwSt.')).toBe(390);
    expect(grossCents('2,00 € einmalige Einrichtungsgebühr, inkl. 19 % MwSt.')).toBe(200);
    expect(grossCents(' 1.234,56 €, inkl. 19 % MwSt. ')).toBe(123456);
  });

  it('rejects net prices, other VAT rates, missing decimals and other formats', () => {
    for (const bad of [
      '3,90 €, zzgl. 19 % MwSt.',
      '3,90 €, inkl. 20 % MwSt.',
      '3,90 €',
      '3 €, inkl. 19 % MwSt.',
      '3.90 €, inkl. 19 % MwSt.',
      '12.34,56 €, inkl. 19 % MwSt.',
    ]) {
      expect(() => grossCents(bad), bad).toThrow(/unexpected price text/);
    }
  });
});

describe('hetzner price table', () => {
  it('parses the 8 registrations and the .de transfer from the fixture', () => {
    // the real labels have a no-break space before "€"
    expect(PAGE).toContain('3,90\u00a0€, inkl. 19 % MwSt.');
    const rows = parseTable(PAGE);
    expect(rows.map((r) => `${r.tld}/${r.kind}`)).toEqual([
      'info/Registrierung',
      'biz/Registrierung',
      'eu/Registrierung',
      'at/Registrierung',
      'net/Registrierung',
      'de/Registrierung',
      'org/Registrierung',
      'de/Transfer',
      'com/Registrierung',
    ]);
    const de = rows.find((r) => r.tld === 'de' && r.kind === 'Registrierung');
    expect(de).toEqual({
      tld: 'de',
      kind: 'Registrierung',
      yearly: '3,90 €, inkl. 19 % MwSt.',
      oneTime: '2,00 € einmalige Einrichtungsgebühr, inkl. 19 % MwSt.',
    });
    expect(rows.find((r) => r.tld === 'com')?.oneTime).toBeNull();
  });

  it('fails closed when the page layout changes', () => {
    expect(() => parseTable('<html></html>')).toThrow(/expected one price table, found 0/);
    expect(() => parseTable(PAGE + PAGE)).toThrow(/found 2/);
    expect(() => parseTable(PAGE.replace('jährlich', 'monatlich'))).toThrow(
      /unexpected table header/,
    );
    expect(() => parseTable(PAGE.replace(/<thead>[\s\S]*?<\/thead>/, ''))).toThrow(
      /unexpected table header undefined/,
    );
    expect(() => parseTable(PAGE.replace('.info-Registrierung', 'Info-Paket'))).toThrow(
      /unexpected row "Info-Paket/,
    );
    const twoCells = PAGE.replace(/(\.biz-Registrierung[\s\S]*?<\/td>)\s*<td>[\s\S]*?<\/td>/, '$1');
    expect(() => parseTable(twoCells)).toThrow(/unexpected row/);
    const noPrice = withLabel(
      '<span class="visually-hidden">14,28\u00a0€, inkl. 19 % MwSt.</span>',
      '<span>14,28</span>',
    );
    expect(() => parseTable(noPrice)).toThrow(/unreadable price cells for \.eu/);
    const emptyLabel = withLabel(
      '<span class="visually-hidden">13,09\u00a0€, inkl. 19 % MwSt.</span>',
      '<span class="visually-hidden">&nbsp;</span>',
    );
    expect(() => parseTable(emptyLabel)).toThrow(/unreadable price cells for \.at/);
    const noCross = PAGE.replace(
      /(\.at-Registrierung[\s\S]*?)<i class="fa fa-times color-red" aria-checked="false"><\/i>/,
      '$1?',
    );
    expect(() => parseTable(noCross)).toThrow(/unreadable price cells for \.at/);
  });
});

describe('hetzner adapter', () => {
  it('maps the Robot price list to gross yearly offers', async () => {
    const result = await run(PAGE);
    expect(result.offers.map((o) => o.tld)).toEqual([
      'de',
      'com',
      'net',
      'org',
      'eu',
      'info',
      'at',
      'biz',
    ]);
    expect(result.notOffered).toEqual(
      MVP_TLDS.filter((t) => !['de', 'com', 'net', 'org', 'eu', 'info', 'at', 'biz'].includes(t)),
    );
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    const de = result.offers[0];
    expect(de).toEqual({
      tld: 'de',
      currency: 'EUR',
      vat_included: true,
      price: {
        unit: 'year',
        setup: 200,
        year1: 390,
        year1_regular: 390,
        renewal: 390,
        term_years: 1,
        renewal_term_years: 1,
        transfer_in: 390,
      },
      promo: null,
      evidence: {
        source_url: HETZNER_SOURCE_URL,
        fetched_at: '2026-11-15T04:26:15Z',
        method: 'scrape',
        evidence_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        confidence: 'medium',
      },
    });
    const com = result.offers.find((o) => o.tld === 'com');
    expect(com?.price).toEqual({
      unit: 'year',
      setup: 0,
      year1: 1726,
      year1_regular: 1726,
      renewal: 1726,
      term_years: 1,
      renewal_term_years: 1,
    });
    expect(Object.fromEntries(result.offers.map((o) => [o.tld, o.price.renewal])))
      .toMatchInlineSnapshot(`
      {
        "at": 1309,
        "biz": 3094,
        "com": 1726,
        "de": 390,
        "eu": 1428,
        "info": 3927,
        "net": 1666,
        "org": 2380,
      }
    `);
  });

  it('reports an unreadable price per TLD and keeps the others', async () => {
    const page = withLabel(
      '<span class="visually-hidden">23,80\u00a0€, inkl. 19 % MwSt.</span>',
      '<span class="visually-hidden">23,80 €, zzgl. MwSt.</span>',
    );
    const result = await run(page, ['org', 'de']);
    expect(result.failed).toEqual([
      { tld: 'org', reason: 'unexpected price text "23,80 €, zzgl. MwSt."' },
    ]);
    expect(result.offers.map((o) => o.tld)).toEqual(['de']);
  });
});
