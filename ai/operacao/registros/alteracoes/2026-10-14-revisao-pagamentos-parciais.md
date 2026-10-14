# Revisão dos pagamentos parciais

Status: BACKEND_APLICADO. Versão 4.8.222/revisão231. Produção autorizada pelo usuário em 14/10/2026.

## Reunião e correções

Três agentes revisaram interface/convênios, recebimento/Banese e SQL/relatórios. A revisão cruzada confirmou e corrigiu:

- Saldo parcial vencido perdia a classificação de atraso; preview, título, histórico e Caixa passam a preservar VENCIDO. Atualizações de metadados após a virada do dia canonizam o estado sem bloquear o título.
- Resumos gerais de despesas ignoravam o valor pago parcial e mantinham o nominal em aberto; agora usam os totais canônicos.
- Alterar o identificador de uma fonte com histórico podia separar o ledger; IDs passam a ser imutáveis, inclusive após estorno.
- Falha de preflight antes de intenção bancária retinha a fonte em revisão; FAILED_SAFE libera somente tentativa sem intenção/evento e com lease correto. Intenção durável continua protegida.
- Recebimento ocupado podia abortar o lote de conciliação; worker filtra tentativas ativas e trava fonte antes da fila, mantendo os limites originais.
- Replay de pagamento já registrado falhava se a conta fosse desativada depois. Resultado terminal aceita somente autorização atual e payload original; novos pagamentos continuam validando disponibilidade da conta.
- Interface oferecia boleto encerrado e classifica agora o saldo local corretamente. Não há reemissão automática do saldo.
- Baixa integral de convênio restaurada, inclusive na listagem global com leitura autorizada apenas dos IDs de vínculo. Preview parcial rejeita fluxo especializado antecipadamente. Retry preserva chave e payload.

## Aceite e validação

Cálculos financeiros continuam no PostgreSQL. Testes sintéticos cobrem parcial/integral, Pix+dinheiro, saldo vencido, autorização, payload divergente, conta desativada, leases, conciliação, histórico e resumos. Smoke React/JSDOM exercita ações e confirmação, incluindo erro após sucesso e repetição imutável.

TypeScript, lint, build e contratos financeiros compõem o fechamento. Safari autenticado indisponível: validação autenticada em produção permanece pendente. PGlite não substitui uma corrida entre duas sessões PostgreSQL reais.

A consulta de produção anterior à migração confirmou zero eventos/tentativas deste novo fluxo; não se requer reparo de dados. Nenhuma cobrança, pagamento ou cancelamento real executado como teste.

## Publicação

Base confirmada: PR315, main bf980f548fd57b3d3130938193a19df4ab2c54da, produção 4.8.221 verificada. Novas migrations são aditivas; as 19 já aplicadas permanecem imutáveis. Seis migrations aplicadas via MCP de 20261014191337 a 20261014191414. Edge financial-receivable-payment v2 ACTIVE, verify_jwt=true. TypeScript, lint, build, 19 testes Deno, seis suítes SQL/PGlite, 34 testes UI e smoke React aprovados. Frontend aguarda gates e Preview do PR.

## Manifesto explícito

- `.github/workflows/financial-payments.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-14-revisao-pagamentos-parciais.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/despesas/components/DespesaBaixaModal.tsx`
- `modules/gestor/financeiro/despesas/components/LegacyDespesaBaixaModal.tsx`
- `modules/gestor/financeiro/despesas/components/LegacyExpensePayment.tsx`
- `modules/gestor/financeiro/despesas/despesas-convenios.test.ts`
- `modules/gestor/financeiro/despesas/despesas-lancamentos.service.ts`
- `modules/gestor/financeiro/despesas/despesas-legacy-payment.model.ts`
- `modules/gestor/financeiro/despesas/despesas-legacy-payment.service.ts`
- `modules/gestor/financeiro/despesas/despesas-settlement-links.service.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanPreview.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.test.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.model.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.test.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.types.ts`
- `modules/gestor/financeiro/outros-creditos/useOtherCreditPlan.ts`
- `modules/gestor/financeiro/settlements/financial-payment.smoke.test.mjs`
- `scripts/test-other-credit-cancellation-ui.mjs`
- `supabase/functions/financial-receivable-payment/processor.test.ts`
- `supabase/functions/financial-receivable-payment/processor.ts`
- `supabase/functions/financial-receivable-payment/store.ts`
- `supabase/migrations/20261014191337_financial_payment_overdue_and_identity.sql`
- `supabase/migrations/20261014191340_financial_payment_unscoped_expense_reads.sql`
- `supabase/migrations/20261014191343_financial_payment_expense_settlement_links.sql`
- `supabase/migrations/20261014191409_receivable_payment_safe_preflight.sql`
- `supabase/migrations/20261014191412_receivable_payment_reconciliation_queue.sql`
- `supabase/migrations/20261014191414_financial_payment_completed_replay.sql`
- `supabase/tests/financial_payment_replay.isolated.test.mjs`
- `supabase/tests/financial_payment_review.isolated.test.mjs`
- `supabase/tests/financial_payment_unscoped_reads.baseline.sql`
- `supabase/tests/receivable_payment.isolated.test.mjs`
- `supabase/tests/receivable_reconciliation.baseline.sql`
- `supabase/tests/receivable_reconciliation.fixture.sql`

Total: 39 arquivos.
