# Identidade Auth multiperfil — 2026-08-24

Estado: `SUPABASE_E_EDGE_PUBLICADOS_AGUARDANDO_MERGE`

## Objetivo e contrato

Uma única identidade do Supabase Auth pode reunir os perfis Gestor, Professor, Aluno e Responsável. O compartilhamento é permitido somente quando CPF válido e e-mail canônico coincidem em todas as origens. Cada audiência continua separada:

- `/login`: somente Aluno e Responsável;
- `/sistema/login`: somente Gestor e Professor;
- um único perfil elegível entra automaticamente;
- dois perfis elegíveis exibem o seletor antes do redirecionamento.

## Segurança

- Metadados de convite somente são aceitos quando carregam prova HMAC emitida e revalidada pelo banco; a autorização não confia em campos livres de `user_metadata`.
- O vínculo reutiliza a senha existente e não dispara convite, recuperação ou troca de termos indevida.
- Depois do lock da linha, a trava da credencial por UID é tentada sem espera; disputa concorrente retorna `40001` para retry antes da trava de identidade. As migrations incrementais do lote redefinem as RPCs preexistentes de reserva, e constraints diferíveis revalidam CPF, e-mail e papel no fim da transação.
- Gestor e Parceiro removem Auth somente em trigger `AFTER DELETE`, depois de reconsultar todos os perfis; a exclusão de Responsável permanece conservadora e pode deixar uma identidade órfã para limpeza operacional futura.
- Convites de Aluno e Professor carregam prova HMAC revalidada no banco; somente `service_role` pode chamar a RPC de assinatura.
- Concorrência serializável pode devolver `40001` e o backend também trata `40P01` de forma conservadora; chamadores devem repetir a transação com backoff.

## Banco e backend

Migrations, obrigatoriamente nesta ordem:

1. `20260824113000_lock_auth_identity_before_profile_link.sql`;
2. `20260824113100_sync_shared_auth_email.sql`;
3. `20260824113200_harden_shared_auth_identity_deletion.sql`;
4. `20260824113250_include_responsavel_in_institutional_password_proof.sql`;
5. `20260824113255_scope_real_password_change_promotion.sql`;
6. `20260824113256_fail_fast_student_temporary_password_reservation.sql`;
7. `20260824113257_fail_fast_responsavel_temporary_password_reservation.sql`;
8. `20260824113260_lock_shared_credential_promotion.sql`;
9. `20260824113270_use_canonical_shared_credential_initializers.sql`;
10. `20260824113300_harden_responsavel_multi_profile_link.sql`;
11. `20260824113400_allow_partner_auth_identity_per_profile.sql`;
12. `20260824113410_complete_public_signup_credential_proof.sql`;
13. `20260824113600_allow_professor_student_checkout_identity.sql`;
14. `20260824113700_sign_partner_invite_operations.sql`.

Ledgers reais de Produção, na mesma ordem: `20260825015246`, `20260825015256`, `20260825015307`, `20260825015315`, `20260825015323`, `20260825015333`, `20260825015344`, `20260825015355`, `20260825015404`, `20260825015416`, `20260825015428`, `20260825015437`, `20260825015446` e `20260825015455`.

A Edge Function `portal-user-management` foi publicada depois das migrations como v35, `ACTIVE`, com `verify_jwt: true`. O pacote enviou 39 arquivos TypeScript e `deno.json`; a leitura remota apresenta 38 arquivos runtime e `deno.json`, pois `types.ts` contém apenas tipos e é eliminado do pacote executável.

## Validação pré-publicação

