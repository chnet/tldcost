// MCP server wiring: the five tools on the low-level SDK server. Only the stdio transport is used
// (cli.ts); the SDK's HTTP transports are never imported.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { MAX_BASKET_COUNT, MAX_TCO_YEARS } from '@tldcost/core';
import { ApiError, type ApiClient } from './api.js';
import { basket, MAX_BASKET_ROWS } from './basket.js';
import { compare, getOffers, getProvider, listTlds, ToolInputError } from './tools.js';

export const SERVER_NAME = 'tldcost-mcp';
export const SERVER_VERSION = '0.1.0';

const tld = { type: 'string', description: 'TLD without or with dot, e.g. "de", ".com", "co.uk"' };
const years = {
  type: 'integer',
  minimum: 1,
  maximum: MAX_TCO_YEARS,
  description: `Years for the total cost (TCO), 1..${MAX_TCO_YEARS}, default 3`,
};
const vat = {
  type: 'string',
  enum: ['gross', 'net'],
  description: 'gross = incl. VAT (default, consumer prices), net = excl. VAT',
};

export const TOOLS: Tool[] = [
  {
    name: 'list_tlds',
    description:
      'TLDs with price data on tldcost.io, with the number of offers per TLD and the data date.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_offers',
    description:
      'All offers for one TLD: raw provider prices plus the total cost over N years in EUR (monthly prices annualised, other currencies converted at the ECB rate), promo flag, source URL and fetch date of each price.',
    inputSchema: {
      type: 'object',
      properties: { tld, years, vat },
      required: ['tld'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare',
    description:
      'Offers for one TLD sorted by total cost over N years (or by first-year payment, or by provider), lowest first. A price order only, not a recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        tld,
        years,
        vat,
        providers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only these provider ids, e.g. ["inwx", "netcup"]',
        },
        sort: {
          type: 'string',
          enum: ['total', 'year1', 'provider'],
          description: 'total (default), year1 or provider',
        },
      },
      required: ['tld'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_provider',
    description:
      'One provider: country, VAT rate, contract terms (minimum term, notice period, billing cycle, auto-renew) and, per TLD offer, the effective contract values and features (yes/no or "paid", with the source and stated price of paid features).',
    inputSchema: {
      type: 'object',
      properties: { provider: { type: 'string', description: 'Provider id, e.g. "inwx"' } },
      required: ['provider'],
      additionalProperties: false,
    },
  },
  {
    name: 'basket',
    description:
      "Cost of a domain portfolio (several TLDs, each with a number of domains) per provider over N years in EUR, as the tldcost.io portfolio calculator computes it: new registration or transfer, promotional prices only within the provider's stated limit (one promotional domain per provider if no limit is stated). Providers are sorted by total, lowest first; a provider lacking a TLD or an input has no total, with the reason per line. Includes the lowest subtotal per TLD across providers (mix). A price order only, not a recommendation. years accepts 1–10 like the other tools; the tldcost.io calculator only offers 1, 2, 3 or 5 as a UI choice.",
    inputSchema: {
      type: 'object',
      properties: {
        basket: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_BASKET_ROWS,
          items: {
            type: 'object',
            properties: {
              tld,
              count: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_BASKET_COUNT,
                description: 'Number of domains with this TLD',
              },
            },
            required: ['tld', 'count'],
            additionalProperties: false,
          },
          description:
            'TLDs with counts, e.g. [{"tld": "de", "count": 10}, {"tld": "com", "count": 3}]',
        },
        years,
        vat,
        mode: {
          type: 'string',
          enum: ['new', 'transfer'],
          description:
            'new (default): register all domains new; transfer: move existing domains in',
        },
      },
      required: ['basket'],
      additionalProperties: false,
    },
  },
];

type Handler = (api: ApiClient, args: Record<string, unknown>) => Promise<unknown>;
const HANDLERS: Record<string, Handler> = {
  list_tlds: (api) => listTlds(api),
  get_offers: getOffers,
  compare,
  get_provider: getProvider,
  basket,
};

/** Runs one tool call; wrong input and API failures come back as tool errors, not as crashes. */
export async function callTool(
  api: ApiClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return error(`unknown tool "${name}"`);
  // every tool in TOOLS has a handler and declares its properties (test/server.test.ts)
  const handler = HANDLERS[name] as Handler;
  // the low-level SDK server checks only the request envelope, not the tool's inputSchema:
  // an unknown key (e.g. "year" for "years") must not silently fall back to a default
  const allowed = Object.keys(tool.inputSchema.properties as Record<string, unknown>);
  const unknown = Object.keys(args).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    return error(
      `unknown argument(s) for ${name}: ${unknown.join(', ')}; allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
  try {
    const result = await handler(api, args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = (err as Error).message;
    if (err instanceof ToolInputError) return error(message);
    if (err instanceof ApiError) return error(`tldcost API unavailable: ${message}`);
    return error(`internal error in tldcost-mcp: ${message}`);
  }
}

const error = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

export function createServer(api: ApiClient): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'Domain registration prices from tldcost.io (open data, CC BY 4.0, attribution "tldcost.io"). Cite source_url and fetched_at of each price and the license when you use the data. Do not call an offer "best" or "recommended": tldcost sorts by price only.',
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, (req) =>
    callTool(api, req.params.name, req.params.arguments ?? {}),
  );
  return server;
}
