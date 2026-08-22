# Lote ativo

Estado: `PUBLICADO_SUPABASE_E_DRAFT_PR_4_6_0_MODULARIZADO`

## Lote: 2026-08-22-modularizacao-teto-500-4-6-0

- Base deste complemento: commit `f87d2958109b60b4827c9b759c42dd0c3bd076ce` no Draft PR #79.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-22-modularizacao-teto-500-4-6-0.md`.
- Escopo: somente arquivos do lote 4.6.0 que ultrapassavam 500 linhas, suas extrações coesas e a governança necessária para tornar o teto verificável.
- Três frentes independentes: login público/recuperação, gestão de Responsáveis e Edge Functions/contratos; revisão integrada separada.
- Migrations remotas `20260822024300` e `20260822024309` permanecem byte a byte imutáveis e protegidas por SHA-256; novas migrations entram no teto antes da aplicação quando a divisão for segura.
- O gate incremental lê manifestos auditados, exige o manifesto do lote ativo, preserva a cobertura anterior e rejeita retirada silenciosa, exceção arbitrária ou alteração de migration aplicada.
- Supabase: `portal-user-management` v33 ativa com JWT obrigatório e hash `ace1f8db5b8689502de51209baea555706e1c6adcaf9b356b05b40fe33e21da9`; `portal-auth` v15 ativa como endpoint público protegido internamente, hash `f64cc48d81af92dcef3988f78f01b913e238b7e1cf87c64fa14121ab889507ec`.
- Validação integrada: teto 119 arquivos manuais, TypeScript, ESLint global, Deno check/fmt, build, 196 testes relevantes e 49 testes focados após a limpeza do lint; revisão independente sem bloqueadores.
- GitHub: complemento atômico no Draft PR #79, mantido sem merge; CI remoto é o gate final. Não publicar Vercel Produção.

Histórico encerrado: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
