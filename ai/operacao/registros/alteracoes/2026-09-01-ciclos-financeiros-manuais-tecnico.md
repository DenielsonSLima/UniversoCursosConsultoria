# Ciclos financeiros manuais dos cursos técnicos

Data: 2026-09-01
Estado: pronto para publicação

## Objetivo e contrato entregue

- O fluxo novo é exclusivo de cursos técnicos e possui no máximo dois ciclos.
- Turma nova começa no ciclo zero; importada pode reconhecer um ciclo histórico
  ou os dois ciclos concluídos.
- Adicionar aluno salva matrícula, regra e eventual condição individual como
  pendentes, sem criar recebível, boleto ou agendamento.
- A geração abre uma prévia completa e exige confirmação humana por aluno.
- O segundo ciclo exige vencimento individual. Havendo rematrícula, ela vence
  nessa data e a primeira mensalidade no mês seguinte; sem rematrícula, a
  primeira mensalidade usa a data informada.
- A liberação respeita a regra configurada: quitação total ou parcela N-1 paga
  sem título vencido no ciclo anterior.
- A geração cria apenas `contas_receber` locais. A emissão Banese permanece uma
  ação posterior e explícita por recebível; nenhum webhook foi criado.
- Novas turmas técnicas já nascem na política manual. Turmas anteriores não são
  reclassificadas silenciosamente; a Turma 42 foi o piloto explicitamente
  autorizado e recebeu baseline histórico igual a um.

## Turma 42 e integridade dos dados

- Código canônico: `ENF-T42-INT-MAT`.
- Antes e depois das migrations: 35 matrículas, 353 recebíveis, dois alunos
  trancados, uma matrícula protegida e 13 títulos Banese registrados.
- Assinatura estrutural antes/depois:
  `5c9bdf3f01be2444608827e3d476fc126d3cac044807b74527101e515889458b`.
- Nenhuma RPC de geração foi chamada na matrícula protegida e nenhum título
  existente foi alterado.
- Estado remoto após a aplicação: 1 matrícula protegida; 5 elegíveis ao segundo
  ciclo; 21 bloqueadas por inadimplência; 6 por ciclo anterior incompleto; e os
  2 alunos `TRANCADO` bloqueados por status acadêmico.
- Uma prévia somente leitura de aluno elegível retornou 13 itens, ciclo 2 e
  vencimento individual, sem persistir cobrança.

## Conciliação corrigida

- A tela zerada das imagens não foi causada pelo novo ciclo nem por webhook.
  Os logs mostraram `BOOT_ERROR` no `payment-gateway-api`: o bundle implantado
  não continha a exportação canônica `awaitBaneseRead`, embora o GitHub já a
  possuísse.
- O bundle canônico foi restaurado também nos consumidores compartilhados. O
  fechamento do lote deixou `asaas-api` v95, `payment-gateway-api` v31 e
  `banese-cnab240-api` v13; os três responderam `OPTIONS 200`, sem POST bancário.
- `checkout-api` v22 e `dependencia-banese-checkout` v14 também receberam a
  recuperação do bundle compartilhado durante o diagnóstico.
- Não há diferença de fonte de conciliação a publicar: o arquivo correto já
  estava no `main`; a falha era exclusivamente drift do pacote implantado.

## Banco e Edge Functions

- Nove migrations foram aplicadas via MCP Supabase, versões remotas
  `20260901151207`, `20260901151210`, `20260901151213`, `20260901151215`,
  `20260901151217`, `20260901151220`, `20260901151225`, `20260901151326` e
  `20260901151915`.
- A migration de autorização abortou integralmente na primeira tentativa por
  alias SQL reservado, foi corrigida e aplicada sem efeito parcial. Por isso, a
  guarda independente de sincronização possui versão remota anterior à
  autorização, embora os nomes locais preservem a ordem de reconstrução.
- Os adapters Asaas, Banese API e CNAB consultam a guarda canônica antes de
  qualquer sincronização futura automática.
