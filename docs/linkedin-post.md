# Post do LinkedIn (rascunho)

🚀 Terminei meu projeto prático de **Model Context Protocol (MCP)** na pós em Engenharia de IA Aplicada (UniPDS).

O desafio: como deixar uma IA operar um sistema legado de clientes **sem reescrevê-lo e sem abrir mão de segurança**?

O que construí, o **CRM Copilot**:
🔧 MCP Server com 5 tools, 2 resources e 2 prompts
🔐 API com JWT + RBAC + service tokens com escopos
🚦 Rate limiting por identidade (com Retry-After que o modelo consegue ler)
🤖 Agente LangChain.js que descobre as tools via MCP e gerencia clientes em linguagem natural
💻 Funciona no VS Code, Claude Desktop e no meu próprio agente
✅ 11 testes automatizados (API + MCP Client)

Decisão de arquitetura que mais me ensinou: o token do MCP **não tem permissão de delete**. Se um prompt injection convencer o agente a apagar tudo, a API recusa. Segurança não pode depender do modelo "se comportar".

Maior aprendizado: MCP não substitui tools, ele **padroniza** como a IA descobre e usa contexto e ações. Um servidor, vários clientes.

🎥 Demo no primeiro comentário
🔗 Código: github.com/RickAmorim87/crm-copilot-mcp

#MCP #ModelContextProtocol #IA #LLM #LangChainJS #NodeJS #EngenhariaDeIA

---
## Primeiro comentário
Demo (45s): peço ao agente "cadastre a Marina da Initech e marque como ativa", depois "apague a Marina" e a API bloqueia por falta de escopo.

## Roteiro do vídeo (45s)
1. (0-5s) Terminal: `npm run api`.
2. (5-20s) `npm run agent`, criar e atualizar um cliente em português.
3. (20-30s) Pedir para apagar: mostrar o erro 403 sendo explicado pelo agente.
4. (30-40s) `npm run inspect`: mostrar tools, resources e prompts.
5. (40-45s) `npm test`: 11 testes verdes.
