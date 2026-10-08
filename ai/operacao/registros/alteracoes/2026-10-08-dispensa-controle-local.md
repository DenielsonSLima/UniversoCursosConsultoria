# Dispensa LOCAL após reversão de baixa de controle

## Objetivo e contrato

Candidato 4.8.182/revisão 191, baseado na 4.8.181.
Prova estrita para dispensa LOCAL após reversão auditada de uma baixa de controle, preservando histórico e guardas canônicas.
Templates genéricos sem dados reais permanecem em review-drafts, fora das migrations automáticas. Nenhum novo grant, emissão automática ou alteração de infraestrutura.
Este registro não declara implantação nem execução financeira concluídas.

## Manifesto explícito

- `.github/workflows/fee-control-waiver.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-08-dispensa-controle-local.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/review-drafts/fee-control-waiver/01_reversed_control_waiver_proof.sql`
- `supabase/review-drafts/fee-control-waiver/02_oneoff_control_reversal.template.sql`
- `supabase/review-drafts/fee-control-waiver/tests/fee-postgres-concurrency.mjs`
- `supabase/review-drafts/fee-control-waiver/tests/fee-reversal-setup.mjs`
- `supabase/review-drafts/fee-control-waiver/tests/fixture-paths.mjs`
- `supabase/review-drafts/fee-control-waiver/tests/fixtures/canonical-fee-ledger.sql`
- `supabase/review-drafts/fee-control-waiver/tests/fixtures/canonical-fee-reversal.sql`
- `supabase/review-drafts/fee-control-waiver/tests/fixtures/canonical-ordinary-reversal.sql`
- `supabase/review-drafts/fee-control-waiver/tests/single-fee-reversal.test.mjs`

Total: 15 arquivos.

## Validação e limites

- Revisão independente aprovou condicionalmente a publicação do candidato sintético em PR de rascunho.
- Regressão local final: 23 testes aprovados, zero falhas; definições canônicas preservadas.
- Seis casos de concorrência PostgreSQL preparados e verificados sintaticamente; execução real isolada pendente de CI.
- Testes usam somente dados sintéticos; conferir CI do commit exato antes de qualquer conclusão de validação remota.
- Aplicação exige autorização específica; após aplicação, preservar bytes e versões reais no histórico canônico.
- Não versionar entradas renderizadas, identidades, aprovações privadas, snapshots ou resultados financeiros reais.
