import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { loadData } from '@tldcost/core/load';
import { buildPayload } from '../../src/lib/rows';

export const FIXTURE_PAYLOAD = buildPayload(
  loadData(fileURLToPath(new URL('../fixtures/data', import.meta.url))),
);

/** Navigate and wait until the island is hydrated and has applied the URL. */
export async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator('.price-table[data-hydrated]').waitFor({ state: 'attached' });
}

/** Provider ids of the table rows, top to bottom (expanded detail rows are not counted). */
export function providerOrder(page: Page): Promise<string[]> {
  return page
    .locator('tbody tr[data-key]')
    .evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).dataset.providerId ?? ''));
}
