# Banese — conciliação segura de importados e T42

Data: 2026-08-29  
Estado: concluído; Edge Function v83 ativa em produção

## Diagnóstico confirmado

Os 32 itens não eram 32 baixas pendentes: eram 19 boletos importados pela API
Banese na turma de Radiologia e 13 cobranças vigentes da T42. Os 13 títulos da
Adenize (uma rematrícula e 12 parcelas) continuam pendentes; o histórico
`SISTEMA_ANTERIOR` é separado e não entra na conciliação.

Não há recebimento Banese para os importados de Radiologia entre 26 e 29 de
agosto de 2026. Das 19 reconsultas, 17 tiveram retorno oficial `PENDING`. Os
dois que ficaram sem resposta (`000096578` e `000096691`) permanecem
`PENDENTE/PENDING`, em `READY`, sem baixa nem quarentena.

## Causa e correção

O retorno Banese pode remover zeros à esquerda do Nosso Número dos importados.
Depois da normalização, a persistência de snapshot ainda podia exceder a janela
do worker e deixar conexões REST órfãs; essas conexões esgotaram o pool do
PostgREST e geraram tentativas repetidas (`RUN_FAILED`). O volume de importação
não era a causa: importação e consulta são fluxos diferentes.

A correção preserva a baixa automática somente para retorno bancário pago com
detalhe validado. Para legado confirmado como pendente, valida a identidade
necessária e encerra sem gravar snapshot histórico. GET Banese e a RPC de
persistência respeitam cancelamento, a RPC tem limite de lock/duração e timeout
ou rede ficam apenas na auditoria, sem mensagem de revisão financeira no título.

O pool REST foi reinicializado de modo controlado após confirmar que as
conexões eram requisições órfãs de persistência. As transações em andamento
sofreram rollback; dois runs incompletos foram fechados tecnicamente e seus
títulos retornaram à fila sem mutação financeira.

## Validação e limites

- 35 testes Deno e 1 contrato Node do fluxo passaram antes da publicação;
  11 testes adicionais passaram depois da guarda de timeout.
- Edge Function `banese-reconciliation-worker` v83 foi publicada.
- `000096578` e `000096691` não foram baixados nem alterados para pago. A
  consulta de `000096691` excedeu 40 segundos e será tentada pela fila; isso
  é uma indisponibilidade transitória de consulta, não evidência financeira.
- Os registros antigos de erro continuam na auditoria por rastreabilidade; o
  contador de revisão operacional considera apenas estado ativo, que ficou em
  zero.

## Migrations aplicadas

| Arquivo | ID remoto |
| --- | --- |
| `20260829234500_requeue_banese_quarantine_after_normalized_recheck.sql` | `20260830003344` |
| `20260830014000_bound_banese_reconciliation_snapshot_locks.sql` | `20260830013801` |
| `20260830020000_verify_banese_worker_token_without_secret_read.sql` | `20260830014642` |
| `20260830021500_remove_temporary_banese_worker_token_verifier.sql` | `20260830020112` |

## Manifesto explícito

Total: 28 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `ai/operacao/registros/alteracoes/2026-08-29-selecao-banese-importados-verificados.md`
- `supabase/functions/banese/core/adapter/boleto-payment-query.ts`
- `supabase/functions/banese/core/adapter/boleto-query.ts`
- `supabase/functions/banese/core/adapter/boleto-query-pix.test.ts`
- `supabase/functions/banese/core/adapter/utils.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.test.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.ts`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/banese-reconciliation-worker/response.ts`
- `supabase/functions/gateways/api/banese-legacy-import-reconciliation.test.ts`
- `supabase/functions/gateways/api/banese-pix-reconciliation.fixture.ts`
- `supabase/functions/gateways/api/banese-pix-reconciliation.test.ts`
- `supabase/functions/gateways/api/banese-pix-recovery-legacy.test.ts`
- `supabase/functions/gateways/api/banese-pix-recovery.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.test.ts`
- `supabase/functions/gateways/api/banese-reconciliation-persistence.ts`
- `supabase/functions/gateways/api/banese-remote-title-number.test.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/migrations/20260829203000_restore_verified_banese_imports_to_reconciliation.sql`
- `supabase/migrations/20260829234500_requeue_banese_quarantine_after_normalized_recheck.sql`
- `supabase/migrations/20260830014000_bound_banese_reconciliation_snapshot_locks.sql`
- `supabase/migrations/20260830020000_verify_banese_worker_token_without_secret_read.sql`
- `supabase/migrations/20260830021500_remove_temporary_banese_worker_token_verifier.sql`
- `supabase/tests/banese_quarantine_normalized_recheck.contract.test.ts`
- `supabase/tests/banese_reconciliation_persistence_timeout.contract.test.ts`
