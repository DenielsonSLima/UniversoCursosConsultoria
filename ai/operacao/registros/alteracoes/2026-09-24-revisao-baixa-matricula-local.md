# Revisão da baixa e do estorno da matrícula local

Estado: validado; preparado para publicação 4.8.82. Continuidade autorizada da revisão financeira.

## Pedido e achados reproduzidos

Revisar novamente com três agentes e registrar os contratos para prevenir regressões.

- A lista oferece conta compartilhada cujo polo físico é diferente; Edge e finalizer da baixa rejeitam essa conta. Restringir a UI ao contrato vigente, sem ampliar autorização.
- Erro ao recarregar contas mantendo cache deixa o botão aparentemente disponível, mas o hook não executa. Apresentar indisponibilidade real.
- Estorno com motivo grava anotação em asaas_last_error e encontra a barreira de campos bancários LOCAL. Sem motivo, mantém manual_settlement_id enquanto a prova local pendente exige null. Ambos exigem comprovação auditável do estorno antes de retomar.
- Consultas somente leitura confirmaram zero matrículas LOCAL em produção antes do patch; nenhum registro foi afetado pelo teste.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-settlement-account.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-settlement-account.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualEnrollmentSettlement.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-local-enrollment.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualSettlement.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `supabase/functions/technical-manual-cycle-recovery-worker/local-enrollment-recovery.test.ts`
- `modules/gestor/financeiro/financeiro.local-enrollment-reversal.ts`
- `modules/gestor/financeiro/financeiro.local-enrollment-reversal.test.ts`
- `modules/gestor/financeiro/financeiro.receivables.service.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberOperations.ts`
- `supabase/migrations/20260924190000_prove_local_enrollment_reversal.sql`
- `supabase/migrations/20260924190100_reverse_local_enrollment_settlement.sql`
- `supabase/migrations/20260924190200_project_local_enrollment_reversal_identity.sql`
- `supabase/tests/local_enrollment_reversal.rollback.sql`
- `supabase/tests/local_enrollment_cycle_state.transaction.sql`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-02-versoes-4-8-27-a-4-8-29.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-24-revisao-baixa-matricula-local.md`

Total: 25 arquivos.

## Aceite

- Contas ofertadas são aceitas pelo contrato atual de polo/global e permissão.
- Falha na leitura de contas não parece uma confirmação disponível sem efeito.
- Estorno auditável preserva intenção LOCAL e retomada/C2; pagamento sem prova continua bloqueado.
- Nenhuma matrícula LOCAL pode receber identidade/claim/transação bancária.
- Migrations aplicadas permanecem imutáveis; novas provas precisam regressões positivas e negativas.

## Validação

- Três agentes: elegibilidade/SQL, interface/baixa e auditoria independente da emissão/retomada/publicação.
- 113 testes focados passaram (64 frontend/contrato, 49 emissão/retomada); 9 subcasos adicionais. TypeScript, lint do manifesto, teto de 500 linhas e build passaram.
- Migrations novas aplicadas em ordem via MCP: 190000→20260924235204,190100→20260924235224,190200→20260924235236. Sem alteração de cobranças na aplicação.
- Rollbacks reais: `local_enrollment_reversal.rollback.sql`, `local_enrollment_cycle_state.transaction.sql`, `local_enrollment_fee.rollback.sql`, `reviewed_manual_cycle_identity.rollback.sql`. RPC authenticated/finalizer canônicos, estorno com/sem motivo, replay, rebaixa, CAS antigo, auditoria, bloqueio legado e C2 comprovados.
- Smoke interativo local com hook/modal reais e serviços simulados: apenas contas do polo/global ativas; erro PostgREST com cache visível e botão bloqueado; recuperação da consulta; ausência de permissão impede abrir; clique duplo confirma uma única baixa simulada.
- Releitura de 11 turmas/454 matrículas: zero mudança nos estados acadêmicos e de ciclo. Baseline preservada: 6837 recebíveis, total nominal R$ 1.876.839,27, 395 transações de gateway, 6 runs e zero matrículas LOCAL.
- Bundles remotos conferidos: emissor v6, worker v5, carnê v25 e grupo v7. Nenhum redeploy Edge necessário. Não foram emitidos, pagos ou estornados títulos reais.
- Recuperação negativa após resposta ambígua não autoriza nova emissão/pagamento; primeiro reconciliar o estado canônico. Falha pós-commit pode ocorrer depois de baixa confirmada.

## Contratos preservados

LOCAL conserva destino/termos congelados e nunca ganha campos, claims ou transações bancárias. O ciclo tem 13 recebíveis e 12 bancários. C2 exige emissão bancária comprovada, sem exigir quitação LOCAL. Estorno exige ator real autorizado, mesma baixa, polo, motivo e evento; uma repetição antiga não pode desfazer pagamento posterior. Fontes importadas continuam consultadas e reconciliadas pelas integrações próprias.

## Publicação

Manifesto isolado de 25 arquivos sobre main 4.8.81. Alterações paralelas do Caixa excluídas. Atualização da memória será realizada em lote operacional separado após esta correção. CI, Preview e produção devem ser conferidas na PR deste lote.
