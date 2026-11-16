# Despesas: valor estimado, mês sem cobrança e Vencidos

Solicitação iniciada em 15/11/2026; fechamento em 16/11/2026. Mudança crítica de financeiro, banco e interface.
Status: backend aplicado e validado via MCP; publicação da interface 4.8.351 em andamento na PR #439, expressamente autorizada pelo gestor.

## Escopo e aceite

- Reutilizar lançamento pendente/parcelado mensal e acrescentar Valor estimado; sem outro gestor de recorrências.
- Confirmar o principal real na mesma transação da primeira baixa. Manter estimativa original, auditoria, autorização, versão e replay imutável.
- Somente a competência escolhida muda; encargos reais permanecem separados e próximos meses continuam estimados.
- Não houve cobrança encerra a previsão escolhida, sai dos compromissos abertos, exibe cobrança zero e mantém a estimativa original. Nenhum pagamento fictício ou principal zero é gravado.
- Baixa única comprovada pelo ledger exibe data, forma e conta no padrão legado, conservando Histórico. Múltiplos eventos/meios e rateio não usam a última forma como resumo indevido.
- Aba Vencidos nas despesas fixas e variáveis considera vencimento anterior a hoje em Maceió, saldo confirmado positivo e filtros autorizados; exclui estimativas sem fatura e meses sem cobrança.
- Totais e rateio em centavos pertencem ao backend. TanStack Query/Realtime atualizam automaticamente os escopos existentes.
- Intervalo inicial do lançamento mensal corrigido de 30 meses para 1 mês; cronogramas já cadastrados preservados.

## Operação Serasa autorizada

- Criar dezembro/2026 e janeiro a dezembro/2027 da Consulta Serasa em DESPESA_VARIAVEL, como estimativas de R$ 117,60, vencimento dia 10; total R$ 1.528,80.
- Criar SOFTWARE variável se inexistente; preservar SOFTWARE fixa, fonte paga de novembro, fornecedor, pagamentos, componentes e rateios anteriores.
- Dezembro isolado; 2027 com grupo anual de 12 títulos. Data de lançamento corresponde à solicitação em 16/11/2026.
- SQL operacional temporário: `/private/tmp/universo-serasa-estimada-20261116/operacao.sql`; operação `30d98f81-8546-4fae-842e-06fb3302670f`. O SQL não pertence ao manifesto nem ao RAG.
- Ensaio real das seis migrations e da operação inteira com ROLLBACK aprovado: 13 datas, zero novas baixas e fonte paga preservada. Pós-consulta confirmou ausência de schema, títulos e ledger temporários.

## Validação e revisão

- Três agentes contribuíram com criação, baixa/experiência e backend; revisões independentes corrigiram JSON null no rateio TODOS, reautorização do replay, exposição do valor físico por acesso derivado e exibição incorreta após cancelamento.
- Contratos PGlite com as migrations reais aprovados: valores reais menores/maiores, parcial, transação atômica mesmo com falha após inserir evento, concorrência, versão, replay, autorização, rateio, metadados e resumos.
- React/JSDOM cobre formulário mensal, baixa, resposta perdida, retomada, mês sem cobrança, histórico somente leitura, baixa única e regressões do modal compartilhado.
- TypeScript, lint focado e build completo aprovados em Node 24.22.1. Testes React/JSDOM e regressões: 37 aprovados; contratos PGlite aprovados. CI remoto anterior aprovado em 23/23 checks; revalidação após incorporar a base paralela.
- Safari autenticado confirmou a causa dos cartões: hasEvents ocultava detalhes mesmo em baixa única. Smoke sintético no Safari confirmou valor real R$ 347,82, parcial R$ 100 e saldo R$ 247,82; opção sem cobrança abriu cobrança zero e estimativa original preservada. Confirmação visual final completa e produção serão registradas após entrega.
- Apenas os dados/labels do extrato foram acrescidos; compositor vetorial, cabeçalho e marca d’água permanecem canônicos. Textos de estimativa seguem os filhos DOM e label do status na extração existente.
- `LOTE_ATIVO.md` e trabalho paralelo de integração bancária/layout PF foram preservados. Arquivos temporários e saídas de build não pertencem ao lote.
- Pedido posterior para analisar Mês atual por vencimento, sem agrupamento obrigatório, ordenação crescente/decrescente e filtros por situação está reservado para reunião após esta entrega; não foi implementado neste lote.

