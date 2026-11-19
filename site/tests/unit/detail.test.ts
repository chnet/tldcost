// Cell footnotes (promo, net/gross price, multi-year term, monthly price, provider terms notes),
// badges, row detail and the "Fehler melden" link. Fixture changes: alpha/de promo, bravo/de
// provider-verified, foxtrot/de net + monthly + terms note, delta without minimum term, delta/io
// registration for 2 years.
import { fileURLToPath } from 'node:url';
import type { Offer, Provider } from '@tldcost/core';
import { loadData } from '@tldcost/core/load';
import { DE } from '../../src/i18n/de';
import { describe, expect, it } from 'vitest';
import { COLUMN_BY_ID, DEFAULT_COLUMNS } from '../../src/lib/columns';
import {
  buildPayload,
  isPromo,
  isPromoExpired,
  MONTHLY_COLUMNS,
  monthKey,
  NOTE_MONTHLY,
  notePromo,
  noteCountry,
  noteTermYears,
  noteTerms,
  noteVatGross,
  noteVatNet,
} from '../../src/lib/rows';
import { defaultState } from '../../src/lib/url-state';
import {
  cellNotes,
  contractNote,
  footnotes,
  formatPerMonth,
  formatValue,
  orderedRows,
  perMonthSpoken,
  reportUrl,
} from '../../src/lib/view';

const FIXTURES = fileURLToPath(new URL('../fixtures/data', import.meta.url));
const data = loadData(FIXTURES);
const payload = buildPayload(data);
const row = (key: string) => {
  const r = payload.rows.find((x) => x.key === key);
  if (!r) throw new Error(`no row ${key}`);
  return r;
};