- Login público/institucional, recuperação e deep links: `34/34` testes aprovados.
- Suíte completa da Edge Function: `207/207` testes aprovados; checagem Deno e formatação dos 34 arquivos Supabase do manifesto aprovadas.
- Contratos focados de rollout, fail-fast e promoção transacional de credencial: `67/67` testes aprovados.
- Suíte integrada de identidade multiperfil: `88/88` testes aprovados.
- Feedback do Gestor para Professor e Aluno: `5/5` testes aprovados.
- ESLint global, TypeScript sem emissão, teto de linhas e build Vite de produção: aprovados.
- Auditorias Supabase antes e depois da aplicação: zero duplicidades, papéis incompatíveis, divergências, pré-requisitos ausentes, provas falsas, backfills pendentes, locks bloqueadores ou transações antigas.
- Revisões independentes encerradas sem finding funcional `P1` ou `P2` aberto.
- Smoke SQL pós-DDL aprovou a ordem das 14 migrations, índices, 22 instâncias de triggers, ACLs, `search_path`, volatilidade, inicializadores canônicos, HMAC e preservação das identidades compartilhadas.
- Advisors mantiveram o baseline anterior, sem novo alerta atribuído ao lote: segurança `470` e performance `234`.
- A Edge v35 respondeu `401` sem cabeçalho de autorização; o log remoto confirmou `UNAUTHORIZED_NO_AUTH_HEADER`, deployment v35 e ausência de erro interno.
- Os contratos de concorrência são estáticos; Produção possui zero UIDs naturalmente compartilhados e não recebeu usuário artificial apenas para provocar disputa ou seletor autenticado.
- Todos os arquivos manuais do manifesto têm no máximo 500 linhas.

## Manifesto explícito

Total: 83 arquivos.

### Entrega funcional e testes

