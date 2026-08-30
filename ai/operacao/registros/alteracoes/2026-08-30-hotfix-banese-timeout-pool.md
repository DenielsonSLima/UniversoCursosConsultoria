# Banese — hotfix de timeout, CAS e saturação do pool

Data: 2026-08-30  
Estado: concluído; Edge Function v89 ativa em produção

## Pedido e escopo

Diagnosticar a CPU a 100% observada depois da conciliação automática Banese,
corrigir a origem sem aumentar o plano e confirmar que apenas contas a receber
pendentes com Nosso Número são consultadas. O escopo inclui títulos importados
pela API e emitidos pelo sistema; histórico acadêmico puro continua excluído.

## Causa confirmada

O incidente reuniu três falhas de controle:

1. o P3 cortava cada consulta em oito segundos quando havia mais de dois itens;
2. o cliente podia abortar uma RPC PostgREST sem esperar o servidor concluir;
3. `loadBaneseExpectedTransactions` adicionava `is_legacy_import` ao objeto de
   decisão e esse marcador derivado era enviado para a comparação CAS.

Nos importados ainda pendentes, a consulta termina antes da persistência. Quando
o retorno oficial indicava pagamento, a RPC recebia o snapshot com a chave
extra, detectava falsa concorrência e lançava SQLSTATE `40001`. Esse código é
reservado a transação serializável; a cadeia CAS/PostgREST mantinha o contexto
transacional em repetição. Uma única conexão chegou a cerca de 1.760
transações/s e saturou o compute, afetando inclusive o Auth. Não há tabela ou
rotina `orders` responsável pelo incidente.

## Correção

- A consulta usa a janela global restante; o deadline fica apenas em OAuth/GET
  Banese e não é propagado à persistência PostgREST.
- O timeout global de oito segundos do cliente e a drenagem artificial foram
  removidos.
- A persistência recebe somente as 13 chaves de `TRANSACTION_CAS_KEYS`; o
  marcador `is_legacy_import` não entra mais no CAS.
- Os três conflitos reais do CAS retornam `PT409`, encerrando a requisição uma
  vez e preservando o recebível para revisão segura.
- `prepare`, `record`, `finish` e `persist` mantêm lock de 2s e instrução de 7s.
- Falhas transitórias não colocam o título em quarentena nem escrevem erro
  financeiro; toda tentativa continua auditável.
- No atalho seguro de importação legada, uma resposta aberta válida remove por
  CAS apenas os dois textos genéricos de conciliação já resolvidos. Uma corrida,
  título pago ou qualquer marcador operacional diferente permanece intocado.

## Integridade financeira observada

- Produção mantém 236 títulos válidos `READY`: 213 importados pela API e 23
  emitidos pelo sistema; histórico `SISTEMA_ANTERIOR` na fila: 0.
- O primeiro canário processou 20: 18 permaneceram pendentes, 0 baixas e 2
  timeouts técnicos. O segundo expôs o laço CAS sem concluir baixa.
- Após a correção v88, dois canários concluíram 2/2 em 2,15 s e 2/2 em 1,68 s,
  sem falha. Os dois alvos importados de Radiologia foram confirmados como
  pagos pelo Banese: Nosso Número `000096578` e `000096691`, data 28/08/2026,
  R$ 240,00 cada. Ambos ficaram `PAGO`, origem `BANESE`, evidência `API` e sem
  baixa manual.
- Histórico `SISTEMA_ANTERIOR` presente na fila depois dos canários: 0.
- Nenhum POST de emissão, cancelamento, baixa forçada ou alteração manual foi
  executado.
- Depois da estabilidade, o cron real concluiu 18/18 em 10,63 s, todos ainda
  pendentes no banco e sem falha. A v89 repetiu exclusivamente os 17 títulos
  com marcador antigo: 17/17 em 9,97 s, todos pendentes, sem falha ou 429. Os
  marcadores atuais ficaram em 0; revisão, pagos em `READY`, leases e locks
  esperando também ficaram em 0.

## Produção e infraestrutura

- Worker v89 ativo e artefato remoto conferido.
- Migrations remotas: `20260830133312`, `20260830133832` e
  `20260830135741`.
- Três conexões órfãs foram encerradas individualmente por PID, assinatura e
  horário do canário; cada transação incompleta foi revertida.
- A taxa anormal caiu de aproximadamente 1.760 chamadas/s para 0,0; sem sessão
  ociosa em transação, bloqueio ou RPC Banese longa.
- WhatsApp financeiro, WhatsApp de aniversário, push, conciliação e
  cancelamento Banese estão ativos depois da observação estável.

## Validação

- 32 testes unitários do worker passaram.
- 28 testes de persistência, intenção, importação legada e Pix passaram.
- 49 contratos Banese de fila, timeout, importação, autorização, CAS e
  cancelamento passaram.
- 11 testes Node de controle passaram; a simulação local confirmou 60 sucessos
  e o tratamento do HTTP 429, sem inferir o limite real do Banese.
- `deno check` do worker e `deno fmt --check` dos arquivos do lote passaram.
- A RPC remota tem 3 guardas `PT409`, 0 `40001`, `SECURITY DEFINER`,
  `lock_timeout=2s` e `statement_timeout=7s`.
- A suíte adjacente de roteamento ficou em 25/27 por dois testes preexistentes
  de fallback sem Nosso Número; os arquivos estão fora do manifesto e a fila
  produtiva exige Nosso Número explícito.
- Todos os 19 arquivos do manifesto têm até 500 linhas. A checagem global
  mantém uma única dívida preexistente: `banese-reconciliation-contract.ts`
  tem 503 linhas e, por ser fonte ativa, não foi apagado.
- Observação final concluída depois de 11:29:16 BRT. As linhas antigas da aba
  Erros continuam como auditoria imutável: 444 tentativas históricas, 2 ainda
  dentro da última hora e 0 erro novo depois do hotfix. O cartão deixa de
  contar cada timeout aos 60 minutos e não dispara consulta em título pago.

## Manifesto explícito

Total: 19 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-30-hotfix-banese-timeout-pool.md`
- `scripts/test-banese-reconciliation-control.mjs`
- `supabase/functions/banese-reconciliation-worker/error-classification.test.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.ts`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/banese-reconciliation-worker/pacing.test.ts`
- `supabase/functions/banese-reconciliation-worker/pacing.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.test.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.ts`
- `supabase/functions/gateways/api/banese-legacy-import-reconciliation.test.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/migrations/20260830104000_harden_banese_timeout_drain.sql`
- `supabase/migrations/20260830105000_reclassify_banese_canary_postgrest_timeouts.sql`
- `supabase/migrations/20260830112000_stop_banese_cas_retry_loop.sql`
- `supabase/tests/banese_reconciliation_cas_retry.contract.test.ts`
- `supabase/tests/banese_reconciliation_timeout_drain.contract.test.ts`
