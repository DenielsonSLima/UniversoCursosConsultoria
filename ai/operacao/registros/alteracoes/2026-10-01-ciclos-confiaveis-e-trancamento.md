# Ciclos confiáveis e trancamento financeiro

Estado: VALIDADO INTERNAMENTE; aguardando CI, Preview e publicação 4.8.144. Autorização: usuário confirmou correções e cancelamento
Banese de títulos não pagos com vencimento posterior ao trancamento. Nenhuma
emissão de teste autorizada. Publicação somente após validação/revisão do lote.

## Aceite

- T46: a confirmação envia os itens da prévia canônica, inclusive sem editar.
- Matrícula local retroativa permanece pendente sem boleto e sem baixa automática.
- Continuidade importada é individual por matrícula/ciclo e não expira com cache.
- Proesc com ambos os ciclos não gera novas obrigações; UNKNOWN não vira prova.
- Banese importado preserva identidade/proveniência, sem simular emissão nativa.
- Proesc histórico somente consulta, bloqueado também no backend para baixa.
- Trancamento: somente não pagos, sem parcial, vencimento posterior ao corte
  comprovado; cancelamento local só após confirmação bancária. Pagos preservados.
- CANCELADO sai do saldo pendente, mantém histórico; reativação não revive boleto.
- Sem alterar turmas/dados de aluno para forçar elegibilidade; sem POST de teste.

## Frentes

1. Snapshot final de confirmação e regressão do fluxo T46.
2. Fatos duráveis de ciclos importados e migração conservadora de provas.
3. Outbox de cancelamento de trancamento, prévia, guardas e reativação.
4. Coordenação: capabilities, revisão cruzada, validação e publicação por MCP.

## Manifesto explícito

- `supabase/migrations/20261001010000_create_imported_cycle_facts.sql`
- `supabase/migrations/20261001010100_capture_imported_banese_cycle_facts.sql`
- `supabase/migrations/20261001010150_capture_external_cycle_coverage_facts.sql`
- `supabase/migrations/20261001010175_allow_seed_imported_cycle_review.sql`
- `supabase/migrations/20261001010200_apply_imported_cycle_fact_guards.sql`
- `supabase/migrations/20261001010250_allow_imported_banese_c1_continuation.sql`
- `supabase/tests/imported_cycle_facts.rollback.sql`
- `supabase/tests/imported_banese_c1_continuation.rollback.sql`
- `supabase/tests/imported_cycle_facts.contract.test.ts`
- `supabase/tests/imported_cycle_facts_t42.readonly.sql`
- `supabase/tests/imported_cycle_facts_t46.readonly.sql`
- `supabase/migrations/20261001020000_add_trancamento_banese_cancellation_policy.sql`
- `supabase/migrations/20261001020010_project_trancamento_banese_cancellation.sql`
- `supabase/migrations/20261001020020_fence_trancamento_manual_settlement_races.sql`
- `supabase/migrations/20261001020050_preserve_trancamento_during_terminal_movement.sql`
- `supabase/migrations/20261001020100_extend_banese_cancellation_claim_for_trancamento.sql`
- `supabase/migrations/20261001020200_preview_trancamento_financeiro.sql`
- `modules/gestor/gestao/tecnicos/detalhes/trancamento-financeiro.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/trancamento-financeiro.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/trancamento-financeiro.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTrancamentoFinancialPreview.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TrancamentoFinancialPreview.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/MovimentacaoAlunoModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx`
- `supabase/tests/technical_trancamento_banese_cancellation.contract.test.ts`
- `supabase/tests/technical_trancamento_banese_cancellation.rollback.sql`
- `supabase/functions/banese-cancellation-worker/worker.test.ts`
- `modules/gestor/financeiro/financeiro.operation-capabilities.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/financeiro.composition-presentation.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-source-capabilities.test.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-external-history-actions.test.ts`
- `scripts/test-financial-cycle-capabilities.mjs`
- `supabase/migrations/20261001023000_receivable_source_capabilities.sql`
- `supabase/migrations/20261001023050_restore_receivable_cycle_presentation_dependency.sql`
- `supabase/migrations/20261001023075_restore_receivable_projection_wiring.sql`
- `supabase/migrations/20261001023100_project_receivable_operation_capabilities.sql`
- `supabase/tests/receivable_source_capabilities.rollback.sql`
- `supabase/tests/receivable_source_projection.readonly.sql`
- `supabase/tests/manual_cycle_confirmation.readonly.sql`
- `supabase/migrations/20261001013703_dryrun_receivable_source_capabilities_20261001.sql`
- `supabase/migrations/20261001020243_dryrun_receivable_capabilities_replay_20261001.sql`
- `supabase/migrations/20261001021246_dryrun_receivable_projection_wiring_20261001.sql`
- `supabase/migrations/20261001021916_dryrun_imported_cycle_continuation_20261001.sql`
- `supabase/migrations/20261001022836_dryrun_imported_t42_population_20261001.sql`
- `supabase/migrations/20261001023019_dryrun_imported_native_classes_20261001.sql`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-10-01-confirmacao-canonica-ciclo-manual.md`
- `ai/operacao/registros/alteracoes/2026-10-01-ciclos-confiaveis-e-trancamento.md`

- `supabase/migrations/20261001023414_dryrun_trancamento_capabilities_20261001.sql`

Total: 55 arquivos.

## Validação e limites

- T42: aceite transacional das 35 matrículas; 15 passagens C1 comprovadas elegíveis para C2, com bloqueios de C2/conflito preservados.
- T46: fingerprint integral das 6 matrículas idêntico antes/depois do DDL; 4 elegíveis C1 e 2 elegíveis C2; nenhuma contaminação de fatos importados.
- C1 Banese importado: INSERT real de C2 e primeiro claim autorizado em rollback; C1 e duplicidade permaneceram protegidos.
- Contratos importação/trancamento, 15 testes do worker, 12 testes das ações financeiras, TypeScript e build completo passaram.
- Trancamento SQL completo passou em rollback: RPC real, claim/start/complete, reativação e terminal; capacidades e RPCs page_v4/groups_v3 reais também passaram.
- Após rollback: nenhum helper/fato novo persistido e zero títulos sintéticos. Nenhuma chamada bancária ocorreu nos testes SQL.
- Gate local de linhas reportou 12 arquivos antigos ausentes, fora deste lote; manifesto atual será conferido explicitamente e pela árvore limpa do CI remoto.
- Hotfix da confirmação canônica T46 já publicado separadamente em 4.8.142 (PR 233).
- Smoke visual autenticado completo pendente: Safari sem janela acessível nesta etapa. Nenhuma emissão de teste.
- Testes usam mocks ou transações revertidas; não exercitam emissão bancária real.
- Alterações paralelas preservadas; publicação preparada sobre main, somente hunks do lote.
- Documentação normativa/skill pertence a lote operacional separado da correção.