- Os advisors deixaram apenas avisos intencionais: a tabela interna de
  autorizações usa RLS sem policy e privilégios revogados, e a RPC
  `SECURITY DEFINER` é exposta somente a autenticados com RBAC e escopo de polo.
  Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Validação

- 16 testes Node focados passaram.
- 72 testes Deno integrados passaram.
- TypeScript e ESLint focado passaram.
- O gate de 500 linhas e o build de produção da versão 4.8.22 passaram; os
  avisos de tamanho de chunks já existentes permaneceram não bloqueantes.
- `deno check` passou nos três entrypoints publicados.
- Os três runtimes publicados responderam `OPTIONS 200` e sem `BOOT_ERROR`.
- O filtro por turma em Contas a Receber já existia no fluxo atual, separado
  por modalidade, e permaneceu preservado.
- O smoke visual autenticado ficou pendente porque não havia sessão de navegador
  conectada; nenhum teste automatizado foi apresentado como substituto desse
  limite real.

## Manifesto explícito

Total: 68 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas-2026-09-ciclos-manuais.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-09-01-ciclos-financeiros-manuais-tecnico.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-21-parte-1.md`
- `internal/versioning/system-version.json`
- `modules/asaas/asaas.service.ts`
- `modules/asaas/manual-technical-receivable-issuance.test.ts`
- `modules/asaas/manual-technical-receivable-issuance.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoFinanceiroStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoForm.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoReviewStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-financeiro-preview.service.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.constants.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.contract.test.mjs`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.types.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.utils.test.mjs`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.utils.ts`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.validation.ts`
- `modules/gestor/gestao/gestao-create-turma.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiroTecnico.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/ConfirmarMatriculaModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/manual-technical-enrollment.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/technical-enrollment-manual-policy.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/useTechnicalEnrollmentConfirmation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAtivacaoLegacyDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaCicloManual.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaFinanceiro.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-financeiro-policy.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.client.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.keys.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-financeiro.types.ts`
- `scripts/check-file-line-limits.mjs`
- `supabase/functions/_shared/technical-manual-future-sync.test.ts`
- `supabase/functions/_shared/technical-manual-future-sync.ts`
- `supabase/functions/asaas/api/manual-settlement-context.test.ts`
- `supabase/functions/asaas/api/manual-settlement-future-sync.ts`
- `supabase/functions/asaas/api/route-aware-future-sync.test.ts`
- `supabase/functions/asaas/api/route-aware-future-sync.ts`
- `supabase/functions/banese-cnab240-api/manual-technical-future-sync.test.ts`
- `supabase/functions/banese-cnab240-api/return-activation.ts`
- `supabase/functions/gateways/api/banese-post-settlement-projection.ts`
- `supabase/migrations/20260901120000_create_manual_technical_cycle_policy.sql`
- `supabase/migrations/20260901120050_create_manual_technical_cycle_state.sql`
- `supabase/migrations/20260901120100_create_manual_technical_cycle_preview.sql`
- `supabase/migrations/20260901120200_create_manual_technical_cycle_generation.sql`
- `supabase/migrations/20260901120250_gate_legacy_technical_cycle_generators.sql`
- `supabase/migrations/20260901120300_project_manual_cycle_in_technical_workspace.sql`
- `supabase/migrations/20260901120400_authorize_manual_technical_receivable_issuance.sql`
- `supabase/migrations/20260901120450_guard_manual_technical_future_sync.sql`
- `supabase/migrations/20260901120500_index_manual_technical_cycle_foreign_keys.sql`
- `supabase/tests/manual_technical_class_policy.contract.test.ts`
- `supabase/tests/manual_technical_cycle.contract.test.ts`
- `supabase/tests/manual_technical_cycle_indexes.contract.test.ts`
- `supabase/tests/manual_technical_future_sync_adapters.contract.test.ts`
- `supabase/tests/manual_technical_receivable_issuance.contract.test.ts`
