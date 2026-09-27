# Lote ativo

Estado: PUBLICADO EM PRODUÇÃO — VERSÃO 4.8.111

## Lote: 2026-09-27-convenios-financeiros

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-27-convenios-financeiros.md`

- Novo razão auxiliar mensal para recursos vinculados a convênios, sem duplicar entradas ou saídas no Caixa.
- Competência fecha manualmente e pode carregar o saldo final para o mês seguinte sem reconhecer nova receita.
- Contas a Pagar pode vincular a despesa atomicamente a uma competência aberta do mesmo polo.
- Caixa e relatório v7 exibem a posição separada, mantendo os valores no total geral somente por seus lançamentos financeiros originais.
- Nove migrations foram aplicadas no Supabase de produção; smoke transacional com rollback validou crédito, despesa, extrato, Caixa, fechamento e transporte sem deixar resíduos.
- Publicação atômica registrada na versão 4.8.111; o aviso do advisor sobre a RPC `SECURITY DEFINER` é intencional, pois a função valida permissão e escopo antes de retornar dados.
