# Lote ativo

Estado: `CONCLUÍDO`

## Lote: 2026-08-30-hotfix-banese-timeout-pool

- Pedido: descobrir a origem da CPU a 100% depois da conciliação Banese,
  corrigir sem upgrade e publicar o hotfix em produção/GitHub.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-08-30-hotfix-banese-timeout-pool.md`.
- Autorização: o usuário autorizou correção financeira, produção e GitHub.
- Risco: crítico — consulta bancária, baixa automática e infraestrutura.

### Diagnóstico confirmado

1. O volume do Banese não era o gargalo. A fila tem somente recebíveis Banese
   pendentes com Nosso Número e identidade conciliável; histórico com
   `origem_pagamento = SISTEMA_ANTERIOR` permanece fora.
2. O worker P3 cortava consultas em oito segundos e podia abandonar RPCs
   PostgREST. Isso deixava runs incompletos e conexões repetindo transações.
3. O campo derivado `is_legacy_import` era enviado por engano no snapshot CAS.
   Quando o Banese indicava pagamento, a RPC detectava uma falsa mudança e
   lançava SQLSTATE `40001`; a cadeia CAS/PostgREST repetia o contexto
   transacional em laço, elevando a CPU e degradando o Auth.
4. A indicação genérica `orders` do painel não corresponde a tabela, cron ou
   rotina deste projeto.

### Correção em produção

- Edge Function `banese-reconciliation-worker` v89 ativa.
- O deadline local cancela somente OAuth/GET do Banese; não abandona RPC de
  persistência. A espera artificial de drenagem foi removida.
- O snapshot CAS contém somente as 13 chaves canônicas; marcadores derivados
  de importação não entram na comparação financeira.
- Os três conflitos CAS da RPC agora retornam `PT409`, sem retry automático.
- RPCs críticas mantêm `lock_timeout = 2s` e `statement_timeout = 7s`.
- Timeout/rede continuam auditáveis, sem virar baixa ou revisão financeira.
- Uma resposta pendente válida de boleto importado limpa por CAS somente os
  dois marcadores genéricos de conciliação; baixa, status, valor e auditoria
  histórica não são alterados.
- Todos os crons críticos, inclusive conciliação e cancelamento Banese, foram
  restaurados depois da observação e dos canários aprovados.

### Validação atual

- 32 testes do worker, 28 do fluxo focado de persistência/importação, 49
  contratos Banese e 11 testes Node passaram; `deno check` e `deno fmt --check`
  aprovados. A simulação local também confirmou 60 sucessos e o tratamento de
  HTTP 429 sem medir o limite real do banco.
- Função remota verificada: 3 guardas `PT409`, 0 guardas `40001`,
  `SECURITY DEFINER` e limites de 2s/7s preservados.
- Após encerrar somente as conexões órfãs do canário, a taxa anormal caiu de
  cerca de 1.760 chamadas/s para 0,0; sem transação ociosa ou bloqueio.
- Dois canários finais concluíram 2/2 em 2,15 s e 2/2 em 1,68 s, ambos com uma
  resposta pendente, uma paga e zero falha. Os importados de Radiologia
  `000096578` e `000096691` foram baixados pela resposta oficial do Banese:
  pagamento em 28/08/2026, R$ 240,00 cada, sem baixa manual.
- Encerrada a estabilidade, o cron real concluiu 18/18 em 10,63 s e zero
  falha. A v89 reconsultou os 17 marcadores antigos em 9,97 s: 17 pendentes,
  zero pago, zero falha e zero throttling. O estado final ficou com 0 marcador
  atual, 0 em revisão, 0 pago na fila, 0 lease e 0 lock esperando.
- As tentativas antigas continuam na auditoria. O cartão “última hora” perde
  cada timeout automaticamente aos 60 minutos; são 444 tentativas históricas,
  2 ainda dentro da última hora e 0 novo erro depois do hotfix. Esse histórico
  não representa nova consulta de título já pago.
- A suíte adjacente de roteamento ficou em 25/27 por dois testes antigos de
  fallback quando não existe Nosso Número. Esses arquivos não foram alterados;
  a seleção de produção exige Nosso Número explícito, como solicitado.
- Os 19 arquivos do manifesto respeitam o teto de 500 linhas. O verificador
  global ainda aponta somente o arquivo ativo preexistente
  `banese-reconciliation-contract.ts`, com 503 linhas; ele não foi apagado nem
  misturado ao hotfix financeiro.
- Observação final concluída após 11:29:16 BRT, sem nova pressão no banco; os
  cinco crons críticos verificados estão ativos.

### Manifesto explícito

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
