// End to end over stdio: the CLI as a child process (as `npx @tldcost/mcp` runs it), talking to a
// local HTTP server that serves the fixtures. No live calls.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixture } from './helpers.js';

let http: Server;
let base: string;
const seen: { url: string; ua: string | undefined }[] = [];

beforeAll(async () => {
  http = createServer((req, res) => {
    seen.push({ url: req.url ?? '', ua: req.headers['user-agent'] });
    try {
      const body = JSON.stringify(fixture((req.url ?? '').replace(/^\/api\/v1\//, '')));
      res.writeHead(200, { 'content-type': 'application/json' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/v1`;
});

afterAll(() => new Promise<void>((resolve) => http.close(() => resolve())));

describe('tldcost-mcp CLI (stdio)', () => {
  it('starts, lists the tools and answers a call', async () => {
    const root = join(import.meta.dirname, '..');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join(root, 'src', 'cli.ts')],
      cwd: root,
      env: { PATH: process.env.PATH ?? '', TLDCOST_API_URL: base },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'cli-test', version: '0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_tlds',
      'get_offers',
      'compare',
      'get_provider',
      'basket',
    ]);
    const r = await client.callTool({ name: 'compare', arguments: { tld: 'com', years: 3 } });
    const body = JSON.parse((r.content as { text: string }[])[0]?.text ?? '');
    expect(body.source.api_url).toBe(`${base}/offers/com.json`);
    expect(body.rows.length).toBeGreaterThan(0);
    await client.close();
    expect(seen).toEqual([
      { url: '/api/v1/offers/com.json', ua: 'tldcost-mcp (+https://github.com/chnet/tldcost)' },
    ]);
  }, 30_000);
});
