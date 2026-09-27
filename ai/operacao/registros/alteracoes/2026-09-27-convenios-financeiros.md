# Convênios financeiros

Estado: PUBLICADO EM PRODUÇÃO — VERSÃO 4.8.111

## Objetivo

Criar um controle mensal de recursos vinculados a convênios, separado visualmente do fluxo operacional, mas reconciliado com os mesmos recebimentos e despesas do Caixa.

## Decisões do domínio

- Convênio é razão auxiliar de recurso vinculado, não uma segunda conta bancária.
- Crédito de convênio entra no Caixa uma única vez por `contas_receber` pago; o vínculo apenas o classifica.
- Despesa vinculada continua sendo um único `despesas_lancamentos`; o vínculo não cria nova saída.
- Saldo inicial carregado de mês finalizado não é receita do mês seguinte.
- Um convênio possui no máximo uma competência aberta por polo.
- O fechamento é manual, exige ausência de despesas vinculadas pendentes/vencidas e pode abrir o mês seguinte com o saldo final.
- Saldo disponível considera despesas pagas; saldo projetado também deduz compromissos abertos.
- O vínculo inicial de despesa é integral, com um único convênio do mesmo polo, e não permite saldo projetado negativo.
- A competência do convênio é um ciclo de fechamento manual: a data de lançamento permanece no ciclo vinculado, enquanto uma baixa posterior continua aparecendo no Caixa do mês físico do pagamento.
- Alterações de despesa vinculada exigem também permissão de Convênios; sem ela, os metadados do vínculo são mascarados na leitura de Contas a Pagar.

## Entrega local

- Novo submódulo `Financeiro > Convênios`, depois de Empréstimos, com permissões próprias, KPIs, pesquisa, abas Em aberto/Finalizados, cartões/tabela, extrato, crédito e fechamento.
- Seleção opcional de competência de convênio ao criar uma despesa em Contas a Pagar, persistida atomicamente pela RPC.
- Modelo SQL com convênios, competências, créditos, vínculos de despesas, RLS, RPCs seguras, trilha de auditoria e eventos Realtime.
- Caixa com cartão analítico de convênios, sem recompor os totais operacionais.
- Relatório detalhado do Caixa v7 com página vetorial específica de convênios e preservação do cabeçalho/marca d'água canônicos.

## Validação

- 19 testes focados de Convênios/Despesas/SQL: aprovados.
- `npm run test:gestor-access`: 31/31 aprovados.
- `npm run test:caixa-report`: 85/85 aprovados.
- `tsc --noEmit`, ESLint focado e build Vite: aprovados.
- PDF fixture renderizado com Poppler; página de convênios e texto extraído conferidos.
- Nove migrations aplicadas no Supabase de produção, versões remotas `20260927120551` a `20260927121005`.
- Smoke transacional com `service_role` e rollback percorreu criação, crédito, despesa paga vinculada, busca, extrato, resumo do Caixa, fechamento e mês sucessor; nenhum registro de teste permaneceu.
- Contratos remotos confirmados: cinco tabelas com RLS, nenhuma função exposta a `anon`, quatro gatilhos de Realtime, relatório do Caixa v7 e nenhum FK sem índice de cobertura.
- Advisor sem alerta novo de RLS e sem FK sem índice; o aviso da RPC de leitura `SECURITY DEFINER` é intencional, pois ela exige permissão efetiva de Convênios e escopo financeiro antes da leitura. Índices recém-criados aparecem como não utilizados até receberem carga real.
- O MVP preserva créditos confirmados como imutáveis; correções exigem um fluxo auditável específico de estorno, ainda fora deste lote. A interface avisa antes da confirmação.

## Manifesto explícito

Total: 77 arquivos.

### Banco e contratos

