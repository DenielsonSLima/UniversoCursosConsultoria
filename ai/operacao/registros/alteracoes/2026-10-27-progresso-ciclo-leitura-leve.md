# Progresso do ciclo e leitura leve — 27/10/2026

Estado: EM VALIDAÇÃO. Candidato conjunto 4.8.239/revisão 248; base main 9a0d5dbac2c8f1922b5fd3623a5050f299e5fe3c. Nenhuma operação bancária real integra o lote.

## Diagnóstico e escopo

A emissão já concluída podia permanecer visualmente em zero porque o acompanhamento dependia do estado herdado da lista inteira da turma. O refetch concorrente dessa lista excedia o statement_timeout de 8 segundos e o encerramento da mutation aguardava invalidações. Erros de prévia por data inválida são distintos de falha bancária; uma falha de leitura não prova ausência de emissão.

- RPC autenticada e somente leitura resolve matrícula, polo, turma e permissão financeira antes de retornar o progresso canônico do ciclo.
- Snapshot leve é extraído da rotina existente sem alterar seus critérios de identidade bancária, título local, composição ou revisão. O contrato anterior permanece disponível.
- Cliente envia uma única operação; consultas independentes, limitadas e singleflight podem comprovar conclusão integral. Falta de leitura nunca vira zero fabricado nem autoriza novo POST.
- Erro ou timeout é visível; acompanhamento pode ser encerrado sem cancelar a operação. Identidade mínima permite voltar a consultar após recarga, sem reenvio automático.
- Realtime evita recarregar toda a turma por título enquanto há operação observada; invalidação final não prende a mutation.
- Otimização elimina cálculo completo de contexto quando só mensalidades são necessárias e evita provas de matrícula local em tipos incompatíveis. Não eleva timeout, não amplia grants e não muda elegibilidade.

## Validação e limites

- PostgreSQL isolado: geração canônica e COMMIT, leitura equivalente, 12/13 com taxa em revisão, 13/13 concluído, ausência não confundida com zero, RBAC e grants mínimos.
- Turma sintética mista de 35 matrículas/590 títulos: contexto, contador e estado iguais antes/depois; query após patch medida em 1.348 ms no PGlite, dentro de 8.000 ms. Isto não é medição do ambiente de produção nem teste de carga multiusuário.
- Dados financeiros sintéticos permanecem idênticos; nenhuma chamada HTTP bancária nos testes.
- Revisão independente das duas migrations aprovada, incluindo equivalência e permissões false/NULL. CI completo e gates finais são condição de aplicação.
- Smoke autenticado real pertence ao usuário; não será substituído por alegação de testes de banco real.

## Implantação e reversão

1. Revalidar main, hashes das definições, ausência de operação em voo e baseline financeiro.
2. Aplicar migrations de progresso e eficiência, sem DML; comparar definições/ACL e integridade imediatamente.
3. Publicar UI somente após RPC disponível. Clientes antigos conservam seu contrato. Abas antigas devem ser recarregadas para receber o acompanhamento corrigido.
4. Verificar consulta limitada da turma e versão real do deployment. Se falhar, interromper o rollout e corrigir sem reemitir títulos.

Rollback: UI anterior continua compatível com as rotas preservadas. Funções de leitura podem ser restauradas por nova migration revisada; não reverter nem apagar registros financeiros. A correção de vencimento de título rejeitado é outro manifesto e não integra este.

## Manifesto explícito

- `.github/workflows/technical-cycle-recovery.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-progresso-ciclo-leitura-leve.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiroTecnico.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualIssuanceProgress.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualLiveProgress.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCycleObservationRecovery.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaCicloManual.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaFinanceiroRealtime.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-activity.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-observation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-pending-observation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-progress.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `supabase/migrations/20261027163500_scoped_manual_cycle_progress.sql`
- `supabase/migrations/20261027163600_financial_projection_read_efficiency.sql`
- `supabase/tests/financial-projection-workload.isolated.test.mjs`
- `supabase/tests/manual-cycle-progress-runtime.mjs`
- `supabase/tests/manual-cycle-progress.isolated.test.mjs`
- `supabase/tests/manual-cycle-progress.test.mjs`

Total: 27 arquivos.
