// Builds the two e2e variants from the same fixture data:
//   dist-e2e/a: tests/fixtures/data as is (provider `charlie` has operator: true)
//   dist-e2e/b: identical copy with every `operator` flag removed
// The operator-neutrality test compares the row order of both builds.
import { execFileSync } from 'node:child_process';
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const site = resolve(import.meta.dirname, '../..');
const out = join(site, 'dist-e2e');
const dataA = join(site, 'tests/fixtures/data');
const dataB = join(out, 'data-b');

rmSync(out, { recursive: true, force: true });
cpSync(dataA, dataB, { recursive: true });
for (const f of readdirSync(join(dataB, 'providers'))) {
  const file = join(dataB, 'providers', f);
  const p = JSON.parse(readFileSync(file, 'utf8'));
  delete p.operator;
  writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
}

execFileSync('npm', ['run', 'build:core'], { cwd: site, stdio: 'inherit' });
for (const [name, data] of [
  ['a', dataA],
  ['b', dataB],
]) {
  execFileSync('npx', ['astro', 'build', '--silent'], {
    cwd: site,
    stdio: 'inherit',
    env: { ...process.env, TLDCOST_DATA_DIR: data, TLDCOST_OUT_DIR: join(out, name) },
  });
}
