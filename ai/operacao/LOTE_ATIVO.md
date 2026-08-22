# Lote ativo

Estado: `VALIDADO_LOCAL_PARA_DRAFT_PR_4_5_1`

## Lote: 2026-08-21-sincronizacao-completa-4-5-1

- Base remota reconciliada por GitHub MCP: `156da8752c8c4513fea86eaf520211e7df039d0c` (`main`, release 4.5.0).
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-21-sincronizacao-completa-4-5-1.md`.
- Escopo: todas as diferenças reais do workspace contra o `main` remoto, deduplicadas por hash, incluindo acesso assistido do Aluno, relatório do Caixa, formulários de turmas, documentação e capas EAD.
- Exclusões: a migration `safe_typography_v5` e seu contrato, substituídos pela v6 já versionada; caches, builds e artefatos regeneráveis; mudança de governança fora deste lote.
- Esta publicação atualiza somente GitHub em Draft PR. A migration de senha temporária e a Edge Function atualizada ficam versionadas, sem aplicação ou deploy de produção neste lote.
- Validação local aprovada: versão, contrato de agentes, TypeScript, lint, 90 testes da função de usuários, 525 contratos Supabase, 42 testes do Caixa, contratos de PDF/turmas/documentos, checks Deno e build.
- Índice RAG fechado com 11 fontes e 60 trechos; resta somente o `git diff --check` final antes do commit.
- Gates remotos: CI do GitHub e inspeção do Draft PR.
- Produção permanece bloqueada: sem migration, deploy de Edge Function, merge em `main` ou publicação Vercel sem autorização posterior explícita.

Histórico encerrado: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
