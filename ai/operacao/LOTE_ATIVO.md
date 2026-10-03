# Lote ativo

## Lote: 2026-10-03-proesc-desconto-liquido

Estado: regra aplicada e paridade confirmada no banco; publicação 4.8.156 autorizada e condicionada à CI final. Provas individuais incorporadas com auditoria privada. Versão local 4.8.155 reservada para trabalho paralelo, preservado.
Objetivo: parcelas Proesc confirmadas PAGA, com recebido inferior ao nominal e composição ausente, usam a diferença como desconto líquido calculado conforme orientação expressa do responsável.
Aceite: preservar provas explícitas, pagamentos parciais, valores recebidos, datas, saldos e corte operacional em 01/10/2026; não inventar tarifa nem meio de pagamento. Não escrever no Proesc.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-03-proesc-desconto-liquido.md` (8 arquivos).
Validação: ensaio SQL isolado, revisão independente, aplicação MCP, paridade de recebimentos/abertura e CI do manifesto remoto. Smoke autenticado depende de sessão disponível.
Base remota: main `0ad684e3d577e37508124b55a81f97c9e2805ea0`, versão 4.8.154; propostas de renegociação e demais trabalhos paralelos serão preservados.
Histórico: `ai/operacao/registros/alteracoes/2026-10-03-proesc-composicao-automatica.md` e `ai/operacao/registros/alteracoes/2026-10-02-renegociacoes-propostas.md`.
