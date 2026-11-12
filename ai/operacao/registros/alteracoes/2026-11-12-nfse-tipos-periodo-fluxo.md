# NFS-e: tipos, período e fluxo de serviços

## Escopo técnico
- Tipos explícitos de modelo Alunos, Serviços e Ambos, com validação contextual de variáveis.
- Período selecionável por lançamento de serviço, independente da competência fiscal.
- Emissão explícita com progresso, confirmação canônica e proteção contra reenvio incerto.
- Projeção de serviços pendentes separada dos documentos autorizados.
- Cache compartilhado e sincronização por eventos; métricas de execução sem dados fiscais.
- Classificação administrativa por parâmetros, com versão esperada, escopo e auditoria privada.
- Processamento central em segundo plano não faz parte desta entrega.

## Verificação de código
- Tipagem, build e verificações de tamanho de arquivos aprovados.
- Testes sintéticos de contratos, SQL, interface, concorrência e sincronização.
- Testes não emitem nem cancelam documentos fiscais reais.
- A validação visual autenticada não é substituída por testes sintéticos.

## Manifesto explícito
Total: 52 arquivos
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-tipos-periodo-fluxo.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-05-versao-4-8-246.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/cancelamento/NfseCancellationModels.interaction.test.mjs`
- `modules/gestor/emissor-nfse/cancelamento/NfseCancellationTemplatePicker.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseCancellationRetry.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.tsx`
- `modules/gestor/emissor-nfse/individual/NfseIndividualCancellation.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseEmissionModelsSection.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelDescriptionEditor.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/NfseModelDescriptionEditor.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelServiceFields.tsx`
- `modules/gestor/emissor-nfse/modelos/nfse-description-variables.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-type.test.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-type.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.tsx`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerServices.ts`
- `modules/gestor/emissor-nfse/parceiros/nfse-service-period.test.ts`
- `modules/gestor/emissor-nfse/parceiros/nfse-service-period.ts`
- `modules/gestor/emissor-nfse/parceiros/realtime/useNfsePartnerServicesRealtime.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.test.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/types/nfse-partner-services.types.ts`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/realtime/nfse-services-multiuser.test.mjs`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `supabase/functions/nfse-national-individual/execution-observation.test.ts`
- `supabase/functions/nfse-national-individual/execution-observation.ts`
- `supabase/functions/nfse-national-individual/runtime.ts`
- `supabase/migrations/20261112203000_nfse_model_period_contract.sql`
- `supabase/migrations/20261112203001_nfse_model_type_save.sql`
- `supabase/migrations/20261112203002_nfse_model_type_guards.sql`
- `supabase/migrations/20261112203003_nfse_service_period_prepare.sql`
- `supabase/migrations/20261112203004_nfse_known_model_classification.sql`
- `supabase/migrations/20261112203005_nfse_services_pending_partition.sql`
- `supabase/tests/nfse-model-flow.integration.test.mjs`
- `supabase/tests/nfse-model-type-period.isolated.test.mjs`
- `supabase/tests/nfse_partner_service_removal.isolated.test.mjs`
