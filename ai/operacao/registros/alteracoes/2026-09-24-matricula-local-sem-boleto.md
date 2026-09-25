# Matrícula local sem boleto e datas explícitas

Estado: concluído e publicado em produção 4.8.81. Continuidade do fluxo financeiro técnico autorizado.

## Pedido e aceite

- A primeira etapa deve mostrar a data inicial calculada e a primeira mensalidade, conforme RPC.
- Criar matrícula como registro local sem emitir boleto, mantendo-a pendente até baixa manual explícita.
- Reutilizar recebimento auditável com data, conta, forma e valor; não presumir pagamento em dinheiro.
- Preservar boleto de matrícula e omissão como opções distintas, além dos contratos antigos.
- No modo local, 13 registros e somente 12 títulos bancários; matrícula fora do carnê e de qualquer POST bancário.
- Retomada e C2 reconhecem a matrícula local íntegra sem exigir sua quitação e sem reaplicá-la.
- Falha anterior ao commit preserva a matrícula pendente. Falha na resposta/projeção posterior pode ocorrer após a baixa; reconciliar o estado e repetir a mesma chave da operação, sem criar outro ciclo ou presumir pagamento ausente.
- Histórico Proesc/Banese e alterações paralelas preservados.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-destination.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualRevision.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualEnrollmentSettlement.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualEnrollmentOptions.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualSettlement.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualChargeRows.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualIssuanceProgress.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoCarneAction.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-modal-ux.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-state-recovery.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-local-enrollment.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `modules/gestor/financeiro/receber/components/manual-settlement/ManualSettlementModal.tsx`
- `.github/workflows/quality-gates.yml`
- `supabase/functions/technical-manual-cycle-issuance/revision.ts`
- `supabase/functions/technical-manual-cycle-issuance/revision.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.test.ts`
- `supabase/functions/banese-carnet-document/manual-cycle-carnet.test.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/index.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/wiring.test.ts`
- `supabase/migrations/20260924180000_add_local_enrollment_fee_intent.sql`
- `supabase/migrations/20260924180100_guard_local_enrollment_fee.sql`
- `supabase/migrations/20260924180200_guard_local_enrollment_bank_authorization.sql`
- `supabase/migrations/20260924180300_prepare_local_enrollment_fee_projection.sql`
- `supabase/migrations/20260924180400_project_local_enrollment_cycle_state.sql`
- `supabase/migrations/20260924180500_validate_local_enrollment_cycle_readiness.sql`
- `supabase/tests/local_enrollment_fee.rollback.sql`
- `supabase/tests/local_enrollment_cycle_state.transaction.sql`
- `supabase/tests/reviewed_manual_cycle_identity.rollback.sql`
- `supabase/tests/individual_technical_cycles.transaction.sql`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDatesSummary.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-24-matricula-local-sem-boleto.md`

Total: 52 arquivos. Migrations anteriores aplicadas permanecem imutáveis.

## Reprodução

- Capturas do usuário mostram primeira etapa sem data e segunda etapa com matrícula zero.
- Opção antiga `emitirMatricula=false` exclui o registro; não satisfaz o registro local solicitado.
- Baixa manual existente suporta recebível sem título remoto e registra pagamento auditável, sem cancelamento bancário.
- A matrícula técnica não gera novas parcelas automaticamente após a baixa; os ciclos permanecem manuais.

## Contrato implementado

- `modoMatricula`: `BOLETO`, `REGISTRO_SEM_BOLETO`, `OMITIR`; booleano legado preservado.
- Destino local imutável por item, prova explícita no backend e estado `NAO_APLICAVEL` para emissão bancária.
- Contadores de itens locais e bancários separados; não apresentar matrícula local como boleto emitido.
- Ação persistente de recebimento vinculada ao ID canônico da matrícula local.

## Validação

- 142 testes únicos de UI, emissão, retomada e documentos aprovados; TypeScript e build aprovados.
- Smoke do componente real em Chrome isolado: datas 20/10/2026 e 20/11/2026; modo local com 13 registros/12 boletos; confirmação abre formulário, não baixa automaticamente; conta obrigatória; data anterior e dinheiro enviados corretamente ao callback simulado.
- Seis migrations aplicadas em ordem; nenhuma migration anterior alterada. Selftest C2 com LOCAL pendente/pago e negativas aprovado antes do commit.
- Rollbacks reais: matrícula local, prepare autenticado, bloqueio bancário, finalize em dinheiro e replay; identidade/vencimento, pagamento bancário comprovado, elegibilidade individual e modos anteriores 12/13 registros.
- Primeira execução do fixture de baixa encontrou FK entre usuário Auth e perfil; somente o teste foi corrigido para usar o ID canônico do perfil. Reexecução aprovada; nenhum efeito persistiu.
- Workspace real de 11 turmas/454 matrículas validado pelos parsers completos, sem erros. Comparação por matrícula confirmou zero mudanças em estados, elegibilidade, bloqueios, datas, parcelas e totais; 122 elegíveis antes/depois.
- Edge emissão v6 (JWT ligado, 70 arquivos) e worker retomada v5 (JWT preservado desligado, 72 arquivos) ativos; bundles remotos iguais aos manifestos preparados. Dependências alheias preservadas.
- Nenhum boleto ou recebimento real executado; harness simulado e SQL com rollback. Revisão cruzada por três agentes concluída.
- GitHub/Preview/produção concluídos: PR #173, main `e0160141951fab6d9b63a054e358aa550230bd03`; CI Qualidade #516 e Versão #371 aprovados.

Baseline preservado: 6.837 recebíveis, R$ 1.876.839,27, 395 transações bancárias e seis ciclos; aluna de referência continua sem cobranças geradas.

## Rastreabilidade remota

- `180000` → `20260924230338`; `180100` → `20260924230349`; `180200` → `20260924230352`.
- `180300` → `20260924230354`; `180400` → `20260924230357`; `180500` → `20260924230400`.
- Advisors de segurança preservaram a linha de base: RLS sem policy111, search_path1, grants anon14/autenticados432 e proteção de senhas1. Nenhum novo aviso.

## Publicação concluída

- PR: https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/173
- Produção: https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/pBA2spgPERo7VdHdJ6Xci646tiot
- Domínio público confirmou `main-DOhbOI7I.js` com 4.8.81 e `GestaoTecnicos-Bo900_G4.js` com datas explícitas, três modos e abertura opcional do recebimento.
- Primeira rodada de CI encontrou somente no-regex-spaces no teste do worker; correção local lint+seis testes aprovada e suíte completa repetida antes do merge. Código produtivo e migrations aplicadas não foram alterados nessa correção.
- Nenhum registro financeiro gerado para a aluna de referência durante validação. Abas e rascunho do usuário preservados.
