import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, startMcpClient, textOf } from './helpers.js';

let api, client, adminClient;
before(async () => {
  api = await startApi();
  client = await startMcpClient({ apiUrl: api.url, token: 'dev-mcp-token' });
  adminClient = await startMcpClient({ apiUrl: api.url, token: 'dev-admin-token' });
});
after(async () => { await client.close(); await adminClient.close(); await api.close(); });

test('discovers tools, resources and prompts', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['create_customer', 'delete_customer', 'get_customer', 'list_customers', 'update_customer']);
  assert.equal(tools.find((t) => t.name === 'delete_customer').annotations.destructiveHint, true);
  assert.equal((await client.listResources()).resources.length, 2);
  assert.equal((await client.listPrompts()).prompts.length, 2);
});

test('full CRUD lifecycle through MCP', async () => {
  const created = JSON.parse(textOf(await client.callTool({ name: 'create_customer', arguments: { name: 'Eva', email: 'eva@mcp.dev', company: 'MCP Inc' } })));
  assert.equal(created.status, 'lead');

  const found = JSON.parse(textOf(await client.callTool({ name: 'list_customers', arguments: { q: 'mcp inc' } })));
  assert.equal(found.length, 1);

  const updated = JSON.parse(textOf(await client.callTool({ name: 'update_customer', arguments: { id: created.id, status: 'active' } })));
  assert.equal(updated.status, 'active');

  const del = await adminClient.callTool({ name: 'delete_customer', arguments: { id: created.id } });
  assert.ok(!del.isError);
});

test('least privilege: delete with MCP token is refused', async () => {
  const { id } = JSON.parse(textOf(await client.callTool({ name: 'create_customer', arguments: { name: 'Keep', email: 'keep@mcp.dev' } })));
  const r = await client.callTool({ name: 'delete_customer', arguments: { id } });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /403/);
});

test('API errors become tool errors the model can read', async () => {
  const r = await client.callTool({ name: 'create_customer', arguments: { name: 'Dup', email: 'ana@acme.com' } });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /409/);
});

test('resources and prompts work', async () => {
  const schema = await client.readResource({ uri: 'customers://schema' });
  assert.match(schema.contents[0].text, /Customer schema/);
  const stats = JSON.parse((await client.readResource({ uri: 'customers://stats' })).contents[0].text);
  assert.ok(stats.total >= 3);
  const p = await client.getPrompt({ name: 'portfolio_summary', arguments: {} });
  assert.match(p.messages[0].content.text, /customers:\/\/stats/);
});
