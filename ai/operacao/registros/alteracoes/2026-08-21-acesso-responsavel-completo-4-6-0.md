# Acesso completo do Responsável — 4.6.0

Data: 2026-08-21

Estado: Supabase publicado; entrega versionada no Draft PR #79; sem merge ou Vercel Produção.

## Resultado

O Gestor passa a acompanhar o estado de acesso do Responsável Legal, confirmar que a titularidade do e-mail foi validada por canal independente, reenviar a recuperação e emitir uma senha temporária mostrada uma única vez. No primeiro login, o Responsável precisa criar a senha própria e aceitar os Termos de Uso vigentes antes de consultar dependentes.

O portal do Responsável está no mesmo nível modular de Gestor, Professor e Aluno, em `modules/responsavel/`, com contratos, serviço, hook e componentes próprios. O módulo administrativo permanece em `modules/gestor/parceiros/responsaveis/`, também separado em contrato, serviço, query keys, hook e componentes.

## Segurança e consistência

- A senha temporária usa CSPRNG, nunca é gravada em tabela, log, cache TanStack ou storage do navegador e só é devolvida após confirmação canônica da emissão.
- A emissão reserva o alvo no banco, stageia marker e nonce em `app_metadata`, confirma a leitura, altera somente a senha e verifica a credencial em cliente Auth efêmero associado ao mesmo UID/e-mail.
- Falha externa ambígua permanece fail-closed. Marker, nonce e reserva só são limpos quando o estado observado permite a reconciliação; uma senha incerta nunca é mostrada.
- Contas multiperfil não recebem senha temporária pelo Gestor, porque a credencial Auth é global. Mudança de vínculo, tipo ou remoção do registro durante emissão também é bloqueada por gatilhos e advisory locks.
- O reenvio usa ledger com RLS e `requestId` estável. Resposta ambígua preserva o mesmo UUID; retry em `RESERVADO` ou `ENVIADO` não chama novamente o provedor. Reserva ambígua com mais de cinco minutos vira falha auditável e pode ser tentada novamente.
- Somente `email_confirmed_at` comprova confirmação do e-mail no Auth. `confirmed_at` genérico não é aceito.
- Aluno e Responsável só recebem dependentes, conteúdo acadêmico ou assinatura depois da senha própria e dos Termos vigentes. A RPC central de assinatura aplica o mesmo gate aos dois papéis.
- Respostas sensíveis da Edge são `no-store`. O `portal-auth` também marca explicitamente a resposta que contém access/refresh token com `Cache-Control: no-store` e `Pragma: no-cache`.

## Produção Supabase

- Projeto: `kfekgwyqozhicpfuunpo`.
- Migration local `20260821230000_harden_student_temporary_password_first_access.sql`, registrada remotamente como `20260822024300` (`harden_student_temporary_password_first_access`).
- Migration local `20260821234000_complete_responsavel_first_access.sql`, registrada remotamente como `20260822024309` (`complete_responsavel_first_access`).
- `portal-user-management` versão 31: `ACTIVE`, `verify_jwt=true`, hash remoto `af23c26fbc9188dc6be2c5558fbc892e2084c40f4c43441d98cee3117e31bf07`.
- `portal-auth` versão 14: `ACTIVE`, `verify_jwt=false` por ser o endpoint público de login protegido pelo próprio Turnstile, rate limit e validação de origem; hash remoto `f6a5fb6415bea10a98741c85f73add79c5cd3bba27f6072f279a6cafb46501ee`.
- Pós-check: 18/18 funções e 10/10 colunas esperadas; nove gatilhos relevantes ativos; ledger com RLS, uma política restritiva, sem grants de API e com zero linhas/reservas; zero coluna de segredo temporário; gate de assinatura do Aluno e Responsável confirmado.
- A tabela de Responsáveis tinha zero registros no fechamento, portanto nenhuma identidade, senha ou e-mail real foi criado para validar o lote.
- Advisor de segurança permaneceu na linha de base de 442 avisos preexistentes. O advisor de performance passou de 237 para 238 apenas porque o índice novo do ledger ainda não recebeu uso imediatamente após a criação.

## Validação

- `portal-user-management`: 150 testes aprovados.
- Contratos SQL de Aluno/Responsável: 22 aprovados.
- Contratos de frontend e navegação: 29 aprovados.
- Fluxo `portal-auth`: 17 aprovados.
- Correção final de idempotência Edge ↔ hook: 16 testes focados e auditoria independente aprovados.
- `deno check` dos entrypoints, `deno fmt --check` dos arquivos Deno alterados, TypeScript global e ESLint focado aprovados.
- Build Vite de produção e geração das 26 páginas sociais aprovados.
- As duas migrations foram compiladas juntas em transação remota com rollback antes da aplicação individual.
- A listagem remota confirmou migrations e Edge Functions ativas. A janela pós-deploy não apresentou invocações/logs de boot; nenhum smoke com credencial foi fabricado.

## Manifesto explícito

