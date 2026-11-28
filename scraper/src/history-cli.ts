#!/usr/bin/env node
// npm run history:sync -- [--dry-run] [data dir ...]   (default: data)
// Seeds a missing price history and appends an entry where an offer's price state changed, e.g.
// after a hand edit (data/history/<provider>/<tld>.json). Nothing is fetched. Every offer whose
// history cannot be continued (currency, price unit or VAT mode changed, or an older fetch date) is
// reported and skipped; all other offers and data dirs are still synced (#52).
// Exit 0, 1 if any offer was not continued or a data dir could not be read.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { syncHistory } from './run.js';

export interface HistorySyncIo {
  log: (line: string) => void;
  error: (line: string) => void;
}

/** The CLI without process globals: returns the exit code. */
export async function main(
  argv: string[],
  io: HistorySyncIo = { log: console.log, error: console.error },
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { 'dry-run': { type: 'boolean', default: false } },
    allowPositionals: true,
  });
  const dirs = positionals.length ? positionals : ['data'];
  const verb = values['dry-run'] ? 'would write' : 'wrote';
  let failed = 0;
  for (const dir of dirs) {
    try {
      const r = await syncHistory(resolve(dir), { dryRun: values['dry-run'] });
      const skipped = r.errors.length ? `, ${r.errors.length} not continued` : '';
      io.log(
        `${dir}: ${verb} ${r.written.length} history file(s), ${r.unchanged} unchanged${skipped}`,
      );
      for (const message of r.errors) io.error(`history:sync: ${message}`);
      failed += r.errors.length;
    } catch (err) {
      // e.g. unreadable data: report it and go on with the other dirs
      io.error(`history:sync failed for ${dir}: ${(err as Error).message}`);
      failed += 1;
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
