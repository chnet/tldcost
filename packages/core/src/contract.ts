import type { BillingCycle, Offer, Provider } from './types.js';

export interface EffectiveContract {
  min_term_months: number | null;
  notice_period_days: number | null;
  billing_cycle: BillingCycle | null;
  auto_renew_default: boolean | null;
}

/**
 * Contract terms shown for an offer, field by field: offer.contract wins unless null/missing, then
 * provider.terms, else null (unknown).
 */
export function effectiveContract(
  offer: Pick<Offer, 'contract'>,
  provider?: Pick<Provider, 'terms'>,
): EffectiveContract {
  const pick = <K extends keyof EffectiveContract>(k: K): EffectiveContract[K] =>
    (offer.contract?.[k] ?? provider?.terms?.[k] ?? null) as EffectiveContract[K];
  return {
    min_term_months: pick('min_term_months'),
    notice_period_days: pick('notice_period_days'),
    billing_cycle: pick('billing_cycle'),
    auto_renew_default: pick('auto_renew_default'),
  };
}
