# Memória canônica do projeto

Atualizada em: 2026-08-06

## Autoridade e contexto

- `AGENTS.md` na raiz é a instrução operacional obrigatória para todos os agentes deste repositório.
- O contexto deve ser recuperado por escopo: leia esta memória, o lote ativo e somente os trechos encontrados pelo RAG relacionados à demanda.
- Não trate arquivos de triagem, prompts históricos ou cópias em `ai/memoria`, `ai/rag` e `ai/skil` como regras atuais sem confirmar esta memória e o `AGENTS.md`.

## Entrega em lote

- Agrupar uma demanda coesa em um lote antes de publicar.
- Não criar commit, push, PR ou deploy por arquivo ou ajuste pequeno.
- Não disparar deploy enquanto o lote está em desenvolvimento.
- Executar validações focadas durante o trabalho e as validações finais uma única vez, ao fechar o lote.
- Publicar um único commit atômico pelo MCP GitHub, seguido de uma única Preview Vercel quando o lote estiver pronto para validação.
- Produção exige solicitação explícita do usuário e os critérios visuais/funcionais do lote atendidos.

## Coordenação de agentes

- Cada agente recebe uma tarefa delimitada, com arquivos ou domínio definidos e resultado esperado.
- Evitar auditorias amplas repetidas; use a busca RAG e repasse evidências entre agentes.
- Um único responsável altera cada arquivo compartilhado, migration, registro de versão ou configuração de deploy.
- Antes de publicar, consolidar as conclusões e atualizar os registros do lote.

## GitHub, Vercel e versão

- Operações remotas de GitHub são exclusivamente pelo MCP GitHub; nunca usar `git` ou `gh` para publicar.
- Preserve alterações paralelas e inclua somente arquivos pertencentes ao lote.
- Publicações por MCP podem não atualizar a referência Git local. Um `git status` amplo pode misturar um snapshot local antigo com conteúdo já publicado; confirme somente os caminhos do lote pelo MCP e use uma lista explícita de arquivos no commit.
- Nunca apague ou restaure código apenas para deixar o status local vazio. Limpe somente artefatos regeneráveis comprovados, e mantenha o código-fonte até haver reconciliação remota por escopo.
- Para alterações de produto, respeite `internal/versioning/system-version.json` e `internal/versioning/CHANGELOG.md`.
- A Vercel recebe uma Preview somente no fechamento do lote. Reexecutar um deploy deve apontar para o commit atual e completo, nunca para um snapshot intermediário.

## Supabase, backend e financeiro

- Supabase remoto é exclusivamente por MCP: SQL, migrations, logs, Auth, Storage, RLS, Realtime e Edge Functions.
- O frontend coleta entradas, apresenta estados e exibe resultados canônicos. Não calcula valores, parcelas, juros, multa, desconto, saldos, patrimônio, recebíveis, transferências ou regras financeiras.
- Regras e mutações financeiras pertencem ao backend/RPC, com idempotência, auditoria, autorização por escopo e invalidação TanStack Query/Realtime.
- Novas cobranças: Banese para boleto/Pix e Mercado Pago para cartão, respeitando integralmente os bloqueios de homologação definidos no `AGENTS.md`.

## Qualidade mínima

- Escolher testes pelo domínio alterado; não executar uma varredura total por padrão.
- No encerramento do lote, executar os testes focados e, quando aplicável, TypeScript, lint e build uma vez.
- Registrar resultado, limitações conhecidas e link da Preview no ledger de publicação.

## Recuperação RAG

- Fonte versionada: `ai/operacao/` e `docs/decisions/`, conforme `rag/manifesto.json`.
- Índice lexical local: `node scripts/agent-memory-rag.mjs index` e busca por `search`.
- Índice semântico opcional: `node scripts/agent-memory-rag.mjs embed`, com `OPENAI_API_KEY` configurada fora do repositório. Vetores são cache local e nunca entram no Git. Sem essa chave, o RAG lexical versionado continua sendo o mecanismo padrão.
- OpenContext foi inicializado como cache persistente, mas a versão instalada exige provedor configurado inclusive para consulta keyword. Sincronize-o no fechamento do lote; não o use como dependência operacional enquanto não houver credencial aprovada.
