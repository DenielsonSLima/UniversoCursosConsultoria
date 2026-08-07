# RAG operacional

O RAG usa somente as fontes declaradas em `manifesto.json`; ele não percorre o repositório inteiro. Isso mantém a recuperação rápida, auditável e proporcional à demanda.

## Comandos

```bash
node scripts/agent-memory-rag.mjs index
node scripts/agent-memory-rag.mjs search "deploy vercel preview"
node scripts/agent-memory-rag.mjs status
```

O índice lexical é criado localmente em `index.json` e não é publicado. Para acrescentar recuperação semântica por embeddings, configure `OPENAI_API_KEY` no ambiente local, fora do Git, e execute:

```bash
node scripts/agent-memory-rag.mjs embed
```

Os vetores também são cache local. Reindexe e regenere embeddings apenas ao fechar um lote, nunca por ajuste isolado.

## OpenContext persistente

Depois de atualizar um lote, sincronize a fonte versionada para o OpenContext:

```bash
node scripts/sync-opencontext-memory.mjs
```

Nesta instalação, o OpenContext exige um provedor configurado inclusive para `oc search --mode keyword`. Por isso, a busca local acima é a camada ativa; use OpenContext após configurar a credencial aprovada e executar `oc index build`. A sincronização não envia dados a serviços externos.