- `.github/workflows/quality-gates.yml`
- `App.tsx`
- `modules/aluno/login-app/AlunoAppLoginPage.tsx`
- `modules/gestor/parceiros/hooks/useParceirosMutations.ts`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx`
- `modules/gestor/parceiros/parceiros.service.contract.test.ts`
- `modules/gestor/parceiros/parceiros.service.ts`
- `modules/gestor/parceiros/portal-activation.service.ts`
- `modules/gestor/parceiros/responsaveis/responsavel-access.contract.test.ts`
- `modules/gestor/parceiros/student-access-feedback.contract.test.ts`
- `modules/login/LoginPage.tsx`
- `modules/login/coordinator-portal-collapse.contract.test.ts`
- `modules/login/coordinator-portal-redirect.ts`
- `modules/login/password-recovery/password-recovery-auth.test.ts`
- `modules/login/password-recovery/password-recovery-auth.ts`
- `modules/login/password-recovery/usePasswordRecovery.ts`
- `modules/login/portal-login-boundaries.contract.test.ts`
- `modules/login/portal-session.ts`
- `modules/professor/professor.page.tsx`
- `modules/public/login/AlunoLoginHero.tsx`
- `modules/public/login/AlunoLoginPublicView.tsx`
- `package.json`
- `scripts/test-portal-auth-flow.mjs`
- `supabase/functions/portal-user-management/auth-identity-ownership.test.ts`
- `supabase/functions/portal-user-management/auth-identity-ownership.ts`
- `supabase/functions/portal-user-management/handlers/ensure-professor-access-reconciliation.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-professor-access.shared-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-professor-access.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-professor-access.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.multi-profile.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.test-fixture.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.ts`
- `supabase/functions/portal-user-management/gestor-access.ts`
- `supabase/functions/portal-user-management/handlers/gestor-identity-links.test.ts`
- `supabase/functions/portal-user-management/handlers/gestor-identity-links.ts`
- `supabase/functions/portal-user-management/handlers/delete-partner.ts`
- `supabase/functions/portal-user-management/handlers/gestor-professor-error-sanitization.test.ts`
- `supabase/functions/portal-user-management/handlers/handler-error-log.test.ts`
- `supabase/functions/portal-user-management/handlers/handler-error-log.ts`
- `supabase/functions/portal-user-management/handlers/link-professor-auth-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/link-professor-auth-identity.ts`
- `supabase/functions/portal-user-management/handlers/partner-invite-reconciliation.test.ts`
- `supabase/functions/portal-user-management/handlers/partner-invite-reconciliation.ts`
- `supabase/functions/portal-user-management/handlers/professor-access-state.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.error-sanitization.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.shared-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.ts`
- `supabase/functions/portal-user-management/handlers/student-access-identity.ts`
- `supabase/functions/portal-user-management/handlers/student-invite-failure.ts`
- `supabase/functions/portal-user-management/student-access.ts`
- `supabase/functions/portal-user-management/student-access.test.ts`
- `supabase/functions/portal-user-management/handlers/upsert-gestor-user.test.ts`
- `supabase/functions/portal-user-management/handlers/upsert-gestor-user.ts`
- `supabase/functions/portal-user-management/types.ts`
- `supabase/migrations/20260824113000_lock_auth_identity_before_profile_link.sql`
- `supabase/migrations/20260824113100_sync_shared_auth_email.sql`
- `supabase/migrations/20260824113200_harden_shared_auth_identity_deletion.sql`
- `supabase/migrations/20260824113250_include_responsavel_in_institutional_password_proof.sql`
- `supabase/migrations/20260824113255_scope_real_password_change_promotion.sql`
- `supabase/migrations/20260824113256_fail_fast_student_temporary_password_reservation.sql`
- `supabase/migrations/20260824113257_fail_fast_responsavel_temporary_password_reservation.sql`
- `supabase/migrations/20260824113260_lock_shared_credential_promotion.sql`
- `supabase/migrations/20260824113270_use_canonical_shared_credential_initializers.sql`
- `supabase/migrations/20260824113300_harden_responsavel_multi_profile_link.sql`
- `supabase/migrations/20260824113400_allow_partner_auth_identity_per_profile.sql`
- `supabase/migrations/20260824113410_complete_public_signup_credential_proof.sql`
- `supabase/migrations/20260824113600_allow_professor_student_checkout_identity.sql`
- `supabase/migrations/20260824113700_sign_partner_invite_operations.sql`
- `supabase/tests/portal_partner_auth_checkout.contract.test.ts`
- `supabase/tests/portal_partner_auth_multi_role.contract.test.ts`
- `supabase/tests/portal_partner_auth_rollout_safety.contract.test.ts`
- `supabase/tests/portal_partner_invite_reconciliation.contract.test.ts`
- `supabase/tests/portal_shared_credential_promotion.contract.test.ts`

### Operação e versão

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-08-24-card-email-validado-gestor.md`
- `ai/operacao/registros/alteracoes/2026-08-24-identidade-auth-multiperfil.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-03.md`
- `internal/versioning/system-version.json`

### Preservado fora do lote

- Documentos binários locais e o componente `.legacy.tsx`.
- O lockfile Deno local, sem alteração de dependência runtime no lote.
- A migration/teste tipográfico v5, supersedida pela v6 já publicada.
- O ajuste isolado do contrato de provas individuais de assinatura, que exige lote próprio.

## Publicação e smoke

- PR GitHub `#90`: `feat/identidade-auth-multiperfil-4-8-0` sobre `main`; CI, controle de versão e Vercel Preview aprovados no head `f0e41d54872d4bf8d6246b64b1498941ac5b822c`.
- As 14 migrations estão aplicadas em Produção e passam no contrato pós-rollout; migrations aplicadas tornam-se imutáveis.
- `portal-user-management` v35 está `ACTIVE`, `verify_jwt: true`, e passou no smoke remoto de rejeição sem credencial.
- Merge GitHub, deploy web da `main` e smoke HTTP final permanecem pendentes deste fechamento.
- Nenhum dado pessoal ou usuário artificial foi criado em Produção apenas para validação.

## Limites

- A publicação parte da `main` remota e não inclui o snapshot integral do workspace.
- Nenhuma PR antiga, segredo, dado pessoal ou artefato gerado integra o commit.
- Migrations aplicadas serão imutáveis; correções futuras exigirão migrations incrementais.
