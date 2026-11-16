import type { BasisPoints, Cents, FxRate, PriceMode, PriceUnit } from './types.js';

export interface PriceContext {
  /** ISO 4217 code of `amount`. */
  currency: string;
  /** true: `amount` is gross; false: net; null: no VAT statement, used as stated in both modes. */
  vatIncluded: boolean | null;
  /** Needed only when the VAT state has to change (net -> gross or gross -> net). */
  vatRate?: BasisPoints | undefined;
  /** Billing unit of `amount`; `month` is annualised (x 12). Default `year`. */
  unit?: PriceUnit | undefined;
  /** Wanted output. Default `gross`. */
  mode?: PriceMode | undefined;
  /** Required when `currency` is not EUR. */
  fx?: FxRate | undefined;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BP_100 = 10_000;

export function isCents(value: unknown): value is Cents {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isVatRate(value: unknown): value is BasisPoints {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= BP_100;
}

/** Throws unless `fx` is a usable ECB rate for `currency`. */
export function assertFx(fx: FxRate | undefined, currency: string): asserts fx is FxRate {
  if (!fx) throw new TypeError(`no FX rate for ${currency}`);
  if (fx.currency !== currency) {
    throw new TypeError(`FX rate is for ${fx.currency}, amount is in ${currency}`);
  }
  if (!(Number.isFinite(fx.perEur) && fx.perEur > 0)) {
    throw new RangeError(`FX rate ${currency} must be a positive number`);
  }
  if (!DATE.test(fx.date)) throw new TypeError(`FX rate date must be YYYY-MM-DD`);
}

/**
 * One amount to EUR cents per year in the wanted mode (gross by default), rounded once at the end
 * (half up). Steps: annualise (month x 12) -> currency to EUR (divide by the ECB units per EUR)
 * -> add or remove VAT if the VAT state differs from the wanted mode (never when it is unknown).
 */
export function normalizePrice(amount: Cents, ctx: PriceContext): Cents {
  if (!isCents(amount)) throw new RangeError(`amount must be integer cents >= 0, got ${amount}`);
  const mode = ctx.mode ?? 'gross';
  let value = ctx.unit === 'month' ? amount * 12 : amount;
  if (ctx.currency !== 'EUR') {
    assertFx(ctx.fx, ctx.currency);
    value /= ctx.fx.perEur;
  }
  const isGross = ctx.vatIncluded;
  if (isGross !== null && isGross !== (mode === 'gross')) {
    if (!isVatRate(ctx.vatRate)) {
      throw new TypeError(`VAT rate (basis points) needed to convert ${isGross ? 'gross' : 'net'}`);
    }
    // multiply first, divide once: exact for integer cents (no 1.19 float factor)
    const withVat = BP_100 + ctx.vatRate;
    value = isGross ? (value * BP_100) / withVat : (value * withVat) / BP_100;
  }
  return Math.round(value);
}
