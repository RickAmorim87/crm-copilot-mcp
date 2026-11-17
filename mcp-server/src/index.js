#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from './apiClient.js';
import { createServer } from './server.js';

// stdio transport: stdout is reserved for the protocol, so log to stderr only.
const api = createApiClient({
  baseUrl: process.env.API_URL || 'http://localhost:3000',
  token: process.env.MCP_SERVICE_TOKEN,
});

await createServer({ api }).connect(new StdioServerTransport());
console.error('crm-copilot MCP server running on stdio');