### Operação, versão e documentação

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-21-acesso-responsavel-completo-4-6-0.md`
- `docs/sistema/modulos/portais-e-acesso.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`

### Rotas, login e primeiro acesso

- `App.tsx`
- `modules/login/PasswordRecoveryPage.tsx`
- `modules/login/portal-context-first-access.test.ts`
- `modules/login/portal-context.contract.ts`
- `modules/login/portal-context.service.ts`
- `modules/login/portal-first-access.test.ts`
- `modules/login/portal-first-access.ts`
- `modules/public/login/AlunoFirstAccessPage.tsx`
- `modules/public/login/AlunoLoginPublicPage.tsx`
- `modules/public/login/aluno-first-access.contract.test.ts`
- `modules/public/login/aluno-public-auth.service.ts`
- `scripts/test-portal-auth-flow.mjs`

### Gestão e portal do Responsável

- `modules/gestor/parceiros/responsaveis/ResponsaveisTab.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelAccessCard.tsx`
- `modules/gestor/parceiros/responsaveis/hooks/useResponsavelAccess.ts`
- `modules/gestor/parceiros/responsaveis/responsaveis.contract.ts`
- `modules/gestor/parceiros/responsaveis/responsaveis.query-keys.ts`
- `modules/gestor/parceiros/responsaveis/responsaveis.rpc-contract.test.ts`
- `modules/gestor/parceiros/responsaveis/responsaveis.service.ts`
- `modules/gestor/parceiros/responsaveis/responsavel-access.contract.test.ts`
- `modules/gestor/parceiros/responsaveis/responsavel-access.contract.ts`
- `modules/gestor/parceiros/responsaveis/responsavel-access.service.ts`
- `modules/responsavel/ResponsavelFirstAccessPage.tsx`
- `modules/responsavel/components/ResponsavelConnectionError.tsx`
- `modules/responsavel/components/ResponsavelDependentesPanel.tsx`
- `modules/responsavel/components/ResponsavelProfilePanel.tsx`
- `modules/responsavel/components/ResponsavelShell.tsx`
- `modules/responsavel/hooks/useResponsavelDependentes.ts`
- `modules/responsavel/portal-navigation.test.ts`
- `modules/responsavel/responsavel.contract.ts`
- `modules/responsavel/responsavel.page.tsx`

### Edge Functions

- `supabase/functions/portal-auth/index.ts`
- `supabase/functions/portal-user-management/auth-users.ts`
- `supabase/functions/portal-user-management/index.ts`
- `supabase/functions/portal-user-management/runtime-contract.test.ts`
- `supabase/functions/portal-user-management/temporary-password-verification.test.ts`
- `supabase/functions/portal-user-management/temporary-password-verification.ts`
- `supabase/functions/portal-user-management/types.ts`
- `supabase/functions/portal-user-management/handlers/confirm-partner-email.test.ts`
- `supabase/functions/portal-user-management/handlers/confirm-partner-email.ts`
- `supabase/functions/portal-user-management/handlers/confirm-responsavel-email.test.ts`
- `supabase/functions/portal-user-management/handlers/confirm-responsavel-email.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.ts`
- `supabase/functions/portal-user-management/handlers/issue-responsavel-temporary-password.test.ts`
- `supabase/functions/portal-user-management/handlers/issue-responsavel-temporary-password.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.test.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.ts`
- `supabase/functions/portal-user-management/handlers/list-partner-email-statuses.test.ts`
- `supabase/functions/portal-user-management/handlers/list-partner-email-statuses.ts`
- `supabase/functions/portal-user-management/handlers/list-responsavel-access-statuses.test.ts`
- `supabase/functions/portal-user-management/handlers/list-responsavel-access-statuses.ts`
- `supabase/functions/portal-user-management/handlers/resend-responsavel-access.test.ts`
- `supabase/functions/portal-user-management/handlers/resend-responsavel-access.ts`
- `supabase/functions/portal-user-management/handlers/responsavel-access-audit.ts`
- `supabase/functions/portal-user-management/handlers/responsavel-access-context.ts`
- `supabase/functions/portal-user-management/handlers/temporary-password.ts`

### Banco e contratos

- `supabase/migrations/20260821230000_harden_student_temporary_password_first_access.sql`
- `supabase/migrations/20260821234000_complete_responsavel_first_access.sql`
- `supabase/tests/student_temporary_password_access.contract.test.ts`
- `supabase/tests/responsavel_first_access.contract.test.ts`

Total: 67 arquivos, sem cache, build, dump, segredo ou artefato regenerável.

## Pendências deliberadas

- Manter a PR #79 como Draft e não mesclar antes do teste do usuário.
- Não publicar o frontend no Vercel sem nova autorização explícita.
- Executar smoke autenticado do Gestor criando/selecionando um Responsável, confirmando e-mail, testando reenvio/senha temporária, troca de senha, termos e dependentes quando houver sessão e massa canônica.
- O reenvio aceita nova tentativa após cinco minutos de resultado externo ambíguo; isso pode gerar mensagem duplicada somente nesse cenário limite, de forma auditável e necessária para evitar bloqueio permanente.
