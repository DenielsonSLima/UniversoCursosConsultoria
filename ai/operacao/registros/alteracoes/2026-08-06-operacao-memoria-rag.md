# Alteração — operação de memória e RAG

- Lote: `2026-08-06-operacao-memoria-rag`
- Estado no fechamento local: `PRONTO_PARA_PUBLICACAO`
- Escopo: memória canônica, recuperação RAG local, registros separados, protocolo de lotes, sincronização opcional com OpenContext e propagação de instruções aos agentes.
- Não alterado: funcionalidades do portal, dados, banco, migrations, Edge Functions e produção.

## Evidências

- `node --test scripts/agent-memory-rag.test.mjs scripts/sync-opencontext-memory.test.mjs`: aprovado.
- `node scripts/agent-memory-rag.mjs search "frontend regras financeiras RPC" --json`: retornou `ai/operacao/MEMORIA_CANONICA.md` como fonte prioritária.
- A skill global `universo-batch-operations` foi validada localmente.

## Reconciliação local observada

Após publicações anteriores pelo MCP, a referência Git local permaneceu no commit `78d82e7`, enquanto o `main` remoto avançou 128 commits até `4ee3bf6`. Foram confirmados por hash 585 arquivos locais idênticos ao remoto; eles não são trabalho pendente e não devem ser apagados. Artefatos Android regeneráveis foram limpos e passaram a ser ignorados.

## Limite conhecido

A busca lexical RAG está operacional sem serviço externo. Embeddings semânticos são opcionais e somente serão gerados quando houver uma `OPENAI_API_KEY` aprovada e configurada fora do repositório.
