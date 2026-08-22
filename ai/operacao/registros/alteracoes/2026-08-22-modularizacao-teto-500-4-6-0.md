# Modularização e teto de 500 linhas — 4.6.0

Data: 2026-08-22

Estado: Supabase publicado; entrega versionada no Draft PR #79; sem merge ou Vercel Produção.

## Objetivo e decisão

O primeiro passe ficou restrito aos arquivos alterados na entrega 4.6.0 de acesso do Responsável. A auditoria encontrou 14 arquivos acima de 500 linhas: 12 arquivos ativos foram divididos por responsabilidade e as duas migrations já aplicadas foram preservadas sem qualquer edição.

O teto passa a ser de 500 linhas físicas para arquivos manuais de implementação, teste, documentação ativa, política e skill. A regra não pode ser contornada por compressão de código. Gerados, lockfiles, binários e terceiros não são medidos; migrations aplicadas constituem exceção imutável identificada por versão remota e SHA-256.

## Resultado das três frentes

- Login público e recuperação: os três arquivos de 951, 885 e 624 linhas viraram fachadas/entrypoints de 14, 41 e 10 linhas, com hooks, contratos, views e serviços coesos; maior extração com 434 linhas.
- Gestão de Responsáveis: `ResponsaveisTab.tsx` caiu de 753 para 169 linhas; estado/mutações, helpers, tipos e seções visuais foram isolados; maior extração com 455 linhas.
- Edge e contratos: sete alvos ativos ficaram abaixo do teto; segurança de request, emissão temporária e reconciliação de convite ganharam módulos próprios; fixtures/cases de teste não entram nos bundles de produção.

## Governança e proteção

- AGENTS, memória canônica, protocolo, skill sênior e skill operacional local registram o teto e suas exceções.
- `check-file-line-limits.mjs` valida os manifestos acumulados, o total declarado, o lote ativo e o limite físico.
- Exceções só aceitam migrations aplicadas existentes no caminho canônico, com ID remoto e SHA-256. O CI também compara migration, exceção e cobertura contra a base do PR.
- Paths legitimamente removidos no futuro exigem registro de retirada; arquivos ainda existentes não podem ser aposentados para escapar do teto.
- O changelog ativo ficou abaixo de 500 linhas e o histórico foi dividido em dois arquivos, com proteção contra remoção, alteração e versão duplicada.
- O RAG passa a testar presença e hash de todas as fontes esperadas, evitando índice silenciosamente desatualizado.

## Validação

- Frentes isoladas: Gestor 12/12; login/primeiro acesso 70/70; Edge e contratos SQL 172/172; Portal Auth/nativo 32/32.
- Integração: 196 testes relevantes aprovados; após a limpeza de sete resíduos mecânicos do lint, 49 testes diretamente afetados também foram repetidos e aprovados.
- Teto: 119 arquivos manuais auditados; maior arquivo com 479 linhas. As únicas exceções são duas migrations aplicadas e o índice RAG gerado.
- TypeScript global, ESLint global, Deno check/fmt, controle de versão e build Vite com 26 páginas sociais: aprovados.
- Revisão independente: sem bloqueadores após testar allowlists, paths retirados, monotonicidade do escopo, hashes RAG, archives do changelog e normalização Unicode.

## Produção Supabase

- `portal-user-management` v33: `ACTIVE`, `verify_jwt=true`, hash `ace1f8db5b8689502de51209baea555706e1c6adcaf9b356b05b40fe33e21da9`.
- `portal-auth` v15: `ACTIVE`, `verify_jwt=false` preservado por ser o endpoint público com Turnstile, rate limit e validação de origem, hash `f64cc48d81af92dcef3988f78f01b913e238b7e1cf87c64fa14121ab889507ec`.
- Os bundles foram derivados do grafo Deno e não contêm fixtures ou testes. A consulta de logs na janela imediata pós-deploy retornou zero erro/invocação.
- Nenhuma migration, registro de usuário ou dado de negócio foi alterado neste complemento.

## Manifesto explícito

### Governança, operação e versão

- `.github/workflows/quality-gates.yml`
- `AGENTS.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/PROTOCOLO_DE_LOTES.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-22-modularizacao-teto-500-4-6-0.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-07-14-a-2026-07-26.md`
- `internal/versioning/changelog/2026-07-26-a-2026-07-31.md`
- `package.json`
- `pasta sem título/senior-dev-skill-v2-2/SKILL.md`
- `pasta sem título/senior-dev-skill-v2-2/capitulos/05-frontend-componentizacao.md`
- `pasta sem título/senior-dev-skill-v2-2/capitulos/15-checklist-final.md`
- `pasta sem título/senior-dev-skill-v2-2/capitulos/16-comunicacao-agentes.md`
- `pasta sem título/senior-dev-skill-v2-2/capitulos/17-ci-cd-automacao.md`
- `scripts/check-file-line-limits.mjs`
- `scripts/check-version-record.mjs`
- `scripts/test-agent-operation.mjs`

