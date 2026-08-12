# Lote ativo

Estado: `EM_PUBLICACAO`

## Lote: 2026-08-12-central-relatorios-financeiros

- Estado: EM_PUBLICACAO.
- Objetivo: concluir a Central de Relatórios Financeiros com resumos canônicos, inadimplência por aging e fluxo de caixa realizado versus projetado.
- Escopo incluído: preservar os cinco relatórios separados já em trabalho local (extrato, entradas, saídas, receitas e despesas); incluir resumo por categoria, composição das entradas e fluxo de caixa; substituir a inadimplência legada por RPC segura, filtros e PDF vetorial.
- Fora de escopo: alterar títulos históricos, criar cobranças, modificar cálculo de empréstimos/rateios, reimplementar o DRE legado ou orçamento versus realizado.
- Regras aplicáveis: GitHub e Supabase exclusivamente por MCP; cálculos e agregações somente no backend/RPC; PDF vetorial com Blob canônico; RBAC de Relatórios por escopo de polo e exposição mínima de dados pessoais.
- Critérios de aceite: cada cartão usa contrato financeiro canônico; receita/despesa permanecem por competência e entrada/saída por caixa; resumos usam todos os registros filtrados, não a prévia limitada; inadimplência usa saldo residual, data de corte e faixas de atraso; 21 testes contratuais, 5 testes de cache/Realtime, TypeScript, lint e `deno check` aprovados. O smoke autenticado permanece pendente por indisponibilidade de navegador conectado.
- Publicação: autorizada em 2026-08-12. `asaas-api` v78 foi publicada e a migration remota `20260812141118_add_financial_report_summaries_and_ar_aging` foi aplicada. O frontend deste lote está em publicação por commit isolado.
