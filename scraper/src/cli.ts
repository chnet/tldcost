#!/usr/bin/env node
// npm run scrape -- [--dry-run] [--only inwx,netcup] [--no-fx] [--tlds de,com] [--data-dir DIR]
//                   [--report FILE] [--max-change 0.3] [--user-agent UA]
//                   [--plausibility-low 0.333] [--plausibility-high 3]
// Needs no secrets. Exit 1 = a gate violation (price jump on stored data), 2 = bad usage, else 0:
// blocked/promo-required/delisted offers and failures leave stored data untouched and are reported.
// Plausibility hits (yearly gross price below low x or above high x the TLD median of the other
// providers, at least 3 other providers) are listed for a human check and never change the exit code.
// The User-Agent defaults to "tldcost-bot/<version> (+https://tldcost.io/methodik/)" and can be
// overridden with --user-agent or TLDCOST_USER_AGENT (never with an e-mail address).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ADAPTERS } from './adapters/index.js';
import { HttpClient } from './http.js';
import { DEFAULT_PLAUSIBILITY_HIGH, DEFAULT_PLAUSIBILITY_LOW } from '@tldcost/core';
import { exitCode, run, summarize, DEFAULT_MAX_CHANGE } from './run.js';
import { MVP_TLDS } from './tlds.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
  version: string;
};

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs({
      options: {
        'dry-run': { type: 'boolean', default: false },
        only: { type: 'string' },
        'no-fx': { type: 'boolean', default: false },
        tlds: { type: 'string' },
        'data-dir': { type: 'string', default: join(here, '..', '..', 'data') },
        report: { type: 'string' },
        'max-change': { type: 'string', default: String(DEFAULT_MAX_CHANGE) },
        'user-agent': { type: 'string' },
        'plausibility-low': { type: 'string', default: String(DEFAULT_PLAUSIBILITY_LOW) },
        'plausibility-high': { type: 'string', default: String(DEFAULT_PLAUSIBILITY_HIGH) },
      },
      strict: true,
    }).values;
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }
  const only = args.only?.split(',').map((s) => s.trim());
  const unknown = only?.filter((id) => !ADAPTERS.some((a) => a.id === id)) ?? [];
  const maxChange = Number(args['max-change']);
  const low = Number(args['plausibility-low']);
  const high = Number(args['plausibility-high']);
  const usage = unknown.length
    ? `unknown adapter(s): ${unknown.join(', ')}`
    : !(maxChange > 0)
      ? 'bad --max-change'
      : !(low > 0 && low < 1)
        ? 'bad --plausibility-low (0 < low < 1)'
        : !(high > 1)
          ? 'bad --plausibility-high (> 1)'
          : undefined;
  if (usage) {
    console.error(usage);
    return 2;
  }
  const userAgent =
    args['user-agent'] ??
    process.env.TLDCOST_USER_AGENT ??
    `tldcost-bot/${pkg.version} (+https://tldcost.io/methodik/)`;
  const log = (m: string) => console.error(m);
  const report = await run({
    dataDir: resolve(args['data-dir']),
    adapters: only ? ADAPTERS.filter((a) => only.includes(a.id)) : ADAPTERS,
    http: new HttpClient({ userAgent, log }),
    tlds: args.tlds ? args.tlds.split(',').map((s) => s.trim().toLowerCase()) : MVP_TLDS,
    dryRun: args['dry-run'],
    fx: !args['no-fx'],
    maxChange,
    plausibility: { low, high },
    log,
  });
  console.log(summarize(report));
  if (args.report) writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  return exitCode(report);
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
