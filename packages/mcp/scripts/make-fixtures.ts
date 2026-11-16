// Writes the test fixtures in packages/mcp/test/fixtures/ from data/ with the site's own API
// builders (site/src/lib/api.ts), so they have exactly the shape tldcost.io/api/v1/ serves.
// all.json is limited to the fixture TLDs to stay small. Run from the repo root:
//   npx tsx packages/mcp/scripts/make-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadData } from '@tldcost/core/load';
import { buildAll, buildTld, buildTlds } from '../../../site/src/lib/api';

const TLDS = ['de', 'com'];
const out = join(import.meta.dirname, '..', 'test', 'fixtures');
const data = loadData('data');
const write = (name: string, doc: unknown) => {
  mkdirSync(join(out, name, '..'), { recursive: true });
  writeFileSync(join(out, name), `${JSON.stringify(doc, null, 2)}\n`);
};
write('tlds.json', buildTlds(data));
for (const tld of TLDS) write(`offers/${tld}.json`, buildTld(data, tld));
write('all.json', buildAll({ ...data, offers: data.offers.filter((o) => TLDS.includes(o.tld)) }));
console.log(`fixtures -> ${out}`);