- `supabase/migrations/20260927030000_convenios_financeiros_core.sql`
- `supabase/migrations/20260927030100_convenios_financeiros_reads.sql`
- `supabase/migrations/20260927030200_convenios_financeiros_mutations.sql`
- `supabase/migrations/20260927030300_convenios_financeiros_expenses_close.sql`
- `supabase/migrations/20260927030400_convenios_financeiros_expense_read.sql`
- `supabase/migrations/20260927030500_convenios_financeiros_caixa_realtime.sql`
- `supabase/migrations/20260927030600_convenios_financeiros_caixa_report_v7.sql`
- `supabase/migrations/20260927030700_convenios_financeiros_separate_other_credits.sql`
- `supabase/migrations/20260927030800_convenios_financeiros_hardening.sql`
- `supabase/tests/convenios_financeiros.contract.test.ts`

### Produto e acesso

- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/access-control.ts`
- `modules/gestor/access-control.test.ts`
- `modules/gestor/configuracoes/usuarios/components/user-access-options.tsx`
- `modules/gestor/configuracoes/perfis-acesso/PerfilAcessoForm.tsx`
- `modules/gestor/configuracoes/perfis-acesso/PerfilAcessoInternalTabsSection.tsx`
- `modules/gestor/financeiro/convenios/ConveniosTab.tsx`
- `modules/gestor/financeiro/convenios/convenios.types.ts`
- `modules/gestor/financeiro/convenios/convenios.mapper.ts`
- `modules/gestor/financeiro/convenios/convenios.mapper.test.ts`
- `modules/gestor/financeiro/convenios/convenios.service.ts`
- `modules/gestor/financeiro/convenios/convenios.queryKeys.ts`
- `modules/gestor/financeiro/convenios/convenios.cache.ts`
- `modules/gestor/financeiro/convenios/convenios.presentation.ts`
- `modules/gestor/financeiro/convenios/convenios-ui.contract.test.ts`
- `modules/gestor/financeiro/convenios/hooks/useConveniosQueries.ts`
- `modules/gestor/financeiro/convenios/hooks/useConveniosRealtime.ts`
- `modules/gestor/financeiro/convenios/components/ConvenioModalShell.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioFormModal.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioCreditModal.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioCloseMonthModal.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthCard.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthsTable.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthDetailsPage.tsx`
- `modules/gestor/financeiro/convenios/components/ConveniosKpis.tsx`

### Contas a Pagar

- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/despesas.service.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesasRealtime.ts`
- `modules/gestor/financeiro/despesas/components/DespesaConvenioBadge.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormAssociations.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormCoreFields.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormSettlementFields.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-form.utils.ts`
- `modules/gestor/financeiro/despesas/despesas-anexos.service.ts`
- `modules/gestor/financeiro/despesas/despesas-categorias.service.ts`
- `modules/gestor/financeiro/despesas/despesas-convenios.model.ts`
- `modules/gestor/financeiro/despesas/despesas-convenios.test.ts`
- `modules/gestor/financeiro/despesas/despesas-lancamentos.service.ts`
- `modules/gestor/financeiro/despesas/despesas-resumos.service.ts`
- `modules/gestor/financeiro/despesas/despesas.mapper.ts`
- `modules/gestor/financeiro/despesas/despesas.types.ts`

### Caixa e relatório

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/useCaixaRealtime.ts`
- `modules/gestor/caixa/caixa-convenios.service.ts`
- `modules/gestor/caixa/caixa-convenios-resumo.test.ts`
- `modules/gestor/caixa/components/CaixaConveniosResumoCard.tsx`
- `modules/gestor/caixa/report/caixa-report.types.ts`
- `modules/gestor/caixa/report/caixa-report.mapper.ts`
- `modules/gestor/caixa/report/caixa-report.mapper.test.ts`
- `modules/gestor/caixa/report/caixa-report.pagination.ts`
- `modules/gestor/caixa/report/caixa-report.pagination.test.ts`
- `modules/gestor/caixa/report/caixa-report.convenios.ts`
- `modules/gestor/caixa/report/CaixaReportConvenios.tsx`
- `modules/gestor/caixa/report/CaixaReportDocument.tsx`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.convenios.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts`
- `scripts/test-caixa-report.mjs`

### Operação

- `package.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-27-convenios-financeiros.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`

Artefatos temporários de PDF/PNG e saídas de build permanecem fora do lote.
