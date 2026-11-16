// Types of check-data-protection.mjs for its TypeScript caller (infra/test/data-protection.test.ts).

export interface SynthStack {
  stack: string;
  template: { Resources?: Record<string, unknown> };
}

export interface Synth {
  name: string;
  stacks: SynthStack[];
}

export interface CheckResult {
  gaps: string[];
  integrity: string[];
  summary: { synths: string[]; stacks: number; resources: number; gapResources: number };
}

export const CLASS_TAG: string;
export const ALLOWLIST: string;

export function checkDataProtection(
  synths: Synth[],
  allow: Record<string, unknown>,
  opts?: { partial?: boolean },
): CheckResult;

export function formatReport(
  res: CheckResult,
  opts?: { strict?: boolean; partial?: boolean },
): string[];
