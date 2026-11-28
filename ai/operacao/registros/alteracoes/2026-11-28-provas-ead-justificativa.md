# Justificativa da antecipação de Provas EAD

Data de trabalho · 28/11/2026

A interface e a RPC aceitam de 5 a 500 caracteres. A restrição da tabela exigia 10 e rejeitava justificativas válidas depois da confirmação. A migration substitui apenas a restrição, preservando o motivo sem espaços nas pontas e a trilha de auditoria.

O teste isolado reproduz a falha com 5 caracteres e confere a rejeição de 4 no banco e na RPC. Também confere o registro e a repetição idempotente da antecipação.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-28-provas-ead-justificativa.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-12-versao-4-8-306.md`
- `internal/versioning/system-version.json`
- `supabase/migrations/20261128134500_fix_ead_quiz_early_release_reason_minimum.sql`
- `supabase/tests/secretaria_ead_quiz_wait.isolated.test.mjs`

Total de 8 arquivos.
