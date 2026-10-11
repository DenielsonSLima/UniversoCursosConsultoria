# Identidade e autorização vigente na recuperação do aluno

Revisão crítica de Auth solicitada com três agentes, restrita ao convite e recuperação do aluno. A tela publicada 4.8.209 foi conferida no Safari autenticado. Não houve envio real, redefinição, aceite de termos nem alteração financeira nesta revisão.

## Falhas reproduzidas e correções

- O e-mail podia mudar entre validar o vínculo e generateLink, retornando link de outra conta. A guarda exige user.id igual ao Auth validado e action_link presente antes da escrita ou entrega.
- Revogar status, módulo, perfil herdado ou polo do gestor durante Auth/HTTP ainda permitia escrita e entrega posterior. A RPC service_role revalida ator e escopo, fixa as linhas relevantes e aplica CAS do snapshot na mesma transação do UPDATE. Checkpoint vazio não dispara triggers; patch admite somente oito campos de acesso.
- O estado do handler bloqueia escrita adicional após recusa do ator. Não existe fallback para UPDATE privilegiado quando a RPC está ausente. Revogação responde 403; snapshot/lock conflitante responde 409, sem link manual.
- Se o envio já foi aceito, a resposta mantém inviteSent/recoverySent verdadeiros, sem nova escrita. A transação do banco não permanece aberta durante I/O externo.

## Manifesto explícito

- `supabase/functions/portal-user-management/handlers/send-student-invite.ts`
- `supabase/functions/portal-user-management/handlers/student-recovery-link.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.created-password.test.ts`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`
- `ai/operacao/registros/alteracoes/2026-10-11-recovery-link-identity.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `supabase/migrations/20261011160000_guard_student_invite_actor_cas.sql`
- `supabase/functions/portal-user-management/handlers/student-invite-state.ts`
- `supabase/functions/portal-user-management/handlers/student-invite-failure.ts`
- `supabase/functions/portal-user-management/handlers/student-invite-recovery.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.fixture.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.shared-identity.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.error-sanitization.test.ts`
- `supabase/tests/student_invite_actor.isolated.test.mjs`
- `supabase/tests/fixtures/student-invite-state-harness.mjs`
- `scripts/test-student-email-access.mjs`

- `supabase/tests/student-invite-postgres-concurrency.mjs`
- `supabase/tests/fixtures/student-invite-postgres-harness.mjs`
- `.github/workflows/student-invite-concurrency.yml`

Total: 23 arquivos próprios, compostos sobre a PR304/4.8.210. Boletim e histórico são herdados da base e não pertencem ao delta desta etapa. O cadastro segue em entrega posterior 4.8.212. Migrations aplicadas são imutáveis.

## Validação e entrega

15 casos SQL novos do ator, 11 CAS/trigger existentes, 23 testes Deno de convite/recuperação e oito contratos do primeiro acesso passaram. Lint focado limpo; maior arquivo manual do delta tem 418 linhas. Fronteiras Auth/HTTP controladas e SQL real reproduzem revogação intercalada, ausência de link estrangeiro, entrega já aceita e checkpoint sem UPDATE. A revisão cruzada detectou fixture com autorização antiga; o harness de convite agora carrega a definição vigente 20260822113020 e inclui revogação institucional. Runner CI inclui a suíte nova e o workflow existente o executa. Revisão cruzada e CI do head corrigido ficam na PR305.

## Rollout e limites

- A migration nova 20261011160000 é local e não aplicada. Deve preceder a implantação do handler; RPC ausente falha fechada. Produção depende de autorização e readback de corpos/grants.
- Checkpoint autoriza início do despacho; CAS final autoriza escrita/entrega. Não há atomicidade banco/Auth/HTTP: envio iniciado não pode ser desfeito e persiste a janela entre commit do checkpoint e início da chamada externa.
- Quatorze cenários novos usam PostgreSQL 17 efêmero, três conexões independentes e pg_blocking_pids como barreira real. Cobrem NOWAIT, retenção de locks, revogação antes/depois do checkpoint, releitura após commit, advisory locks, ACL e CAS concorrente. O resultado nativo deve passar no CI do head final; PGlite permanece como teste de contrato, sem alegação de concorrência. Smoke positivo de recuperação real e rollout permanecem pendentes.
- Nenhuma senha, documento pessoal, token ou payload de produção integra este lote. Preview do frontend não valida uma Edge ainda não aplicada.
