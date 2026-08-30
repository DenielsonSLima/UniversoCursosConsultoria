# Lote ativo

Estado: `CONCLUÍDO`

## Lote: 2026-08-29-selecao-banese-importados-verificados

- Pedido: esclarecer e corrigir os itens de conciliação Banese de Radiologia e T42, sem baixa manual, e publicar a correção em produção/GitHub.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-29-selecao-banese-importados-verificados.md`.
- Autorização: o usuário autorizou correção financeira em produção e publicação no GitHub.
- Risco: crítico — leitura de pagamentos e baixa automática.

### Resultado confirmado

1. Os 32 itens não eram pagamentos perdidos nem histórico acadêmico: 19 eram importados de Radiologia e 13 eram cobranças T42 vigentes. Nenhum foi baixado, reemitido, cancelado ou reaberto.
2. Os 13 títulos T42 (rematrícula e 12 parcelas de Adenize) permanecem `PENDENTE`, sem pagamento, baixa ou duplicidade. O histórico `SISTEMA_ANTERIOR` segue fora da seleção.
3. Das 19 consultas de Radiologia, 17 retornaram oficialmente `PENDING`; os dois restantes (`000096578` e `000096691`) estão `PENDENTE/PENDING`, em `READY`, sem mensagem de revisão e sem quarentena. A última consulta do segundo expirou sem resposta bancária, registrada apenas como telemetria.
4. Não há recebimento Banese dos importados de Radiologia no intervalo de 26 a 29 de agosto de 2026.
5. A causa técnica foi a combinação de normalização de Nosso Número de legado com RPCs de persistência que excediam a janela e esgotavam o pool REST do Supabase; não foi capacidade de importação nem dado de histórico.

### Correção em produção

- Edge Function `banese-reconciliation-worker` v83 ativa.
- Consultas de legado usam Nosso Número normalizado e, quando o retorno é pendente, não escrevem snapshot histórico nem alteram o título.
- GET Banese e RPC de persistência respeitam cancelamento; locks da RPC foram limitados.
- Timeout/rede permanecem no histórico de auditoria, sem virar revisão financeira do recebível.
- O pool REST foi recuperado com encerramento controlado de conexões órfãs; chamadas em trânsito sofreram rollback.

### Validação

- 35 testes Deno focados e 1 contrato Node aprovados antes da publicação; 11 testes complementares aprovados após a guarda de timeout.
- Smoke remoto: autenticação do worker, reserva do lote e leituras REST voltaram a responder 200; duas execuções técnicas foram encerradas com retorno à fila, sem baixa.
