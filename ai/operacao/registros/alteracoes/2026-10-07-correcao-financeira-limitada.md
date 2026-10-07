# Correção financeira limitada com histórico preservado

## Objetivo e contrato

Versão candidata: 4.8.181, baseada no main 4.8.180.
Atualização do registro em 2026-10-07: 14 migrations de implementação e uma migration de sete grants aprovados instaladas; worker de recuperação v12 e emissor v10 ativos. Execução financeira dos 49 títulos ainda pendente.
Preservar obrigações e runs originais; exigir prova de cancelamento bancário antes do ajuste interno; exigir novo consentimento real e emissão manual.
O C2 histórico cancelado não pode ser retomado. Após C1 corrigido completo sem C2 cancelado, a continuidade volta às regras canônicas e ao aviso explícito existente.

## Implementação

- Dois registros privados de operação/itens, com manifestos e snapshots imutáveis; reutilização de jobs/arquivo bancário e auditoria existentes.
- Worker limitado ao cancelamento aprovado, com pagamento/proveniência, lease, intenção durável e retomada somente GET após ambiguidade; retorno sem reemissão.
- Ajuste interno atômico preserva IDs e histórico; dispensa LOCAL exige prova específica de nunca pago, enquanto histórico pago permanece intacto e distinto.
- Prévia canônica completa, novo consentimento do usuário atual, chaves novas por recebível e proteção contra replay por outro ator.
- Correção de elegibilidade LOCAL é limitada à prova de dispensa finalizada; não aceita CANCELADO genérico nem altera proteções acadêmicas/importadas.
- UI preserva confirmação do C2, bloqueios, cancelamento, respostas tardias, clique repetido e retomada após fechar/reabrir.
- SQL aplicado preservado byte a byte em `supabase/migrations`, com versões e ordem reais do histórico remoto; drafts de revisão mantidos como fonte dos testes isolados.
- Comentários originais de revisão/proposta não são reescritos em migrations já aplicadas; a instalação é registrada aqui e no histórico remoto.

## Manifesto explícito