describe('cell footnotes', () => {
  it('promo: year 1 and every sum, both VAT modes; the regular price stays unmarked', () => {
    const r = row('alpha/de');
    const id = notePromo('alpha/de');
    for (const vat of ['gross', 'net'] as const) {
      for (const col of ['year1', 'sum_2y', 'sum_3y', 'sum_5y']) {
        expect(cellNotes(r, col, vat), `${vat} ${col}`).toContain(id);
      }
      for (const col of ['year2', 'year3', 'renewal', 'setup']) {
        expect(cellNotes(r, col, vat), `${vat} ${col}`).not.toContain(id);
      }
    }
    expect(payload.notes[id]).toContain('nur für Neukunden');
    expect(payload.notes[id]).toContain('31.12.2099');
  });

  it('net prices: every non-empty price cell in gross mode, none in net mode', () => {
    const r = row('foxtrot/de');
    const id = noteVatNet(1900);
    for (const col of ['setup', 'year1', 'year2', 'year3', 'sum_2y', 'sum_3y', 'sum_5y']) {
      expect(cellNotes(r, col, 'gross'), col).toContain(id);
      expect(cellNotes(r, col, 'net'), col).not.toContain(id);
    }
    expect(cellNotes(r, 'transfer_in', 'gross')).toContain(id);
    expect(payload.notes[id]).toBe(
      'Der Anbieter nennt Nettopreise. Brutto = netto zuzüglich 19 % Umsatzsteuer.',
    );
  });

  it('gross prices: every non-empty price cell in net mode, none in gross mode', () => {
    const r = row('bravo/de');
    const id = noteVatGross(1900);
    for (const col of ['setup', 'year1', 'year2', 'year3', 'sum_2y', 'sum_3y', 'sum_5y']) {
      expect(cellNotes(r, col, 'net'), col).toContain(id);
      expect(cellNotes(r, col, 'gross'), col).toEqual([]);
    }
    expect(payload.notes[id]).toBe(
      'Der Anbieter nennt Bruttopreise. Netto = brutto ohne die enthaltenen 19 % Umsatzsteuer.',
    );
    // a net offer gets no gross note, and an offer without VAT statement gets neither
    expect(cellNotes(row('foxtrot/de'), 'year1', 'net')).not.toContain(id);
  });

  it('multi-year term: year cells and sums in both VAT modes; renewal only with its own term', () => {
    const r = row('delta/io'); // registration 2 years, renewal 1 year
    const id = noteTermYears(2, 1);
    for (const vat of ['gross', 'net'] as const) {
      for (const col of ['year1', 'year2', 'year3', 'sum_2y', 'sum_3y', 'sum_5y']) {
        expect(cellNotes(r, col, vat), `${vat} ${col}`).toContain(id);
      }
      expect(cellNotes(r, 'renewal', vat)).not.toContain(id);
    }
    expect(r.gross.year2).toBe(0); // nothing due in year 2
    expect(payload.notes[id]).toBe(
      'Die erste Zahlung deckt 2 Jahre ab. Die Jahresspalten zeigen jede Zahlung im Jahr ihrer ' +
        'Fälligkeit, die Summen alle im Zeitraum fälligen Zahlungen in voller Höhe.',
    );
    // one-year offers carry no term note
    expect(Object.keys(payload.notes).filter((k) => k.startsWith('term-years-'))).toEqual([id]);
  });

  it('multi-year renewal: the renewal cell gets the note too', () => {
    const base = data.offers.find((o) => o.provider === 'delta' && o.tld === 'io')!;
    const provider = data.providers.find((p) => p.id === 'delta')!;
    const offer: Offer = { ...base, price: { ...base.price, renewal_term_years: 2 } };
    const p = buildPayload({ providers: [provider], offers: [offer], fx: [] });
    const id = noteTermYears(2, 2);
    expect(cellNotes(p.rows[0]!, 'renewal', 'gross')).toContain(id);
    expect(p.notes[id]).toContain('Jede Verlängerung deckt 2 Jahre ab.');
  });

  it('monthly prices: the note sits on the sums only, the year cells get a second line', () => {
    const r = row('foxtrot/de');
    for (const col of ['sum_2y', 'sum_3y', 'sum_5y']) {
      expect(cellNotes(r, col, 'net'), col).toContain(NOTE_MONTHLY);
    }
    for (const col of ['year1', 'year2', 'year3', 'renewal', 'transfer_in', 'setup']) {
      expect(cellNotes(r, col, 'net'), col).not.toContain(NOTE_MONTHLY);
    }
    expect(r.gross.year1).toBe(500); // 35 ct/month net x 12 = 420 net -> 500 gross
  });

  it('monthly values per VAT mode, converted on their own, never multiplied by 12', () => {
    const r = row('foxtrot/de'); // net, 35 ct per month, renewal 35
    for (const col of ['year1', 'year2', 'year3', 'renewal']) {
      expect(r.net[monthKey(col)], col).toBe(35);
      expect(r.gross[monthKey(col)], col).toBe(42); // round(35 x 1.19)
    }
    expect(r.gross[monthKey('year1_regular')]).toBeNull(); // no list price stated
    // yearly offers carry no monthly values; sorting keys are unchanged
    expect(row('bravo/de').gross).not.toHaveProperty(monthKey('year1'));
    expect(MONTHLY_COLUMNS).toEqual(['year1', 'year2', 'year3', 'renewal', 'year1_regular']);
  });

  it('provider terms note on the contract cell where the provider value is used', () => {
    const r = row('foxtrot/de');
    const id = noteTerms('foxtrot', 'notice_period_days');
    expect(cellNotes(r, 'notice_days', 'gross')).toEqual([id]);
    expect(cellNotes(r, 'notice_days', 'net')).toEqual([id]);
    expect(payload.notes[id]).toBe('AGB § 3: 14 Tage zum Ende der Laufzeit; FAQ: 7 Tage.');
    expect(r.detail.contractSource['notice_days']).toBe('provider');
  });

  it('country note on the "Land" cell in both VAT modes, and in the provider meta', () => {
    const id = noteCountry('echo');
    expect(cellNotes(row('echo/de'), 'country', 'gross')).toEqual([id]);
    expect(cellNotes(row('echo/de'), 'country', 'net')).toEqual([id]);
    expect(payload.notes[id]).toBe('Rechnung über Echo Names Europe (IE) mit USt.');
    expect(payload.providers['echo']?.countryNote).toBe(
      'Rechnung über Echo Names Europe (IE) mit USt.',
    );
    // providers without a note: no country footnote, countryNote null
    expect(cellNotes(row('bravo/de'), 'country', 'gross')).toEqual([]);
    expect(payload.providers['bravo']?.countryNote).toBeNull();
  });

  it('no terms note where the offer overrides the field', () => {
    const provider: Provider = {
      ...data.providers.find((p) => p.id === 'foxtrot')!,
    };
    const base = data.offers.find((o) => o.provider === 'foxtrot' && o.tld === 'de')!;
    const offer: Offer = { ...base, contract: { notice_period_days: 7 } };
    const p = buildPayload({ providers: [provider], offers: [offer], fx: [] });
    const r = p.rows[0]!;
    expect(cellNotes(r, 'notice_days', 'gross')).toEqual([]);
    expect(r.common.notice_days).toBe(7);
    expect(r.detail.contractSource['notice_days']).toBe('offer');
    // the row detail hides the note there too
    expect(contractNote(r, p.providers['foxtrot'], 'notice_days')).toBeNull();
  });

  it('row detail: the provider terms note per contract column, where the provider value is used', () => {
    const meta = payload.providers['foxtrot'];
    expect(meta?.terms.notes).toEqual({
      notice_days: 'AGB § 3: 14 Tage zum Ende der Laufzeit; FAQ: 7 Tage.',
    });
    const r = row('foxtrot/de');
    expect(r.detail.contractSource['notice_days']).toBe('provider');
    expect(contractNote(r, meta, 'notice_days')).toBe(
      'AGB § 3: 14 Tage zum Ende der Laufzeit; FAQ: 7 Tage.',
    );
    expect(contractNote(r, meta, 'min_term_months')).toBeNull();
    // providers without notes carry no key (payload size)
    expect('notes' in (payload.providers['bravo']?.terms ?? {})).toBe(false);
    expect(contractNote(row('bravo/de'), payload.providers['bravo'], 'notice_days')).toBeNull();
  });

  it('footnotes are numbered over visible cells only, row by row, left to right', () => {
    const state = { ...defaultState({ tlds: payload.tlds }), tld: 'de' };
    const rows = orderedRows(payload, state);
    const all = footnotes(rows, DEFAULT_COLUMNS, 'gross');
    expect([...all.values()]).toEqual([...Array(all.size).keys()].map((i) => i + 1));
    expect(all.has(notePromo('alpha/de'))).toBe(true);
    // only the provider column and transfer_in: promo, monthly and terms notes disappear
    const few = footnotes(rows, ['provider', 'transfer_in'], 'gross');
    expect(few.has(notePromo('alpha/de'))).toBe(false);
    expect(few.has(NOTE_MONTHLY)).toBe(false);
    expect(few.has(noteVatNet(1900))).toBe(true);
    // net mode: the net-price note is gone, the gross-price note appears
    expect(footnotes(rows, DEFAULT_COLUMNS, 'net').has(noteVatNet(1900))).toBe(false);
    expect(footnotes(rows, DEFAULT_COLUMNS, 'net').has(noteVatGross(1900))).toBe(true);
    expect(all.has(noteVatGross(1900))).toBe(false);
  });
});

