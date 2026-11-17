import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.js';

let api;
const call = (path, { token, method = 'GET', body } = {}) =>
  fetch(api.url + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
const login = async (username, password) => (await (await call('/auth/login', { method: 'POST', body: { username, password } })).json()).token;

before(async () => { api = await startApi({ rateLimit: { windowMs: 60_000, max: 8, loginMax: 5 } }); });
after(() => api.close());

test('rejects requests without a token', async () => {
  assert.equal((await call('/customers')).status, 401);
});

test('login rejects wrong password and issues JWT otherwise', async () => {
  assert.equal((await call('/auth/login', { method: 'POST', body: { username: 'admin', password: 'x' } })).status, 401);
  assert.ok(await login('admin', 'admin123'));
});

test('RBAC: viewer can read but not write', async () => {
  const token = await login('viewer', 'viewer123');
  assert.equal((await call('/customers', { token })).status, 200);
  const r = await call('/customers', { token, method: 'POST', body: { name: 'X', email: 'x@x.com' } });
  assert.equal(r.status, 403);
});

test('service token scopes: mcp token cannot delete, admin token can', async () => {
  const created = await (await call('/customers', { token: 'dev-mcp-token', method: 'POST', body: { name: 'Del', email: 'del@x.com' } })).json();
  assert.equal((await call(`/customers/${created.id}`, { token: 'dev-mcp-token', method: 'DELETE' })).status, 403);
  assert.equal((await call(`/customers/${created.id}`, { token: 'dev-admin-token', method: 'DELETE' })).status, 204);
});

test('validation and duplicate email', async () => {
  assert.equal((await call('/customers', { token: 'dev-mcp-token', method: 'POST', body: { name: '', email: 'bad' } })).status, 400);
  assert.equal((await call('/customers', { token: 'dev-mcp-token', method: 'POST', body: { name: 'Dup', email: 'ana@acme.com' } })).status, 409);
});

test('rate limiting returns 429 with Retry-After', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await call('/customers/stats', { token: 'dev-admin-token' });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});