- `.github/workflows/bounded-financial-correction.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-07-correcao-financeira-limitada.md`
- `docs/reviews/bounded-financial-correction.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroBoundedCorrectionDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroBoundedCorrectionStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroLocalWaiverHistory.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/bounded-correction.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/bounded-correction.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-destination.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `scripts/test-bounded-financial-correction.mjs`
- `supabase/functions/technical-financial-correction/bank.ts`
- `supabase/functions/technical-financial-correction/processor.ts`
- `supabase/functions/technical-financial-correction/request.ts`
- `supabase/functions/technical-financial-correction/store.ts`
- `supabase/functions/technical-financial-correction/worker-action.ts`
- `supabase/functions/technical-manual-cycle-issuance/bounded-correction-context.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.ts`
- `supabase/functions/technical-manual-cycle-issuance/dependencies.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/index.ts`
- `supabase/migrations/20261007231109_bounded_financial_correction_storage.sql`
- `supabase/migrations/20261007231128_bounded_financial_correction_source_guards.sql`
- `supabase/migrations/20261007231210_bounded_financial_correction_approval.sql`
- `supabase/migrations/20261007231222_bounded_financial_correction_bank_service.sql`
- `supabase/migrations/20261007231230_bounded_financial_correction_bank_evidence.sql`
- `supabase/migrations/20261007231257_bounded_financial_correction_reset_proofs.sql`
- `supabase/migrations/20261007231308_bounded_financial_correction_finalize.sql`
- `supabase/migrations/20261007231319_bounded_financial_correction_finalized_proofs.sql`
- `supabase/migrations/20261007231333_bounded_financial_correction_projection.sql`
- `supabase/migrations/20261007231344_bounded_financial_correction_consent.sql`
- `supabase/migrations/20261007231356_bounded_financial_correction_fences_dispatch.sql`
- `supabase/migrations/20261007231414_bounded_financial_correction_canonical_adapters.sql`
- `supabase/migrations/20261007231425_bounded_financial_correction_local_waiver_projection.sql`
- `supabase/migrations/20261007231438_bounded_financial_correction_native_eligibility.sql`
- `supabase/migrations/20261007231549_bounded_financial_correction_approved_runtime_grants.sql`
- `supabase/review-drafts/bounded-financial-correction/01_bounded_storage.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/02_bounded_guards.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/03_bounded_approval.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/04_bounded_service.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/05_bounded_bank_evidence.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/06_bounded_reset_proofs.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/07_bounded_canonical_adapters.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/08_bounded_finalize.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/09_bounded_finalized_proofs.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/10_bounded_projection.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/11_bounded_consent.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/12_bounded_local_waiver_projection.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/13_bounded_fences_dispatch.draft.sql`
- `supabase/review-drafts/bounded-financial-correction/14_exact_local_waiver_native_eligibility.draft.sql`
- `supabase/tests/bounded-bank-store.test.mjs`
- `supabase/tests/bounded-base.fixture.sql`
- `supabase/tests/bounded-draft-paths.mjs`
- `supabase/tests/bounded-eligibility-setup.mjs`
- `supabase/tests/bounded-eligibility.test.mjs`
- `supabase/tests/bounded-export-preview.mjs`
- `supabase/tests/bounded-integration-setup.mjs`
- `supabase/tests/bounded-integration.test.mjs`
- `supabase/tests/bounded-postgres-concurrency.mjs`
- `supabase/tests/bounded-seed.mjs`
- `supabase/tests/bounded-source.fixture.sql`
- `supabase/tests/financial-correction-processor.test.ts`
- `supabase/tests/financial-correction-store.test.ts`
- `supabase/tests/financial-correction-worker-auth.test.ts`
- `supabase/tests/fixtures/baseline-assert_manual_cycle_reviewed_receivable.sql`
- `supabase/tests/fixtures/baseline-enforce_receivable_gateway_submission_fence.sql`
- `supabase/tests/fixtures/baseline-guard_manual_cycle_reviewed_identity.sql`
- `supabase/tests/fixtures/baseline-manual_cycle_issuance_progress.sql`
- `supabase/tests/fixtures/baseline-manual_cycle_local_fee_summary.sql`
- `supabase/tests/fixtures/baseline-manual_cycle_local_receivable_complete.sql`
- `supabase/tests/fixtures/baseline-technical_manual_cycle_state.sql`
- `supabase/tests/fixtures/bounded-integration-columns.sql`
- `supabase/tests/fixtures/bounded-integration-network.sql`
- `supabase/tests/fixtures/bounded-integration-reissue-guards.sql`
- `supabase/tests/fixtures/bounded-integration-reissue-schema.sql`
- `supabase/tests/fixtures/bounded-integration-security.sql`
- `supabase/tests/fixtures/canonical-atomic-and-queue.sql`
- `supabase/tests/fixtures/canonical-authorize_technical_manual_receivable_issuance_secure.sql`
- `supabase/tests/fixtures/canonical-canceled-number-reuse.sql`
- `supabase/tests/fixtures/canonical-expected-terms.sql`
- `supabase/tests/fixtures/canonical-guard_manual_technical_receivable_first_bank_claim.sql`
- `supabase/tests/fixtures/canonical-guard_technical_receivable_policy_snapshot.sql`
- `supabase/tests/fixtures/canonical-issuance-fingerprint.sql`
- `supabase/tests/fixtures/canonical-local-intent.sql`
- `supabase/tests/fixtures/canonical-persist-issuance.sql`
- `supabase/tests/fixtures/canonical-receivable-triggers.sql`
- `supabase/tests/fixtures/canonical-reissue-bypass.sql`
- `supabase/tests/fixtures/canonical-reissue-helpers.sql`
- `supabase/tests/fixtures/canonical-reviewed-receivable.sql`
- `supabase/tests/fixtures/canonical-settlement-evidence.sql`
- `supabase/tests/fixtures/canonical-technical_manual_banese_receivable_complete.sql`
- `supabase/tests/fixtures/canonical-technical_manual_banese_receivable_paid_issued.sql`
- `supabase/tests/fixtures/canonical-transaction-guards.sql`
- `supabase/tests/fixtures/eligibility-data_vencimento_mensal.sql`
- `supabase/tests/fixtures/eligibility-enrollment_cycle_manifest_hash.sql`
- `supabase/tests/fixtures/eligibility-enrollment_financial_block.sql`
- `supabase/tests/fixtures/eligibility-enrollment_financial_block_before_individual_admission.sql`
- `supabase/tests/fixtures/eligibility-has_confirmed_first_cycle_only.sql`
- `supabase/tests/fixtures/eligibility-individual_cycle_policy_fingerprint.sql`
- `supabase/tests/fixtures/eligibility-individual_cycle_policy_fingerprint_before_durable_facts.sql`
- `supabase/tests/fixtures/eligibility-is_manual_technical_enrollment.sql`
- `supabase/tests/fixtures/eligibility-person_document_hash.sql`
- `supabase/tests/fixtures/eligibility-schema.sql`
- `supabase/tests/fixtures/eligibility-technical_cycle_history_outside_enrollment.sql`
- `supabase/tests/fixtures/eligibility-technical_imported_banese_cycle_is_durable.sql`
- `supabase/tests/fixtures/eligibility-technical_imported_cycle_exists.sql`
- `supabase/tests/fixtures/eligibility-technical_imported_cycle_fact_state.sql`
- `supabase/tests/fixtures/eligibility-technical_imported_cycle_generation_permitted.sql`
- `supabase/tests/fixtures/eligibility-technical_imported_cycle_has_confirmed.sql`
- `supabase/tests/fixtures/eligibility-technical_imported_cycle_has_conflict.sql`
- `supabase/tests/fixtures/eligibility-technical_imported_cycle_identity_context.sql`
- `supabase/tests/fixtures/eligibility-technical_local_cycle_eligible.sql`
- `supabase/tests/fixtures/eligibility-technical_local_cycle_eligible_before_internal_transfer.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_due_from_last_boleto.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_policy_projection.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_durable_imported_history.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_external_history.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_individual_admission.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_internal_transfer.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_local_fee.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_proesc_coverage.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_proesc_scopes.sql`
- `supabase/tests/fixtures/eligibility-technical_manual_cycle_state_before_transfer_entry.sql`
- `tests/bounded-correction.contract.test.mjs`
- `tests/bounded-correction.dependencies.test.mjs`
- `tests/bounded-correction.fixture.mjs`
- `tests/bounded-correction.interaction.test.mjs`
- `tests/bounded-correction.orchestrator.test.mjs`
- `tests/bounded-local-waiver.contract.test.mjs`
- `tests/check-bounded-correction-sql-preview.mjs`

Total: 139 arquivos.

## Validação e limites

- Dados, usuários, pagadores, retornos bancários e IDs dos testes são sintéticos; nenhum alvo ou snapshot financeiro privado está versionado.
- Base local: 61 testes SQL, 28 verificações de worker/processador e cinco suítes UI/Edge; regressões one-off originais preservadas.
- Dez testes adicionais usam a cadeia real de elegibilidade nativa/importada e persistência canônica das 36 emissões simuladas, incluindo a continuidade C2 após conclusão.
- Saída real de RPC isolada passa pelos parsers de UI/Edge; dispensa, histórico pago, total histórico e total ativo são distintos.
- Novo CI verifica o grafo Deno completo, versão/teto, regressões, SQL/UI e sessões PostgreSQL independentes em serviço efêmero sem credenciais de produção.
- Conferir novamente CI/Preview no commit exato desta atualização. Testes de fixture não equivalem a validação bancária real ou smoke autenticado.
- Smoke Safari autenticado e validação bancária real continuam pendentes e exigem ambiente/ação autorizados.
- Histórico remoto lido por MCP: 14 migrations entre `20261007231109` e `20261007231438`, seguidas dos sete grants aprovados em `20261007231549`; 15 cópias canônicas conferidas byte a byte.
- Estado das Edge Functions conferido por MCP: worker v12 e emissor v10 ativos. A instalação não comprova execução financeira.
- Cancelamento dos 49 títulos e ajuste interno permanecem pendentes. Reemissão não é automática e exige revisão completa e novo consentimento real.
- R$ 200,00 permanecem como pendência separada e não resolvida, sem inferir baixa, estorno ou devolução.
- Não houve emissão/cancelamento real, baixa, estorno, devolução, alteração acadêmica ou comunicação aos alunos.
