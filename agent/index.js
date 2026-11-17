import 'dotenv/config';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ChatAnthropic } from '@langchain/anthropic';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY in .env (see .env.example).');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The agent discovers tools from the MCP server at runtime; no tool is hard-coded here.
const mcp = new MultiServerMCPClient({
  mcpServers: {
    crm: {
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(root, 'mcp-server/src/index.js')],
      env: {
        ...process.env,
        API_URL: process.env.API_URL || 'http://localhost:3000',
        MCP_SERVICE_TOKEN: process.env.MCP_SERVICE_TOKEN || 'dev-mcp-token',
      },
    },
  },
});

const tools = await mcp.getTools();
console.log(`Tools discovered via MCP: ${tools.map((t) => t.name).join(', ')}\n`);

const agent = createReactAgent({
  llm: new ChatAnthropic({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', temperature: 0 }),
  tools,
  checkpointSaver: new MemorySaver(),
  prompt:
    'You are a CRM assistant. Use the tools to answer; never invent customer data. ' +
    'Before deleting anything, ask the user for explicit confirmation. Answer in the user\'s language.',
});

const ask = async (question) => {
  const out = await agent.invoke({ messages: [{ role: 'user', content: question }] }, { configurable: { thread_id: 'cli' } });
  const last = out.messages.at(-1).content;
  return typeof last === 'string' ? last : last.map((b) => b.text ?? '').join('');
};

const oneShot = process.argv.slice(2).join(' ');
if (oneShot) {
  console.log(await ask(oneShot));
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('CRM agent ready. Type a request (or "exit").\n');
  for (;;) {
    const q = (await rl.question('you> ')).trim();
    if (!q || q === 'exit') break;
    console.log(`\nagent> ${await ask(q)}\n`);
  }
  rl.close();
}
await mcp.close();
