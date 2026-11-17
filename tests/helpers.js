import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadConfig } from '../api/src/config.js';
import { createApp } from '../api/src/app.js';
import { createMemoryRepository } from '../api/src/repository.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startApi(overrides = {}) {
  const config = { ...loadConfig({}), ...overrides };
  const server = http.createServer(createApp({ config, repo: createMemoryRepository() }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, config, close: () => new Promise((r) => server.close(r)) };
}

export async function startMcpClient({ apiUrl, token }) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, 'mcp-server/src/index.js')],
    env: { ...process.env, API_URL: apiUrl, MCP_SERVICE_TOKEN: token },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

export const textOf = (result) => result.content.map((c) => c.text).join('');
