import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const STATUSES = ['lead', 'active', 'inactive'];
const text = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (e) => ({
  isError: true,
  content: [
    {
      type: 'text',
      text: `Error${e.status ? ` ${e.status}` : ''}: ${e.message}${e.details ? `\n${e.details.join('\n')}` : ''}`,
    },
  ],
});
const safe = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (e) {
    return fail(e);
  }
};

export const CUSTOMER_SCHEMA_DOC = `# Customer schema
| field | type | notes |
|---|---|---|
| id | uuid | generated |
| name | string (1-120) | required |
| email | string | required, unique, lowercased |
| phone | string | optional |
| company | string | optional |
| status | lead | active | inactive | default: lead |
| createdAt / updatedAt | ISO date | generated |

Scopes: read = list/get, write = create/update, delete = delete (admin only).`;

export function createServer({ api, version = '1.0.0' }) {
  const server = new McpServer({ name: 'crm-copilot', version });

  // ---------- Tools ----------
  server.registerTool(
    'list_customers',
    {
      title: 'List customers',
      description: 'Search customers by free text (name, email, company) and/or status. Returns up to `limit` results.',
      inputSchema: {
        q: z.string().optional().describe('Free-text search'),
        status: z.enum(STATUSES).optional(),
        limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (args) => text(await api.list(args))),
  );

  server.registerTool(
    'get_customer',
    {
      title: 'Get customer',
      description: 'Fetch one customer by id.',
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ id }) => text(await api.get(id))),
  );

  server.registerTool(
    'create_customer',
    {
      title: 'Create customer',
      description: 'Create a customer. Email must be unique. Status defaults to "lead".',
      inputSchema: {
        name: z.string().min(1).max(120),
        email: z.string().email(),
        phone: z.string().optional(),
        company: z.string().optional(),
        status: z.enum(STATUSES).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    safe(async (args) => text(await api.create(args))),
  );

  server.registerTool(
    'update_customer',
    {
      title: 'Update customer',
      description: 'Partially update a customer. Only the provided fields change.',
      inputSchema: {
        id: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        status: z.enum(STATUSES).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safe(async ({ id, ...patch }) => text(await api.update(id, patch))),
  );

  server.registerTool(
    'delete_customer',
    {
      title: 'Delete customer',
      description: 'Permanently delete a customer. Irreversible: confirm with the user first. Requires the delete scope.',
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    safe(async ({ id }) => {
      await api.remove(id);
      return text(`Customer ${id} deleted.`);
    }),
  );

  // ---------- Resources ----------
  server.registerResource(
    'customer-schema',
    'customers://schema',
    { title: 'Customer schema', description: 'Fields, constraints and permission scopes', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: CUSTOMER_SCHEMA_DOC }] }),
  );

  server.registerResource(
    'customer-stats',
    'customers://stats',
    { title: 'Portfolio stats', description: 'Live customer counts by status', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await api.stats(), null, 2) }],
    }),
  );

  // ---------- Prompts ----------
  server.registerPrompt(
    'portfolio_summary',
    {
      title: 'Customer portfolio summary',
      description: 'Executive summary of the customer base with suggested follow-ups',
      argsSchema: { focus: z.enum(STATUSES).optional() },
    },
    ({ focus }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Read the resource customers://stats and use list_customers${focus ? ` (status="${focus}")` : ''} ` +
              'to write a short executive summary of the customer base: totals by status, notable companies, ' +
              'and 3 suggested follow-up actions. Do not modify any data.',
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'onboard_customer',
    {
      title: 'Onboard a customer',
      description: 'Safely register a new customer, checking for duplicates first',
      argsSchema: { name: z.string(), email: z.string(), company: z.string().optional() },
    },
    ({ name, email, company }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Onboard ${name} <${email}>${company ? ` from ${company}` : ''}. First call list_customers with q="${email}" ` +
              'to check for an existing record. If none exists, call create_customer with status "lead" and show the result.',
          },
        },
      ],
    }),
  );

  return server;
}