describe('badges', () => {
  it('promo from promo data or a year-1 price below the stated list price', () => {
    expect(row('alpha/de').badges.promo).toBe(true);
    expect(row('bravo/de').badges.promo).toBe(false);
    const o = data.offers.find((x) => x.provider === 'bravo' && x.tld === 'de')!;
    expect(isPromo({ ...o, price: { ...o.price, year1: 100, year1_regular: 500 } })).toBe(true);
    expect(isPromo({ ...o, price: { ...o.price, year1: 500, year1_regular: 500 } })).toBe(false);
    expect(isPromo({ ...o, promo: { conditions: null, valid_until: null } })).toBe(false);
  });

  it('an expired promo (valid_until before the build date) loses the badge, keeps a note', () => {
    const lastDay = buildPayload(data, { today: '2099-12-31' });
    const after = buildPayload(data, { today: '2100-01-01' });
    const r = (p: typeof payload) => p.rows.find((x) => x.key === 'alpha/de')!;
    expect(r(lastDay).badges.promo).toBe(true); // valid_until is the last valid day
    expect(r(lastDay).detail.promo?.expired).toBe(false);
    expect(r(after).badges.promo).toBe(false);
    expect(r(after).detail.promo?.expired).toBe(true);
    const id = notePromo('alpha/de');
    expect(cellNotes(r(after), 'year1', 'gross')).toContain(id);
    expect(after.notes[id]).toContain('ist abgelaufen');
    expect(after.notes[id]).toContain('31.12.2099');
    // a promo without end date never expires
    const o = data.offers.find((x) => x.provider === 'alpha' && x.tld === 'de')!;
    expect(
      isPromoExpired({ ...o, promo: { conditions: 'x', valid_until: null } }, '2100-01-01'),
    ).toBe(false);
  });

  it('provider-verified only where provider_verified is true', () => {
    expect(row('bravo/de').badges.verified).toBe(true);
    expect(payload.rows.filter((r) => r.badges.verified).map((r) => r.key)).toEqual(['bravo/de']);
  });

  it('rows still carry no operator information (badge only in provider metadata)', () => {
    for (const r of payload.rows) expect(JSON.stringify(r)).not.toContain('operator');
  });
});

