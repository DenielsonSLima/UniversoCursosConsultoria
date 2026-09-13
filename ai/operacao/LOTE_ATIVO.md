# Lote ativo

Estado: CAIXA INDICADORES MENSAIS — FECHAMENTO 4.8.51 EM ANDAMENTO

## Lote: 2026-09-12-caixa-indicadores-mensais

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-caixa-indicadores-mensais.md`

- Pedido: inadimplência e margem do Caixa para o mês e polo selecionados. Usuário acrescentou antes do PR uma linha laranja de inadimplência no gráfico Movimentação dos últimos três meses, calculada pela mesma regra RPC mensal.
- RPC usa principal vencido não liquidado no corte sobre principal elegível com vencimento no mês/polo. Pagamento posterior mantém a posição histórica; desconto em pagamento até o corte quita o principal. Proesc sem prova fica fora das bases com metadados de conferência.
- Preservar seleção mês/polo, pagamentos e demais indicadores. Não acrescentar cálculo financeiro no frontend.
- Base PR144/4b513e085dcb6c0dcf133cf9c0975f28a0023caf. Versão preparada 4.8.51/revisão 60; migration aplicada/imutável, SQL real e paridade dashboard/PDF aprovados. Julho Matriz: R$ 8.676,90/R$ 38.806,30 = 22,36%; 39 obrigações/R$ 11.035,20 em conferência.
- Manifesto final de 26 arquivos, incluindo série mensal/linha laranja e teste do gráfico; duas migrations aplicadas/imutáveis. 64 testes, TypeScript global, ESLint, SQL real/dashboard/PDF e gráfico desktop/mobile aprovados. Build final aprovado em 7,42 segundos; smoke autenticado do Caixa setembro recuperado na versão pública 4.8.50, confirmando RPC novo R$ 4.288,30/25,98%; smoke dos novos rótulos/linha na 4.8.51 ainda pendente após deploy. Negativa específica para usuário restrito sem fixture ativa; guardas sem identidade/privilégios aprovadas. Série validada: julho R$ 8.676,90, agosto R$ 4.198,50 e setembro R$ 4.288,30. PR145 criado; produção e smoke final pendentes. RAG indexado pelo coordenador. Histórico detalhado permanece nos registros abaixo.

## Entregas anteriores

- Conciliação4.8.50: PR144/squash4b513e0, Vercel e HTTP200 confirmados; smoke final acompanhado pelo coordenador. Manifesto e provas: `ai/operacao/registros/alteracoes/2026-09-12-conciliacao-origem-proesc-banese.md`.
- Importação4.8.49: PR143/squash58a6675, nove turmas,392matrículas e385pessoas; 2.535 cobranças em conferência e umCPFpendente. Detalhes: `ai/operacao/registros/alteracoes/2026-09-12-proesc-importacao-xls.md`.
- Financeiro4.8.47: PR141/squashe026a0f, Banese e composiçãoProesc com prova; ActionsQUEUED não equivale aCIaprovado. Registro: `ai/operacao/registros/alteracoes/2026-09-12-revisao-banese-proesc.md`.
