# Endereço consistente na emissão NFS-e

Causa: número ausente no parceiro e snapshots PREVIEWED históricos; pagamento não era a causa confirmada. Fonte Proesc histórica sem número recuperável.

Escopo: número obrigatório nos novos cadastros; backfill autorizado 00 provisório, auditado e reversível sob comparação de versão. 439 corrigidos,46 números existentes preservados. Não afirmar endereço real recuperado nem liberação irrestrita:23 cadastros tinham outras lacunas.

Refresh: somente número, PREVIEWED sem material assinado; mesma operação/request/DPS. Link original imutável e journal append-only. Alterações em valor,identidade,modelo,datas ou demais campos falham fechadas. Worker antigo é rejeitado antes de PREPARE.

UX: diagnóstico específico de CEP/logradouro/número/bairro; preparação automática distingue pronta e dados pendentes. Sem supressão de validação fiscal.

Validação local:288 contratos,4 testes DOM,7 SQL refresh e cadastro/auditoria/rollback isolados; TypeScript e lint focados sem erros. Migrations de número e refresh aplicadas via MCP;9 PREVIEWED inalteradas, journal vazio. CI/deploy registrados na PR. Sem transmissão fiscal; smoke Safari autenticado pendente. Concorrência isolada serializada, não PostgreSQL multi-conexão.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-endereco-consistente.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-27-versao-4-8-240.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-operation.contract.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.ts`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepContact.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/parceiro-aluno-form.navigation.test.mjs`
- `supabase/functions/nfse-national-individual/adapter-government.test.ts`
- `supabase/functions/nfse-national-individual/adapter.ts`
- `supabase/functions/nfse-national-individual/recipient-address.test.ts`
- `supabase/functions/nfse-national-individual/recipient-address.ts`
- `supabase/migrations/20261112151657_student_address_number_required.sql`
- `supabase/migrations/20261112152151_nfse_unsigned_address_refresh_store.sql`
- `supabase/migrations/20261112152203_nfse_unsigned_address_refresh_preview.sql`
- `supabase/migrations/20261112152213_nfse_unsigned_address_refresh_bridge.sql`
- `supabase/operations/student_address_number_backfill.sql`
- `supabase/operations/student_address_number_rollback.sql`
- `supabase/tests/nfse_unsigned_address_refresh.isolated.test.mjs`
- `supabase/tests/student_address_number.pglite.mjs`

Total: 31 arquivos