describe('row detail', () => {
  it('evidence, stated price and promo come from the raw offer', () => {
    const d = row('alpha/de').detail;
    expect(d.sourceUrl).toMatch(/^https:\/\//);
    expect(d.method).toBe('manual');
    expect(d.stated).toMatchObject({ currency: 'EUR', vat: 'gross', unit: 'year', year1: 99 });
    expect(d.stated.year1Regular).toBe(600);
    expect(d.promo).toEqual({
      conditions: 'nur für Neukunden',
      validUntil: '2099-12-31',
      expired: false,
    });
    expect(row('alpha/de').gross.year1_regular).toBe(600);
    expect(row('echo/de').detail.stated.vat).toBe('none');
    expect(row('foxtrot/de').detail.stated).toMatchObject({ vat: 'net', unit: 'month' });
  });

  it('paid features (Archiv-Issue 124): value in the cell, source and stated price in the detail', () => {
    const bravo = row('bravo/de');
    expect(bravo.common.email_fwd).toBe('paid');
    expect(bravo.detail.paidFeatures).toEqual([
      {
        col: 'email_fwd',
        price: 100,
        unit: 'year',
        note: 'je Domain, bis zu 10 Weiterleitungen',
        quote: 'E-Mail-Weiterleitung: 1,00 € pro Jahr',
        quoteLang: 'de',
        url: 'https://bravo.example/zusatzleistungen',
      },
    ]);
    // source only: no price, unit or note
    expect(row('charlie/de').detail.paidFeatures).toEqual([
      {
        col: 'api',
        price: null,
        unit: null,
        note: null,
        quote: 'API access is only available in the Pro plan.',
        quoteLang: 'en',
        url: 'https://charlie.example/api',
      },
    ]);
    // rows without a paid feature carry no key (payload size)
    expect('paidFeatures' in row('alpha/de').detail).toBe(false);
    // the price never enters the sums: same TCO as without the add-on
    expect(bravo.gross.sum_3y).toBe(1500);
  });

  it('provider terms meta: AGB link and citation', () => {
    expect(payload.providers['bravo']?.terms).toEqual({
      url: 'https://bravo.example/agb',
      section: 'Domain-AGB Nr. 4 und 5',
      reviewedAt: null,
    });
    expect(payload.providers['alpha']?.terms.url).toBeNull();
  });

  it('"Fehler melden" defaults to the GitHub issue form (REPORT_VIA)', () => {
    expect(reportUrl(row('bravo/de'), 'Bravo')).toBe(reportUrl(row('bravo/de'), 'Bravo', 'github'));
  });

  it('"Fehler melden" (mail): subject and row fields only', () => {
    const href = reportUrl(row('bravo/de'), 'Bravo', 'mail');
    const url = new URL(href);
    expect(url.protocol + url.pathname).toBe('mailto:hello@chnet.solutions');
    expect(href).not.toContain('+'); // RFC 6068: spaces as %20, never "+"
    expect(url.searchParams.get('subject')).toBe('tldcost: Fehler bei Bravo .de');
    const body = url.searchParams.get('body') ?? '';
    expect(body.split('\r\n').slice(0, 2)).toEqual(['Anbieter: bravo', 'TLD: de']);
    expect(body).toContain('Öffentliche Quelle (URL): ');
  });

  it('"Fehler melden" (github): issue form prefilled with template, title, provider and TLD only', () => {
    const url = new URL(reportUrl(row('bravo/de'), 'Bravo', 'github'));
    expect(url.origin + url.pathname).toBe('https://github.com/chnet/tldcost/issues/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: 'preis-falsch.yml',
      title: '[Korrektur] Bravo .de',
      anbieter: 'bravo',
      tld: 'de',
    });
  });
});

describe('formatting', () => {
  it('min_term_months 0 reads "keine Mindestlaufzeit", other ints stay numbers', () => {
    const col = COLUMN_BY_ID.get('min_term_months')!;
    expect(formatValue(DE, col, 0)).toBe('keine Mindestlaufzeit');
    expect(formatValue(DE, col, 12)).toBe('12');
    expect(formatValue(DE, COLUMN_BY_ID.get('notice_days')!, 0)).toBe('0');
    expect(row('delta/de').common.min_term_months).toBe(0);
  });

  it('monthly second line and its spoken form', () => {
    expect(formatPerMonth(DE, 42)).toMatch(/^0,42\s€\/Monat$/);
    expect(perMonthSpoken(DE, 42)).toMatch(/^ pro Jahr, entspricht 0,42\s€ pro Monat$/);
  });

  it('timestamps in UTC, amounts in the stated currency', () => {
    expect(DE.f.dateTime('2026-11-13T05:04:21Z')).toBe('13.11.2026, 05:04 UTC');
    expect(DE.f.amount(290, 'USD')).toMatch(/^2,90\s\$$/);
    expect(DE.f.amount(1557, 'EUR')).toMatch(/^15,57\s€$/);
  });
});
