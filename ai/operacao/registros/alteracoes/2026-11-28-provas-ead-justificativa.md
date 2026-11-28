# Período previsto dos certificados e antecipação de provas EAD

Data de trabalho · 28/11/2026

Os certificados EAD apresentam o período previsto desde a data da matrícula até sete dias depois, no calendário de Sergipe. A conclusão registrada, a expedição e o código de autenticação permanecem campos da emissão original.

A reemissão iniciada no lote anterior foi interrompida após três operações. A migration de restauração devolveu os três códigos originais a seus certificados e arquivou os substitutos. Conservou os snapshots, a conclusão e a expedição originais, com registro da sessão técnica. O Supabase registrou a restauração na versão `20261128133816`. Em conferência posterior, os 35 códigos originais estavam ativos e entregáveis.

A restrição da justificativa de antecipação acompanha os 5 a 500 caracteres aceitos pela Secretaria. O teste cobre a rejeição com quatro caracteres e a gravação com cinco.

## Manifesto explícito

- `.github/workflows/ead-trust-access.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-28-provas-e-certificados-ead.md`
- `ai/operacao/registros/alteracoes/2026-11-28-provas-ead-justificativa.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-12-versao-4-8-306.md`
- `internal/versioning/system-version.json`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaElementProperties.tsx`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaPreview.tsx`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/diploma-preview.blocks.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/diploma-preview.model.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/components/diploma-preview.normalization.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts`
- `modules/gestor/secretaria/certificados/SecretariaCertificadosPage.tsx`
- `modules/gestor/secretaria/certificados/certificados.queries.ts`
- `modules/gestor/secretaria/certificados/certificados.service.ts`
- `modules/gestor/secretaria/certificados/certificados.types.ts`
- `modules/gestor/secretaria/certificados/components/EadCertificateBlock.tsx`
- `modules/gestor/secretaria/certificados/components/certificado-preview.utils.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-template.test.mjs`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.test.mjs`
- `supabase/migrations/20261128134500_fix_ead_quiz_early_release_reason_minimum.sql`
- `supabase/migrations/20261128134600_label_ead_certificate_enrollment_period.sql`
- `supabase/migrations/20261128134610_restore_original_ead_certificate_codes.sql`
- `supabase/tests/ead_certificate_code_restoration.isolated.test.mjs`
- `supabase/tests/secretaria_ead_quiz_wait.isolated.test.mjs`

Total: 28 arquivos.

## Arquivo removido

- `modules/gestor/secretaria/certificados/components/EadCertificatePeriodCorrection.tsx` foi retirado junto com o fluxo de reemissão pela interface.