### Gestão de Responsáveis

- `modules/gestor/parceiros/responsaveis/ResponsaveisTab.tsx`
- `modules/gestor/parceiros/responsaveis/responsaveis.rpc-contract.test.ts`
- `modules/gestor/parceiros/responsaveis/responsaveis-tab.helpers.ts`
- `modules/gestor/parceiros/responsaveis/responsaveis-tab.types.ts`
- `modules/gestor/parceiros/responsaveis/hooks/useResponsaveisTabActions.ts`
- `modules/gestor/parceiros/responsaveis/components/ResponsaveisToolbar.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsaveisList.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelEditForm.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelIdentitySection.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelLinksSection.tsx`
- `modules/gestor/parceiros/responsaveis/components/ResponsavelDetailsPanel.tsx`

### Login público e recuperação

- `modules/login/PasswordRecoveryPage.tsx`
- `modules/login/password-recovery/password-recovery-auth.ts`
- `modules/login/password-recovery/usePasswordRecovery.ts`
- `modules/login/password-recovery/PasswordRecoveryAppView.tsx`
- `modules/login/password-recovery/PasswordRecoveryWebView.tsx`
- `modules/public/login/AlunoLoginPublicPage.tsx`
- `modules/public/login/AlunoLoginPublicView.tsx`
- `modules/public/login/aluno-login-redirect.ts`
- `modules/public/login/useAlunoLoginPublicPage.ts`
- `modules/public/login/useAlunoSignupForm.ts`
- `modules/public/login/aluno-public-auth.service.ts`
- `modules/public/login/aluno-public-auth.contract.ts`
- `modules/public/login/aluno-public-auth.helpers.ts`
- `modules/public/login/aluno-public-auth-session.helpers.ts`
- `modules/public/login/aluno-public-first-access.service.ts`
- `modules/public/login/aluno-public-session.service.ts`
- `modules/public/login/aluno-public-signup.service.ts`
- `modules/public/login/relationship-consent.contract.test.mjs`
- `modules/public/login/aluno-public-signup-demographics.contract.test.ts`
- `modules/public/login/aluno-first-access.contract.test.ts`
- `modules/public/login/aluno-invite-expired.contract.test.ts`
- `modules/public/login/aluno-public-signup-recovery.contract.test.ts`
- `modules/login/institutional-login-error.test.ts`
- `modules/login/portal-context-first-access.test.ts`
- `modules/gestor/parceiros/responsaveis/responsavel-access.contract.test.ts`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`
- `scripts/test-portal-auth-flow.mjs`
- `scripts/test-native-turnstile-flow.mjs`

### Edge Functions e contratos SQL

- `supabase/functions/portal-auth/index.ts`
- `supabase/functions/portal-auth/request-security.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.ts`
- `supabase/functions/portal-user-management/handlers/issue-responsavel-temporary-password.test-fixture.ts`
- `supabase/functions/portal-user-management/handlers/issue-responsavel-temporary-password.test.ts`
- `supabase/functions/portal-user-management/handlers/issue-responsavel-temporary-password.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.test-cases.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.test-fixture.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.test.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.ts`
- `supabase/functions/portal-user-management/handlers/responsavel-invite-reconciliation.ts`
- `supabase/functions/portal-user-management/handlers/temporary-password-emission.ts`
- `supabase/functions/portal-user-management/runtime-contract.test.ts`
- `supabase/functions/portal-user-management/temporary-password-verification.ts`
- `supabase/tests/responsavel_first_access.additional-contracts.ts`
- `supabase/tests/responsavel_first_access.contract-support.ts`
- `supabase/tests/responsavel_first_access.contract.test.ts`
- `supabase/tests/student_temporary_password_access.contract.test.ts`

Total: 78 arquivos.

## Pendências deliberadas

- Manter as duas migrations aplicadas intactas, mesmo acima de 500 linhas.
- Não ampliar este primeiro passe para monólitos antigos fora dos manifestos 4.6.0.
- Manter o PR #79 como Draft e não publicar o frontend no Vercel nem mesclar em `main` sem autorização posterior.
- O smoke visual autenticado continua dependente de sessão e massa canônica de Responsável.
