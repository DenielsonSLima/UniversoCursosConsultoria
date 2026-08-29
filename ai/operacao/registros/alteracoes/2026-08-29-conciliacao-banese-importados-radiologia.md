# Hotfix Banese — conciliação segura de importados

Data: 2026-08-29  
Estado: preparado para publicação atômica no GitHub

## Pedido e apuração

Foram investigados os erros mostrados no painel de conciliação Banese, com
separação entre histórico acadêmico, boletos importados e títulos emitidos pelo
sistema. A importação em lote não apresentou limitação de API: importar 15 mil
boletos é um fluxo diferente da consulta e persistência da conciliação.

O painel continha 363 eventos históricos: 154 vieram de importações legadas
Banese, 208 pertenciam às tentativas dos 13 títulos do incidente de recovery e
houve um evento isolado. O histórico puro de turma não é candidato à fila.

## Correções aplicadas

1. A reserva automática de conciliação exclui transações marcadas como
   `BANESE_API_LEGACY_DISCOVERY`. Esses registros não são emissão canônica do
   sistema e, em parte dos casos, possuem divergência de identidade bancária.
2. A RPC de persistência aceita `service_role` tanto em `request.jwt.claim.role`
   quanto em `request.jwt.claims`. O worker deixou de ser bloqueado ao registrar
   uma consulta válida.
3. O reparo de auditoria Banese não fabrica transação a partir dos campos locais
   de um recebível. Sem prova canônica de POST/GET, o título continua fora da
   automação.
4. Se a negação de persistência voltar a ocorrer, o worker a classifica como
   falha de auditoria, em vez de mascará-la como `QUERY_ERROR`.

A seleção continua limitada a títulos em aberto (`PENDENTE`, `VENCIDO` ou
`AGUARDANDO_CONFIRMACAO`), com Nosso Número de nove dígitos e identidade
canônica compatível. Nenhum título foi reemitido, cancelado ou baixado por este
hotfix.

## Recebimentos de Radiologia

Consulta agregada no banco para 26–29/08/2026:

- 300 boletos de Radiologia foram importados pela API Banese;
- 12 foram importados pelo portal Banese legado;
- nenhum desses 312 boletos teve pagamento/baixa registrado no período;
- nos 300 importados pela API há 45 títulos pagos no histórico, mas nenhum nas
  datas consultadas.

## Migrations aplicadas

| Arquivo | ID remoto | SHA-256 |
| --- | --- | --- |
| `20260829194500_exclude_legacy_banese_imports_from_automatic_reconciliation.sql` | `20260829224818` | `a858bf7ecf13f3e4bd8095c9539660f51dce459c9347d6b8f66358fd30f3fe2a` |
| `20260829194600_fix_banese_reconciliation_service_role_claims.sql` | `20260829224800` | `e6c92e110241a7f337c87a50d35988ee5171c64e6c81db8b189a098521c38678` |

As duas migrations foram relidas no banco: a guarda de `request.jwt.claims` e a
exclusão de importados legados estão ativas.

## Runtime

As duas migrations já estão em produção. Esta publicação versiona também a
classificação preventiva do worker e a recusa de auditoria local Banese; elas
entram no runtime no próximo deploy explícito das Edge Functions, que não faz
parte deste pedido de atualização do GitHub.

## Validação

- testes focados de migrations, router, classificação de erro e recovery: aprovados;
- a consulta remota confirmou zero recebimentos importados de Radiologia entre
  26 e 29/08;
- a validação remota confirmou as duas guardas aplicadas;
- todos os arquivos manuais deste manifesto têm até 500 linhas; migrations
  aplicadas são exceções históricas imutáveis.

## Manifesto explícito

Total: 12 arquivos (5 modificados, 7 adicionados, 0 removidos)

### Modificados

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/migrations-aplicadas.json`
- `supabase/functions/gateways/router.ts`
- `supabase/functions/gateways/router.test.ts`

### Adicionados

- `ai/operacao/registros/alteracoes/2026-08-29-conciliacao-banese-importados-radiologia.md`
- `supabase/functions/banese-reconciliation-worker/error-classification.ts`
- `supabase/functions/banese-reconciliation-worker/error-classification.test.ts`
- `supabase/migrations/20260829194500_exclude_legacy_banese_imports_from_automatic_reconciliation.sql`
- `supabase/migrations/20260829194600_fix_banese_reconciliation_service_role_claims.sql`
- `supabase/tests/banese_legacy_import_queue_exclusion.contract.test.ts`
- `supabase/tests/banese_reconciliation_service_role_claims.contract.test.ts`

### Exclusões

Os 13 títulos recuperados permanecem em quarentena e nenhuma retentativa
financeira, baixa, cancelamento ou emissão é parte desta publicação.
