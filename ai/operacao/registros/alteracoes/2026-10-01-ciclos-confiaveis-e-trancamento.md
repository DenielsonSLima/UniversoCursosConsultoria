# Ciclos confiáveis e trancamento financeiro

Estado: PUBLICADO EM PRODUÇÃO — 4.8.144, PR 235, commit `17f6504377a52d13d1deac254e9b19df037e1bfe`. Autorização: usuário confirmou correções e cancelamento
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
- Gate local global reportou 12 arquivos antigos ausentes fora do lote; a árvore limpa do CI passou, inclusive limite de linhas (55 arquivos, máximo 499), lint, TypeScript, testes e build.
- Hotfix da confirmação canônica T46 já publicado separadamente em 4.8.142 (PR 233).
- Smoke visual autenticado completo pendente: Safari sem janela acessível nesta etapa. Nenhuma emissão de teste.
- Testes usam mocks ou transações revertidas; não exercitam emissão bancária real.
- Alterações paralelas preservadas; publicação preparada sobre main, somente hunks do lote.
- Documentação normativa/skill pertence a lote operacional separado da correção.

## Publicação e aceite remoto

- PR: https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/235.
- Head validado: `d137d298d1292d7282afc56b62a08698aebea2a7`; CI integral e gate de versão aprovados.
- Preview Vercel `3tEySm4PHByey4PrzYZsDuWtYEmv` e produção `BnSh55EdLYcoHqtWVkSVtrTsTLkK` confirmadas como sucesso pela integração GitHub/Vercel. Connector direto Vercel sem acesso ao escopo (403); sem alegação de smoke visual completo.
- Pós-aplicação: T42 35 matrículas, 15 elegíveis sem cache recente, 16 C1 confirmados; C2/conflitos e casos sem prova continuam protegidos. T46 preservou o fingerprint das 6 matrículas.
- RPCs reais de página/grupos e confirmação canônica nos 3 modos passaram novamente; nenhuma emissão.
- Prévia de trancamento recusou usuário sem identidade e mantém anon sem EXECUTE. Avisos esperados do advisor: tabelas privadas com RLS sem políticas e RPC SECURITY DEFINER autenticada com autorização por turma.
- Referência do advisor: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## Migrations aplicadas e imutáveis

Cada arquivo do manifesto foi aplicado via MCP, em ordem. O ledger remoto usa os IDs abaixo; não reaplicar nem renomear o conteúdo aplicado.

| Nome da migration | ID remoto |
| --- | --- |
| `create_imported_cycle_facts` | `20261001024709` |
| `capture_imported_banese_cycle_facts` | `20261001024713` |
| `capture_external_cycle_coverage_facts` | `20261001024715` |
| `allow_seed_imported_cycle_review` | `20261001024719` |
| `apply_imported_cycle_fact_guards` | `20261001024721` |
| `allow_imported_banese_c1_continuation` | `20261001024724` |
| `add_trancamento_banese_cancellation_policy` | `20261001024726` |
| `project_trancamento_banese_cancellation` | `20261001024728` |
| `fence_trancamento_manual_settlement_races` | `20261001024730` |
| `preserve_trancamento_during_terminal_movement` | `20261001024733` |
| `extend_banese_cancellation_claim_for_trancamento` | `20261001024735` |
| `preview_trancamento_financeiro` | `20261001024737` |
| `receivable_source_capabilities` | `20261001024740` |
| `restore_receivable_cycle_presentation_dependency` | `20261001024742` |
| `restore_receivable_projection_wiring` | `20261001024744` |
| `project_receivable_operation_capabilities` | `20261001024746` |

## Operação pontual de títulos legados

- Autorizada pelo usuário: somente não pagos/sem parcial posteriores ao trancamento comprovado.
- Allowlist privada de 9 recebíveis, uma matrícula, corte 30/09/2026, total nominal R$ 2.519,10; sem dados pessoais neste registro.
- Diagnóstico GET-only integral do worker v102 confirmou os 9 títulos (identidade, CPF, nominal, vencimento, termos, ASBACE, proveniência, pagamentos); código 2 e nenhum pagamento.
- Guardas transacionais: locks, snapshot exato, transação única, corte atual, ausência de Proesc/baixa manual/outbox e diagnóstico até 5 minutos. Ensaio em rollback antes do commit.
- Em 01/10/2026 02:51 UTC, os 9 SUSPENSO passaram a PENDENTE e entraram na outbox. O cron executou o fluxo bancário e concluiu os 9 em uma tentativa cada, até 02:52:12 UTC.
- Pós-operação: 9 outbox DONE/CANCELED, 9 recebíveis CANCELADO/gateway CANCELED, projeção CANCELED e saldo aberto desses títulos igual a zero. Total retirado do saldo aberto: R$ 2.519,10. Histórico preservado; nenhuma emissão.
- Títulos anteriores ao corte não foram cancelados: duas mensalidades VENCIDO, uma PENDENTE e matrícula PAGO permanecem preservadas.
