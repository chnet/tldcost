#!/usr/bin/env node
// npm run history:sync -- [--dry-run] [data dir ...]   (default: data)
// Seeds a missing price history and appends an entry where an offer's price state changed, e.g.
// after a hand edit (data/history/<provider>/<tld>.json). Nothing is fetched. Exit 0, 1 on error.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { syncHistory } from './run.js';

const { values, positionals } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false } },
  allowPositionals: true,
});
const dirs = positionals.length ? positionals : ['data'];
try {
  for (const dir of dirs) {
    const r = await syncHistory(resolve(dir), { dryRun: values['dry-run'] });
    const verb = values['dry-run'] ? 'would write' : 'wrote';
    console.log(`${dir}: ${verb} ${r.written.length} history file(s), ${r.unchanged} unchanged`);
  }
} catch (err) {
  console.error(`history:sync failed: ${(err as Error).message}`);
  process.exitCode = 1;
}
