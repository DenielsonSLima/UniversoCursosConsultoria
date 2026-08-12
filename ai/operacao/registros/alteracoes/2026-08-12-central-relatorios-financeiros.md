# Alteração — Central de Relatórios Financeiros

- Lote: 2026-08-12-central-relatorios-financeiros
- Estado no fechamento: PUBLICADO
- Projeto Supabase: kfekgwyqozhicpfuunpo

## Resultado

- Foram preservadas as cinco visões financeiras já iniciadas localmente: extrato por conta, entradas, saídas, receitas e despesas.
- A Central passa a oferecer:
  - resumo por categoria, com receitas, despesas, resultado operacional e saldo em aberto;
  - resumo de entradas, com classificação, total e participação;
  - fluxo de caixa realizado até hoje e projetado até o fim do período;
  - inadimplência por data de corte, faixas de aging e saldo residual.
- Receita e despesa continuam sendo competência; entrada e saída continuam sendo caixa realizado.
- Resumos são agregados no PostgreSQL sobre todos os movimentos filtrados, antes do limite de 1.000 linhas da prévia.
- O relatório financeiro mensal legado deixou de solicitar `asaas_status` e `asaas_invoice_url`, que não eram exibidos; o histórico técnico continua preservado nas cobranças.

## Banco e segurança

- A migration 20260812141118_add_financial_report_summaries_and_ar_aging.sql evolui o contrato canônico de movimentação com agregações por categoria, classificação e origem.
- Foram criadas as RPCs seguras get_relatorio_fluxo_caixa_secure e get_relatorio_inadimplencia_secure, ambas com RBAC do módulo Relatórios por polo, SECURITY DEFINER, search_path vazio e EXECUTE revogado de PUBLIC/anon.
- A inadimplência calcula saldo na data de corte, respeita pagamentos posteriores, pagamentos parciais, desconto em baixa manual, estorno e o fuso America/Maceio.
- O estorno de baixa manual agora grava manual_settlement_reversed_at sob CAS, preservando o histórico de corte para eventos futuros.
- A lista operacional com contato permanece atrás da autorização de Relatórios; exportação é PDF vetorial e é bloqueada quando a lista está truncada.

## Validações

- Âncoras da função financeira aplicada foram verificadas por consulta remota somente leitura antes da migration.
- tsc --noEmit, ESLint focal e deno check supabase/functions/asaas/api/index.ts aprovados.
- Testes focados de contrato: 21/21; Query keys e Realtime: 5/5.
- git diff --check aprovado para arquivos rastreados e novos.
- O servidor local iniciou corretamente, mas o smoke autenticado de interface ficou pendente: não havia navegador conectado nesta sessão.

## Publicação e limite conhecido

- Produção foi autorizada em 2026-08-12. A Edge Function `asaas-api` foi publicada como v78, com JWT obrigatório, preservando 77 arquivos remotos e alterando somente `asaas/api/index.ts`.
- A migration `20260812141118_add_financial_report_summaries_and_ar_aging` foi aplicada ao projeto `kfekgwyqozhicpfuunpo`. As RPCs estão com `SECURITY DEFINER`, `search_path` vazio, execução negada a `anon` e permitida somente a `authenticated` sob RBAC interno.
- A PR [#70](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/70) passou pelos gates de qualidade e versão, foi mesclada em `main` no commit [`d9d85fa4`](https://github.com/DenielsonSLima/UniversoCursosConsultoria/commit/d9d85fa44ddd4b97e95e472c3c353547bac4c431) e a [implantação Vercel de Produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/6qKVKoq7gj1Ha7coXpr2oF5ooVxf) concluiu com sucesso.
- Um corte histórico não é reconstituição contábil absoluta para cancelamentos, estornos ou suspensões legados sem evento datado: esses estados ainda refletem o registro atual. Para auditoria histórica integral, será necessário um razão de eventos de status.

## Manifesto

- modules/gestor/relatorios/RelatoriosPage.tsx
- modules/gestor/relatorios/relatorios.service.ts
- modules/gestor/relatorios/relatorios.query-keys.ts
- modules/gestor/relatorios/relatorios.query-keys.test.ts
- modules/gestor/relatorios/hooks/useRelatoriosRealtime.ts
- modules/gestor/relatorios/relatorios.realtime.ts
- modules/gestor/relatorios/relatorios.realtime.test.ts
- modules/gestor/relatorios/components/RelatorioMovimentacaoFinanceira.tsx
- modules/gestor/relatorios/components/RelatorioResumoFinanceiro.tsx
- modules/gestor/relatorios/components/RelatorioFluxoCaixa.tsx
- modules/gestor/relatorios/components/RelatorioInadimplencia.tsx
- modules/gestor/relatorios/relatorios.financeiro-separado.contract.test.ts
- modules/gestor/relatorios/relatorios.financeiro-resumos.contract.test.ts
- supabase/migrations/20260812141118_add_financial_report_summaries_and_ar_aging.sql
- supabase/tests/relatorios_financeiros_resumos_e_inadimplencia.contract.test.ts
- supabase/functions/asaas/api/index.ts
- supabase/functions/asaas/api/manual-settlement-reversal.contract.test.ts
