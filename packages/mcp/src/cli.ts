#!/usr/bin/env node
// `npx @tldcost/mcp` (command `tldcost-mcp`): the tldcost MCP server on stdio. TLDCOST_API_URL
// overrides the API base URL (default https://tldcost.io/api/v1), e.g. for a local site build.
// Logs go to stderr only: stdout carries the protocol.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './api.js';
import { createServer } from './server.js';

const api = new ApiClient(
  process.env.TLDCOST_API_URL ? { baseUrl: process.env.TLDCOST_API_URL } : {},
);
await createServer(api).connect(new StdioServerTransport());
console.error(`tldcost-mcp: ready (${api.baseUrl})`);
