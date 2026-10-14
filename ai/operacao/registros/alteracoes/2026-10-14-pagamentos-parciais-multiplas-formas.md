# Pagamentos parciais e múltiplas formas

Status: BACKEND_APLICADO. Versão candidata 4.8.221/revisão230. Produção autorizada explicitamente pelo usuário em 14/10/2026.

## Objetivo e reunião

Três agentes dividiram interface, recebimento/Banese e ledger/despesas. A revisão cruzada cobre cálculo exato em centavos, autorização, concorrência, reprise idempotente, histórico, Caixa e leitura dos saldos.

Um título de R$ 200 pode receber R$ 100 e manter R$ 100 em aberto. Uma baixa pode combinar contas e formas, como R$ 100 em dinheiro e R$ 100 em Pix. Todo cálculo monetário pertence ao PostgreSQL; a interface coleta entradas e exibe prévia e saldo canônicos.

## Contrato

- Eventos e componentes imutáveis, autorização antes de replay, bloqueio do título e chave de solicitação vinculada ao conteúdo.
- Recebimento líquido de encargos reduz principal; desconto é redução explícita separada. Nenhuma diferença vira desconto automaticamente.
- Fonte permanece pendente até saldo zero. Contas bancárias e relatórios consideram cada componente apenas uma vez e na data correta.
- Banese nativo exige identidade e termos completos, intenção durável e confirmação bancária antes da baixa. Retomada incerta consulta sem repetir o cancelamento.
- Não há reemissão automática do saldo residual. Ativação acadêmica ocorre somente após quitação.
- Histórico importado, financiamento e convênios conservam seus fluxos específicos; não se enfraquecem as guardas para torná-los elegíveis ao novo fluxo.
- Estorno de despesas é por evento, preserva evidência e recalcula saldo. Fluxos legados não podem sobrescrever títulos do ledger.

## Validação e limites

SQL real em PGlite com dados sintéticos, testes Deno de contrato/processor e smoke React/JSDOM com interação. Safari autenticado indisponível: smoke no ambiente autenticado permanece pendente. PGlite não substitui corrida entre duas sessões PostgreSQL reais.

Nenhum recebimento, pagamento ou cancelamento bancário real será utilizado como teste. A leitura pública confirmou a entrega anterior 4.8.220 em produção (PR314, a056b7bf9a1920625e2220ca31faa93f55d84b81).

## Estado de entrega

19 migrations aplicadas via MCP entre 20261014183502 e 20261014183611; arquivos locais espelham o ledger remoto. Edge financial-receivable-payment v1 ACTIVE com verify_jwt=true. Frontend aguarda gates e Preview do PR.

TypeScript, lint, build, 17 testes Deno, quatro suítes SQL/PGlite, routing, smoke React/JSDOM e regressão de cancelamento aprovados. O teste de rateio cobre centavos, valores em meses diferentes e estorno; contagens do Caixa preservam um título para vários componentes.

## Manifesto explícito

- `.github/workflows/financial-payments.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-14-pagamentos-parciais-multiplas-formas.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/despesas/components/DespesaBaixaModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/despesas-convenios.test.ts`
- `modules/gestor/financeiro/despesas/despesas-lancamentos.service.ts`
- `modules/gestor/financeiro/despesas/despesas.mapper.ts`
- `modules/gestor/financeiro/despesas/despesas.types.ts`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/hooks/useDespesaPendingDeletion.ts`
- `modules/gestor/financeiro/despesas/hooks/useExpensePayment.ts`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `modules/gestor/financeiro/financeiro.composition-presentation.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/useOutrosCreditos.ts`
- `modules/gestor/financeiro/outros-debitos/OutrosDebitosTab.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberOverlays.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberOperations.ts`
- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentHistory.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentModal.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentReversal.tsx`
- `modules/gestor/financeiro/settlements/ReceivablePaymentModal.tsx`
- `modules/gestor/financeiro/settlements/financial-payment.form.ts`
- `modules/gestor/financeiro/settlements/financial-payment.presentation.tsx`
- `modules/gestor/financeiro/settlements/financial-payment.routing.test.ts`
- `modules/gestor/financeiro/settlements/financial-payment.routing.ts`
- `modules/gestor/financeiro/settlements/financial-payment.service.ts`
- `modules/gestor/financeiro/settlements/financial-payment.smoke.test.mjs`
- `modules/gestor/financeiro/settlements/financial-payment.summary.ts`
- `modules/gestor/financeiro/settlements/financial-payment.types.ts`
- `modules/gestor/financeiro/settlements/useFinancialPaymentForm.ts`
- `modules/gestor/financeiro/settlements/useLegacyFullReceipt.ts`
- `supabase/functions/financial-receivable-payment/academic.ts`
- `supabase/functions/financial-receivable-payment/bank.test.ts`
- `supabase/functions/financial-receivable-payment/bank.ts`
- `supabase/functions/financial-receivable-payment/contract.ts`
- `supabase/functions/financial-receivable-payment/handler.test.ts`
- `supabase/functions/financial-receivable-payment/handler.ts`
- `supabase/functions/financial-receivable-payment/index.ts`
- `supabase/functions/financial-receivable-payment/processor.test.ts`
- `supabase/functions/financial-receivable-payment/processor.ts`
- `supabase/functions/financial-receivable-payment/store.ts`
- `supabase/migrations/20261014183502_financial_payment_ledger.sql`
- `supabase/migrations/20261014183505_financial_payment_preview.sql`
- `supabase/migrations/20261014183509_financial_payment_append.sql`
- `supabase/migrations/20261014183512_financial_payment_source_guards.sql`
- `supabase/migrations/20261014183515_financial_payment_expense_reads.sql`
- `supabase/migrations/20261014183517_financial_payment_receivable_reads.sql`
- `supabase/migrations/20261014183520_financial_payment_no_cycle_side_effect.sql`
- `supabase/migrations/20261014183529_financial_payment_cash_components.sql`
- `supabase/migrations/20261014183532_financial_payment_cash_sources.sql`
- `supabase/migrations/20261014183535_financial_payment_cash_rateios.sql`
- `supabase/migrations/20261014183538_financial_payment_cash_readers.sql`
- `supabase/migrations/20261014183541_financial_payment_cash_expense_detail.sql`
- `supabase/migrations/20261014183544_financial_payment_cash_title_counts.sql`
- `supabase/migrations/20261014183547_financial_payment_cash_position_counts.sql`
- `supabase/migrations/20261014183558_receivable_payment_saga.sql`
- `supabase/migrations/20261014183602_receivable_payment_commands.sql`
- `supabase/migrations/20261014183605_receivable_payment_completion.sql`
- `supabase/migrations/20261014183608_receivable_payment_fences.sql`
- `supabase/migrations/20261014183611_receivable_payment_capabilities.sql`
- `supabase/tests/financial_payment.fixture.sql`
- `supabase/tests/financial_payment.isolated.test.mjs`
- `supabase/tests/financial_payment_cash.fixture.sql`
- `supabase/tests/financial_payment_cash.isolated.test.mjs`
- `supabase/tests/financial_payment_lifecycle.baseline.sql`
- `supabase/tests/financial_payment_position_readers.fixture.sql`
- `supabase/tests/financial_payment_reads.fixture.sql`
- `supabase/tests/financial_payment_receivable_reads.baseline.sql`
- `supabase/tests/financial_payment_receivable_reads.fixture.sql`
- `supabase/tests/financial_payment_title_counts.isolated.test.mjs`
- `supabase/tests/financial_payment_title_readers.fixture.sql`
- `supabase/tests/receivable_payment.isolated.test.mjs`

Total: 82 arquivos.
