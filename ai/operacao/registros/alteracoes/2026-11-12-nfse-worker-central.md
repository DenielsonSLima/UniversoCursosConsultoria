# NFS-e: reconciliação central de operações submetidas

## Objetivo e limite
Acompanhar autorização e cancelamento sem depender de sessão/tela aberta. Não prepara, assina, emite, cancela nem repete POST fiscal. Consultas ao próprio documento/evento usam transporte GET-only, validação de identidade e XML.

## Segurança e operação
- Fila durável e lease CAS, com SKIP LOCKED e limitação por polo; prova terminal não regride.
- Certificado atual derivado do emitente/polo da operação, sem impersonar usuário.
- Gateway mantém verify_jwt=true, JWT anon do próprio projeto em Vault e token específico obrigatório no handler.
- Ausência de certificado/configuração: retry conservador de 900 segundos; prova inválida: bloqueio para investigação.
- Scheduler e cron de recuperação de 1 minuto desativados por padrão até implantação e smoke autenticado técnico.
- Nenhuma alteração em recebíveis, pagamentos, origem ou histórico fiscal.

## Verificações
Deno check e 8 testes passaram. PostgreSQL 17 real validou material/prova, scheduler e claims concorrentes. Testes negativos de JWT e XML passaram. Revisão independente de segurança aprovada. Corrida extra de prova após bloqueio fiscal passou em PostgreSQL 17 real (expiração, rotação de lease e terminal concorrente). CI completo ainda exige versão e integração após 316. Não houve ação fiscal real.

## Limitações de entrega
Release precisa integrar após 4.8.316, passar todos os gates e implantar endpoint antes de ativar. O JWT anon do gateway ainda precisa configuração somente em Vault. Não afirmar background ativo antes de verificar implantação, cron e controle. O relay não entrega Retry-After; HTTP 429 usa espera conservadora de 300 segundos.

## Manifesto explícito
Total: 26 arquivos
- `.github/workflows/nfse-worker-security.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/planejamentos/2026-11-12-nfse-worker-central.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-worker-central.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/functions/nfse-reconciliation-worker/executor.ts`
- `supabase/functions/nfse-reconciliation-worker/handler.test.ts`
- `supabase/functions/nfse-reconciliation-worker/handler.ts`
- `supabase/functions/nfse-reconciliation-worker/index.ts`
- `supabase/functions/nfse-reconciliation-worker/read-only-transport.test.ts`
- `supabase/functions/nfse-reconciliation-worker/read-only-transport.ts`
- `supabase/functions/nfse-reconciliation-worker/worker.test.ts`
- `supabase/functions/nfse-reconciliation-worker/worker.ts`
- `supabase/migrations/20261112220000_nfse_reconciliation_queue.sql`
- `supabase/migrations/20261112220100_nfse_reconciliation_material.sql`
- `supabase/migrations/20261112220200_nfse_reconciliation_proof.sql`
- `supabase/migrations/20261112220300_nfse_reconciliation_scheduler.sql`
- `supabase/tests/nfse-reconciliation-fixture.mjs`
- `supabase/tests/nfse-reconciliation-material-proof.isolated.test.mjs`
- `supabase/tests/nfse-reconciliation-proof.concurrent.test.mjs`
- `supabase/tests/nfse-reconciliation-queue.isolated.test.mjs`
- `supabase/tests/nfse-reconciliation-scheduler.isolated.test.mjs`
- `supabase/tests/nfse-worker-postgres-adapter.mjs`
- `supabase/tests/nfse-worker-postgres-concurrency.test.mjs`