- As seis migrations foram aplicadas via MCP e seus arquivos renomeados para os IDs efetivos do ledger, sem alterar o conteúdo. Novas versões: 20261116031717, 20261116031731, 20261116031733, 20261116031736, 20261116031738 e 20261116031740. Arquivos aplicados ficam imutáveis.
- `check:file-lines` encontrou 14 referências históricas ausentes fora do manifesto no checkout; os 47 arquivos do lote estão abaixo de 500 linhas. Registro remoto foi construído da base main mais este manifesto, preservando entradas locais paralelas.

- PDF nativo: 9/9 contratos aprovados; três cenários no hook real e 9 verificações do texto extraído, com página renderizada sem cortes nos novos dados.
- Base de publicação atualizada para 3019d7398ad2debea941f89ceac70ee0dc1e5cd1 após PR #440/4.8.350. Caixa, lote paralelo e histórico arquivado de 4.8.282–290 preservados; arquivo de histórico sobreposto desta branch removido do manifesto.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormCoreFields.tsx`
- `modules/gestor/financeiro/despesas/despesas.types.ts`
- `modules/gestor/financeiro/despesas/despesas-lancamentos.service.ts`
- `modules/gestor/financeiro/despesas/components/despesa-estimada-criacao.interaction.test.mjs`
- `modules/gestor/financeiro/despesas/despesas.mapper.ts`
- `modules/gestor/financeiro/despesas/despesas-estimativas-leitura.service.ts`
- `modules/gestor/financeiro/despesas/despesas-estimativas-leitura.test.mjs`
- `modules/gestor/financeiro/despesas/despesas-resumos.service.ts`
- `modules/gestor/financeiro/despesas/despesas-vencidas.service.ts`
- `modules/gestor/financeiro/despesas/despesas.queryKeys.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesasQueries.ts`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaEstimativaBadge.tsx`
- `modules/gestor/financeiro/despesas/components/DespesasSummaryCards.tsx`
- `modules/gestor/financeiro/despesas/components/despesaPresentation.ts`
- `modules/gestor/financeiro/despesas/components/despesa-grouping.model.ts`
- `modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/fixas/useDespesasFixasReport.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaBaixaModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaEstimatedPaymentFields.tsx`
- `modules/gestor/financeiro/despesas/despesas-estimativas-pagamento.service.ts`
- `modules/gestor/financeiro/despesas/hooks/useExpensePayment.ts`
- `modules/gestor/financeiro/despesas/components/despesa-estimated-payment.interaction.test.mjs`
- `modules/gestor/financeiro/despesas/despesas-sem-cobranca.service.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesaWithoutCharge.ts`
- `modules/gestor/financeiro/despesas/components/DespesaWithoutChargeModal.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-sem-cobranca.interaction.test.mjs`
- `modules/gestor/financeiro/settlements/FinancialPaymentModal.tsx`
- `modules/gestor/financeiro/settlements/useFinancialPaymentForm.ts`
- `supabase/migrations/20261116031717_expense_estimate_metadata_and_guards.sql`
- `supabase/migrations/20261116031731_create_estimated_expenses.sql`
- `supabase/migrations/20261116031733_confirm_estimated_expense_payment.sql`
- `supabase/migrations/20261116031736_read_estimated_expenses.sql`
- `supabase/migrations/20261116031738_resolve_estimated_expense_without_charge.sql`
- `supabase/migrations/20261116031740_overdue_expenses_workspace.sql`
- `supabase/tests/estimated_expense.fixture.sql`
- `supabase/tests/estimated_expense.isolated.test.mjs`
- `supabase/tests/estimated_expense.rollback.sql`
- `.github/workflows/despesas-estimadas.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-11-15-despesas-valor-estimado.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 47 arquivos.
