import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { callTool, createServer, SERVER_NAME, TOOLS } from '../src/server.js';
import { ApiClient } from '../src/api.js';
import { BASE, fakeApi } from './helpers.js';

const text = (r: { content: unknown }) => (r.content as { type: string; text: string }[])[0]?.text;

describe('callTool', () => {
  it('returns the result as JSON text', async () => {
    const { api } = fakeApi();
    const r = await callTool(api, 'compare', { tld: 'de', years: 2 });
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(text(r) as string)).toMatchObject({ tld: 'de', years: 2 });
    const tlds = await callTool(api, 'list_tlds');
    expect(JSON.parse(text(tlds) as string).tlds.length).toBeGreaterThan(0);
  });

  it('reports input errors, API failures and unknown tools as tool errors', async () => {
    const { api } = fakeApi({ 'offers/com.json': { status: 500, text: 'x' } });
    expect(await callTool(api, 'get_offers', { tld: 'de', years: 99 })).toEqual({
      content: [{ type: 'text', text: 'years must be an integer 1..10' }],
      isError: true,
    });
    const down = await callTool(api, 'get_offers', { tld: 'com' });
    expect(down.isError).toBe(true);
    expect(text(down)).toMatch(/^tldcost API unavailable: tldcost API: HTTP 500/);
    expect(await callTool(api, 'portfolio', {})).toMatchObject({
      isError: true,
      content: [{ text: 'unknown tool "portfolio"' }],
    });
  });
});

describe('argument check', () => {
  it('rejects unknown argument names instead of using a default', async () => {
    const { api } = fakeApi();
    expect(await callTool(api, 'get_offers', { tld: 'de', year: 5 })).toEqual({
      content: [
        {
          type: 'text',
          text: 'unknown argument(s) for get_offers: year; allowed: tld, years, vat',
        },
      ],
      isError: true,
    });
    expect(await callTool(api, 'list_tlds', { tld: 'de' })).toMatchObject({
      isError: true,
      content: [{ text: 'unknown argument(s) for list_tlds: tld; allowed: none' }],
    });
  });

  it('has a handler and declared properties for every tool', async () => {
    const { api } = fakeApi();
    for (const tool of TOOLS) {
      expect(tool.inputSchema.properties, tool.name).toBeTypeOf('object');
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
      const r = await callTool(api, tool.name, {});
      expect(text(r), tool.name).not.toMatch(/unknown tool|internal error/);
    }
  });

  it('labels network failures as API errors and anything else as internal', async () => {
    const failing = new ApiClient({
      baseUrl: BASE,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(text(await callTool(failing, 'list_tlds'))).toBe(
      `tldcost API unavailable: tldcost API: fetch failed (${BASE}/tlds.json)`,
    );
    const broken = new ApiClient({
      baseUrl: BASE,
      fetch: async () => new Response(JSON.stringify({ api_version: 1, data_version: 'x' })),
    });
    const r = await callTool(broken, 'list_tlds');
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^internal error in tldcost-mcp: /);
  });
});

describe('MCP server', () => {
  it('lists the five tools and answers tool calls over the protocol', async () => {
    const { api } = fakeApi();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(api).connect(serverSide);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);
    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
    expect(client.getInstructions()).toContain('CC BY 4.0');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_tlds',
      'get_offers',
      'compare',
      'get_provider',
      'basket',
    ]);
    expect(tools).toEqual(TOOLS);
    const r = await client.callTool({ name: 'get_provider', arguments: { provider: 'inwx' } });
    expect(JSON.parse(text(r) as string).provider.id).toBe('inwx');
    const noArgs = await client.callTool({ name: 'list_tlds' });
    expect(noArgs.isError).toBeUndefined();
    await client.close();
  });

  it('describes tools without rating words', () => {
    expect(JSON.stringify(TOOLS)).not.toMatch(/\b(best|cheapest|recommended)\b/i);
  });
});
