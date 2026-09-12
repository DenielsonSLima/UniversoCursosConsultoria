# Recebidos por data do pagamento — 4.8.40

## Resultado

Recebidos usa o pagamento efetivo no período, como o Caixa. Indicador, grupos, parcelas e extrato PDF usam a mesma base temporal. Os demais estados continuam por vencimento.
A origem SISTEMA_ANTERIOR é identificada como Sistema anterior, sem auditoria manual indevida.

## Implementação

- Três RPCs ajustadas mantendo assinaturas, autorização, privilégios, payload e ordenação.
- Resumo separa agregados por pagamento e por vencimento; Todos permanece por vencimento e não representa a soma das abas com bases distintas.
- Filtro informa Pagamento na situação Recebidos; relatório usa o mesmo período e total.
- Chaves de cache renovadas para evitar resultados anteriores.
- Nenhum valor, data, recebimento ou movimento financeiro foi alterado.
- Migrations aplicadas via MCP Supabase; nomes locais correspondem ao ledger remoto.

## Manifesto explícito

- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesSummaryCards.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-12-recebimentos-origem-periodo.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `modules/gestor/financeiro/financeiro.queryKeys.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesPeriodFilter.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberToolbar.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberReport.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivables-payment-period.test.tsx`
- `supabase/migrations/20260912133433_align_receivables_page_payment_period.sql`
- `supabase/migrations/20260912133700_align_receivables_groups_payment_period.sql`
- `supabase/migrations/20260912133702_align_receivables_summary_payment_period.sql`
- `supabase/tests/receivables_payment_period.contract.sql`

Total: 17 arquivos.

## Validação

- Três agentes: backend, frontend/testes e integração; revisão independente aprovada.
- Contrato SQL executado contra as RPCs aplicadas: antecipações, atrasos, extremos do mês, data nula, pendentes e Todos.
- RBAC: anônimo e autenticado sem escopo recusados; privilégios preservados.
- Aceite real: indicador, cinco grupos e cinco parcelas totalizam R$ 1.300,00 em setembro, igual ao Caixa.
- Outros totais reais preservados: pendentes, cancelados, vencidos e Todos.
- 24 testes de utilitários/período e quatro testes de apresentação, relatório e cache passaram.
- Nove testes do PDF financeiro nativo passaram; página de amostra renderizada e inspecionada.
- Safari autenticado localhost:3000: Recebidos 5, R$ 1.300,00, expansão com pagamento/valor, PDF real com cinco registros e total correto.
- Screenshot remoto anteriormente desatualizado; smoke funcional confirmado pela árvore acessível, inclusive texto do PDF real.
- Build completo, TypeScript e limite de linhas passaram.

## Entrega

GitHub por MCP, manifesto isolado sobre main remoto.
PR: https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/134
Backend aplicado. Frontend em PR/Preview; merge e publicação de frontend em produção não realizados.
Dados pessoais e identificadores de recebimentos não integram os arquivos publicados.
