# Validação de e-mail e consulta de identidade — 25/09/2026

Estado: PUBLICADO — backend aplicado; 4.8.88 em produção (PR #180), CI e Preview aprovadas.

## Causa, escopo e aceite

O fluxo confirm-partner-email falhava antes da auditoria: findAuthIdentityConflict consultava responsaveis_legais diretamente com service_role, embora a tabela seja privada por contrato. Logs mostraram duas respostas 500 da Edge e duas 403 da consulta. O teste comportamental com tabela privada reproduziu 500 no lugar de 200.

- Substituir as três consultas diretas da Edge por RPC mínima por UID exato; manter comparações de CPF/e-mail e falha fechada.
- RPC SECURITY DEFINER com search_path vazio, guarda interna service_role e EXECUTE restrito ao serviço. A tabela continua sem SELECT direto.
- Preservar validação administrativa auditada, sem confirmação Auth isolada, senha, convite ou envio de mensagem.
- Aplicar somente o manifesto e três arquivos no bundle remoto, preservando dependências e JWT.
- Risco: a Edge depende da RPC; ordem de aplicação banco primeiro, Edge depois.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-25-lentidao-repeticao-emissao.md`
- `ai/operacao/registros/alteracoes/2026-09-25-validacao-email-identidade.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/functions/portal-user-management/auth-identity-ownership.test.ts`
- `supabase/functions/portal-user-management/auth-identity-ownership.ts`
- `supabase/functions/portal-user-management/handlers/confirm-partner-email.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-professor-access-reconciliation.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-professor-access.shared-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-professor-access.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.test-fixture.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.ts`
- `supabase/functions/portal-user-management/handlers/gestor-identity-links.test.ts`
- `supabase/functions/portal-user-management/handlers/gestor-identity-links.ts`
- `supabase/functions/portal-user-management/handlers/gestor-professor-error-sanitization.test.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.test-fixture.ts`
- `supabase/functions/portal-user-management/handlers/link-professor-auth-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.error-sanitization.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.shared-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.test.ts`
- `supabase/functions/portal-user-management/handlers/upsert-gestor-user.test.ts`
- `supabase/migrations/20260925150000_read_responsavel_identity_via_service_rpc.sql`
- `supabase/tests/responsavel_identity_service_roles.rollback.sql`

Total: 25 arquivos.

## Validação e aplicação

- Regressão confirm-partner-email: três cenários falhavam antes do patch; passaram depois. CPF/e-mail incompatível, falha de consulta e auditoria continuam bloqueando a ação.
- Suíte portal-user-management: 207 testes passaram, incluindo validação de e-mail, senha temporária, compartilhamento de identidade, conflitos e auditoria.
- Migration local 20260925150000 aplicada como 20260925144455. Na mesma transação, fixtures sintéticas sob savepoint exercitaram papéis efetivos service_role, anon e authenticated: leitura direta negada, RPC mínima funcionando, filtro por UID, parâmetro nulo recusado, guarda interna e EXECUTE de clientes negados. Fixtures revertidas; zero contas sintéticas persistidas.
- Edge portal-user-management v36 ativa, verify_jwt preservado. Somente três arquivos do bundle alterados; comparação dos 39 arquivos com o bundle enviado aprovada.
- Pedido individual: vínculo cadastro/login/Auth consistente, mas validação administrativa ainda pendente. Conexão MCP de consulta opera como supabase_read_only_user e não possui EXECUTE na RPC de validação. Não usar migration, troca de papel ou endpoint auxiliar para contornar essa restrição. Sem login, conforme instrução do usuário.
- Smoke autenticado pendente de acionamento pelo gestor; teste interno não substitui essa execução.
