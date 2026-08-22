# Lote ativo

Estado: `PUBLICADO_SUPABASE_E_DRAFT_PR_4_6_0`

## Lote: 2026-08-21-acesso-responsavel-completo-4-6-0

- Base do Draft PR antes deste lote: `ee233340083ed2ab527946479be66e3d12c7069b`, branch `codex/sincronizacao-completa-4-5-1`, PR #79.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-21-acesso-responsavel-completo-4-6-0.md`.
- Escopo: primeiro acesso completo do Responsável, confirmação administrativa de e-mail, reenvio idempotente, senha temporária de exibição única, troca obrigatória, termos vigentes e portal modular de dependentes/perfil.
- Produção Supabase: migrations remotas `20260822024300` e `20260822024309`; `portal-user-management` v31 ativa com JWT obrigatório; `portal-auth` v14 ativa como endpoint público com Turnstile/rate limit e tokens em resposta `no-store`.
- Pós-check do banco: 18/18 funções e 10/10 colunas esperadas, nove gatilhos ativos, ledger com RLS/política restritiva, zero reservas e nenhum campo destinado a persistir senha temporária em claro ou hash próprio.
- Validação local aprovada: Edge 150/150, contratos SQL 22/22, frontend 29/29, login 17/17, TypeScript, ESLint focado, Deno check/fmt e build Vite.
- Revisão cruzada em três frentes e auditoria independente encerradas sem bloqueador. O retry ambíguo preserva o mesmo `requestId` e não dispara um segundo e-mail.
- GitHub: atualização atômica no Draft PR #79, mantido sem merge. CI é o gate remoto do commit do lote.
- Não executado: publicação do frontend no Vercel, merge em `main` ou criação de usuário real. O smoke visual autenticado fica pendente por ausência de sessão/massa de Responsável no ambiente atual.

Histórico encerrado: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
