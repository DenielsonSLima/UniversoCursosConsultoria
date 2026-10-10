# Proesc V2: payload compartilhado em candidato de revisão

Versão candidata: 4.8.197-rc.1. Base atual: 971c09242774316a364b9b63ccdb543dd8d30910.
Branch: review/proesc-v2-payload-20261009. Estado: reaproveitamento ON autorizado; adapter Storage somente sintético.

## Objetivo e limites

Reduzir cópias futuras de JSON de invoice sem remover observações, runs, FKs,
snapshots ou evidência financeira. Migration atômica preparada na pasta canônica,
instalada em OFF em 09/10; vínculos validados e ON autorizado em 10/10. Arquivo recuperável é protótipo local com dados sintéticos.
Não altera frequência, pagamentos, saldos, emissão nem histórico.
Preserva integralmente o lote paralelo do extrato Banese publicado em main 4.8.196.

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
- `supabase/review-drafts/proesc-v2-growth/05_copy_only_catalog.draft.sql`
- `supabase/review-drafts/proesc-v2-growth/COPY-ONLY.md`
- `supabase/review-drafts/proesc-v2-growth/INDEPENDENT_REVIEW.md`
- `supabase/review-drafts/proesc-v2-growth/INSTALLATION.md`
- `supabase/review-drafts/proesc-v2-growth/MANIFEST.json`
- `supabase/review-drafts/proesc-v2-growth/PREFLIGHT.md`
- `supabase/review-drafts/proesc-v2-growth/README.md`
- `supabase/review-drafts/proesc-v2-growth/archive/README.md`
- `supabase/review-drafts/proesc-v2-growth/archive/STORAGE-PREPARATION.md`
- `supabase/review-drafts/proesc-v2-growth/archive/V2-COPY.md`
- `supabase/review-drafts/proesc-v2-growth/archive/archive.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/archive.test.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/local-store.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/storage-http-fixture.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/storage-transfer.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/storage-transfer.test.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/supabase-store.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/supabase-store.test.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/v2-copy-codec.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/v2-copy-codec.test.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/v2-copy-fixture.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/v2-copy-local-store.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/v2-copy-transfer.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/v2-copy-transfer.test.mjs`
- `supabase/review-drafts/proesc-v2-growth/archive/v2-copy-worker.mjs`
- `supabase/review-drafts/proesc-v2-growth/ci/postgres17-concurrency.mjs`
- `supabase/review-drafts/proesc-v2-growth/ci/postgres17-copy-concurrency.mjs`
- `supabase/review-drafts/proesc-v2-growth/ci/postgres17.workflow.yml.disabled`
- `supabase/tests/fixtures/proesc-v2-copy.fixture.mjs`
- `supabase/tests/fixtures/proesc-v2-growth.caixa.fixture.mjs`
- `supabase/tests/fixtures/proesc-v2-growth.fixture.mjs`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_caixa_review_authorizer.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_caixa_review_reader.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_confirm_portal_payment.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_snapshot_triggers.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_v2_apply_invoice.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_v2_calculated_composition_candidate.sql`
- `supabase/tests/fixtures/proesc-v2-growth/fixture_v2_net_discount_candidate.sql`
- `supabase/tests/proesc_v2_copy_adversarial.isolated.test.mjs`
- `supabase/tests/proesc_v2_copy_catalog.isolated.test.mjs`
- `supabase/tests/proesc_v2_copy_transfer.isolated.test.mjs`
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

Total: 66 arquivos.

## Validação e publicação

- Testes locais: SQL real isolado em PGlite, paridade financeira e arquivo sintético.
- Teto local: todos os arquivos do manifesto com até 500 linhas.
- CI: PostgreSQL 17/pgcrypto, bloqueio observado por pg_blocking_pids, replay e WAL.
- Repositório completo: versionamento, linhas, TypeScript, lint, testes e build.
- Os resultados remotos devem ser conferidos no SHA exato; aprovação local não
  substitui CI. Instalação autorizada registrada em INSTALLATION.md; ON autorizado em 10/10.
- Histórico do changelog 4.8.113–4.8.115 realocado sem alterar suas entradas para
  manter o arquivo ativo abaixo de 500 linhas. Nenhuma migration antiga mudou.
- Registro fora das fontes RAG: não adiciona código ou dados pessoais ao índice.

## Próxima autorização

Merge e Storage real dependem de autorização posterior e aceite dos checks. OFF volta à escrita legada, preservando leitores e payloads já referidos.
Storage real, política financeira, backups de objetos e remoção não fazem parte
desta autorização. Arquivos não são enviados a serviços de produção.

## Instalação autorizada

Migrations 20261009224423 e 20261009224508 aplicadas em 09/10; OFF e vínculos validados naquele marco.
Nome canônico da instalação conciliado com a versão remota, sem alterar bytes.
Recibo, hashes, revisão independente e limites em `INSTALLATION.md` do pacote.

## Preparação Storage de 10/10

Adapter privado e ponte de upload/readback/restore preparados em Node, com HTTP
simulado, credenciais fictícias, destino estrito e cleanup=false. Não há integração
com o banco, credencial real, bucket real ou publicação do serviço em produção.
A ativação do reaproveitamento foi autorizada separadamente; o FULL natural
permanece em acompanhamento e pode levar horas, sem execução manual extra.

## Candidato conciliado de 10/10

Main avançou para 971c0924, versão 4.8.196, com o lote paralelo do extrato Banese.
A árvore atual de main é preservada e recebe somente este manifesto. O commit
usa como pais RC.4 e main, apenas na branch de revisão; não mescla o PR.
Changelog e índice de manifestos conciliados sem perder entradas. A entrada
4.8.113 permanece no arquivo canônico já criado pelo lote paralelo, sem duplicação.

O candidato 4.8.197-rc.1 inclui manifesto gzip de 4 MiB, exportação limitada a
100 IDs/1 MiB por plano aprovado, catálogo privado append-only e worker copy-only.
Os dois grants de RPC service_role são apenas draft e exigirão instalação
especificamente autorizada. Nenhum worker V1 ou limpeza é reutilizado.

Validação local: 80 testes de arquivo/HTTP e três suítes copy-only, incluindo
integração SQL→HTTP mock→catálogo→restore. Onze suítes de payload preservadas.
Revisão independente confirmou os testes e corrigiu leitores, limites de decoder,
mutação de entradas e vínculo de nomes/hashes. O CI nativo novo testa seis
corridas copy-only, mas depende do SHA exato publicado. Não confundir fixture
com homologação do Storage, permissões, quota ou endpoint real.
