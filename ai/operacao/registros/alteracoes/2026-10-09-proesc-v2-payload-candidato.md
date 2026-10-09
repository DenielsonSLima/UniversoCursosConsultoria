# Proesc V2: payload compartilhado em candidato de revisão

Versão candidata: 4.8.196-rc.4. Base: 3886e6b0e12e45001f5a7bf2858965b4d8d4307d.
Branch: review/proesc-v2-payload-20261009. Estado: instalação e validação concluídas; escrita canônica OFF.

## Objetivo e limites

Reduzir cópias futuras de JSON de invoice sem remover observações, runs, FKs,
snapshots ou evidência financeira. Migration atômica preparada na pasta canônica,
aplicada com flag false; vínculos validados. Arquivo recuperável é protótipo local com dados sintéticos.
Não altera frequência, pagamentos, saldos, emissão nem histórico.
Preserva o lote ativo paralelo de matrícula principal e suas alterações.

## Aceite e risco

Paridade financeira, hashes legados e A→B→A; isolamento por unidade/invoice;
replay idempotente, rollback, catálogo fail-closed, pgcrypto e concorrência real.
Revisão RC.3: dez suítes SQL locais e 16 testes de arquivo aprovados.
Preflight encontrou leitor adicional do Caixa, cadastrado por assinatura/hash.
CI novo roda PostgreSQL 17 descartável; qualidade completa usa o head exato.
Observações leves, snapshots OPEN e pessoas continuam crescendo.
Medição WAL de uma janela não comprova economia OFF/ON nem taxa de produção.

## Manifesto explícito

- `.github/workflows/proesc-v2-payload.yml`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-proesc-v2-payload-candidato.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-27-versoes-4-8-113-a-4-8-115.md`
- `internal/versioning/changelog/2026-10-09-proesc-v2-candidatos-rc1-a-rc3.md`
- `internal/versioning/system-version.json`
- `supabase/migrations/20261009224423_prepare_proesc_v2_payload_storage_off.sql`
- `supabase/migrations/20261009224508_validate_proesc_v2_payload_constraints_off.sql`
- `supabase/review-drafts/proesc-v2-growth/01_payload_storage.draft.sql`
- `supabase/review-drafts/proesc-v2-growth/02_payload_readers.draft.sql`
- `supabase/review-drafts/proesc-v2-growth/03_payload_writer.draft.sql`
- `supabase/review-drafts/proesc-v2-growth/04_payload_activation_gate.draft.sql`
- `supabase/review-drafts/proesc-v2-growth/INDEPENDENT_REVIEW.md`
- `supabase/review-drafts/proesc-v2-growth/INSTALLATION.md`
- `supabase/review-drafts/proesc-v2-growth/MANIFEST.json`
- `supabase/review-drafts/proesc-v2-growth/PREFLIGHT.md`
- `supabase/review-drafts/proesc-v2-growth/README.md`
- `supabase/review-drafts/proesc-v2-growth/archive/README.md`
- `supabase/review-drafts/proesc-v2-growth/archive/archive.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/archive.test.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/local-store.mjs`
- `supabase/review-drafts/proesc-v2-growth/ci/postgres17-concurrency.mjs`
- `supabase/review-drafts/proesc-v2-growth/ci/postgres17.workflow.yml.disabled`
- `supabase/tests/fixtures/proesc-v2-growth.caixa.fixture.mjs`
- `supabase/tests/fixtures/proesc-v2-growth.fixture.mjs`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_caixa_review_authorizer.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_caixa_review_reader.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_confirm_portal_payment.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_snapshot_triggers.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_v2_apply_invoice.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_v2_calculated_composition_candidate.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_v2_net_discount_candidate.sql`
- `supabase/tests/proesc_v2_payload_adversarial.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_caixa.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_catalog.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_composition.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_migration.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_portal.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_reader_gate.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_scale.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_storage.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_validation.isolated.test.mjs`
- `supabase/tests/proesc_v2_payload_writer.isolated.test.mjs`

Total: 45 arquivos.

## Validação e publicação

- Testes locais: SQL real isolado em PGlite, paridade financeira e arquivo sintético.
- Teto local: todos os arquivos do manifesto com até 500 linhas.
- CI: PostgreSQL 17/pgcrypto, bloqueio observado por pg_blocking_pids, replay e WAL.
- Repositório completo: versionamento, linhas, TypeScript, lint, testes e build.
- Os resultados remotos devem ser conferidos no SHA exato; aprovação local não
  substitui CI. Instalação autorizada registrada em INSTALLATION.md; sem ativação.
- Histórico do changelog 4.8.113–4.8.115 realocado sem alterar suas entradas para
  manter o arquivo ativo abaixo de 500 linhas. Nenhuma migration antiga mudou.
- Registro fora das fontes RAG: não adiciona código ou dados pessoais ao índice.

## Próxima autorização

Merge e ativação dependem de autorização posterior e aceite dos checks. OFF volta à escrita legada, preservando leitores e payloads já referidos.
Storage real, política financeira, backups de objetos e remoção não fazem parte
desta autorização. Arquivos não são enviados a serviços de produção.

## Instalação autorizada

Migrations 20261009224423 e 20261009224508 aplicadas; OFF e vínculos validados.
Nome canônico da instalação conciliado com a versão remota, sem alterar bytes.
Recibo, hashes, revisão independente e limites em `INSTALLATION.md` do pacote.
