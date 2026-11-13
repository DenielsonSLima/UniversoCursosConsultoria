# Índice operacional da fila Proesc V2

Status: índice aplicado e validado em produção em 06/10/2026. Este documento
registra a operação avulsa; sua publicação não executa SQL.

## Identidade e escopo

- Projeto Supabase: `kfekgwyqozhicpfuunpo`.
- PostgreSQL observado: 17.6.
- Tabela: `internal_proesc.v2_invoice_observations`.
- Índice: `internal_proesc.proesc_v2_invoice_staged_task_id`.
- Base auditada: `c5315f327f48429a3a09314215aadee01d8b3ef2` / 4.8.174.
- Mudança autorizada: somente um índice não único, parcial, em `(task_id, id)`.
- Permanecem os contratos de `COUNT`, lote de 20, locks, replay, auditoria,
  cadência, RLS, privilégios, PK e UNIQUE existentes.

Não usar este procedimento para apagar registros, alterar workers ou ajustar
retenção. Observações e snapshots Proesc são evidências duráveis; a API de
origem não deve ser presumida suficiente para reconstruí-los.

## Causa e consulta atendida

O ramo `apply` de `public.proesc_v2_runtime_service` seleciona até 20 IDs com
`task_id = ... AND result = 'STAGED' ORDER BY id FOR UPDATE` e depois executa
`COUNT(*)` com o mesmo filtro. Antes da correção, os índices eram somente a PK
por `id`, o UNIQUE por `(run_id, unit_id, invoice_id)` e `(link_id, observed_at)`.
O histórico acumulado era percorrido repetidamente.

O novo B-tree restringe a tarefa e fornece a ordem por ID. O predicado STAGED
permanece literal nas duas consultas, inclusive quando `task_id` é parâmetro.
`FOR UPDATE` ainda visita o heap para bloquear as linhas escolhidas; não se
promete um index-only scan nessa seleção. O COUNT pode aproveitar o índice,
sem alterar o valor `remaining` retornado pelo RPC.

## 1. Pré-verificação estrita, somente leitura

Usar exclusivamente o MCP Supabase e conferir o seletor do projeto antes de
qualquer SQL. A consulta abaixo não cria nem modifica objetos.

```sql
WITH target AS (
  SELECT
    to_regclass('internal_proesc.v2_invoice_observations') AS table_oid,
    to_regclass('internal_proesc.proesc_v2_invoice_staged_task_id') AS index_oid
), inspected AS (
  SELECT t.*, i.indrelid, i.indisvalid, i.indisready, i.indislive,
    i.indisunique, i.indisprimary, i.indisexclusion,
    CASE WHEN i.indexrelid IS NOT NULL
      THEN pg_get_indexdef(i.indexrelid) END AS definition,
    CASE WHEN i.indexrelid IS NOT NULL
      THEN pg_get_expr(i.indpred, i.indrelid) END AS predicate
  FROM target t
  LEFT JOIN pg_index i ON i.indexrelid = t.index_oid
)
SELECT current_timestamp AS checked_at, current_database() AS database_name,
  CASE
    WHEN table_oid IS NULL THEN 'STOP_TARGET_MISSING'
    WHEN index_oid IS NULL THEN 'ABSENT'
    WHEN indrelid = table_oid
      AND indisvalid AND indisready AND indislive
      AND NOT indisunique AND NOT indisprimary AND NOT indisexclusion
      AND definition = 'CREATE INDEX proesc_v2_invoice_staged_task_id ON internal_proesc.v2_invoice_observations USING btree (task_id, id) WHERE (result = ''STAGED''::text)'
      AND predicate = '(result = ''STAGED''::text)'
    THEN 'VALID_EXPECTED'
    ELSE 'STOP_DRIFT_OR_INVALID'
  END AS verification,
  definition, predicate, indisvalid, indisready, indislive, indisunique
FROM inspected;
```

- `VALID_EXPECTED`: encerrar a instalação sem executar DDL. Este é o estado
  verificado em produção; o procedimento é idempotente por validação.
- `ABSENT`: não significa autorização para criar. Em ambiente autorizado,
  verificar também índices equivalentes sob outro nome e builds em andamento.
- `STOP_*`: interromper e revisar. Não remover, renomear, reconstruir ou
  substituir automaticamente um objeto divergente ou inválido.
- Uma diferença de representação do catálogo entre versões do PostgreSQL
  exige revisão explícita; não afrouxar a comparação para apenas o nome.

```sql
SELECT c.relname AS index_name, pg_get_indexdef(i.indexrelid) AS definition,
  i.indisvalid, i.indisready, i.indislive
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = to_regclass('internal_proesc.v2_invoice_observations');

SELECT pid, command, phase, index_relid::regclass AS index_name,
  blocks_total, blocks_done
FROM pg_stat_progress_create_index
WHERE relid = to_regclass('internal_proesc.v2_invoice_observations');
```

## 2. DDL histórico e eventual reprodução autorizada

O comando abaixo foi executado uma única vez, isoladamente, pelo MCP Supabase
`execute_sql`, em 06/10/2026. A resposta de sucesso foi observada às 12:43:30 UTC.
Não executar novamente no projeto que já retornou `VALID_EXPECTED`.

```sql
CREATE INDEX CONCURRENTLY proesc_v2_invoice_staged_task_id
ON internal_proesc.v2_invoice_observations (task_id, id)
WHERE result = 'STAGED';
```

`CONCURRENTLY` exige comando fora de bloco transacional. Não envolver em
`BEGIN`, `DO`, função ou runner que adicione transação. Não substituir pela
construção bloqueante se a rota recusar a forma concorrente. `IF NOT EXISTS`
foi deliberadamente omitido: ele não valida a definição do objeto existente.

A construção concorrente faz trabalho adicional de leitura e pode aguardar
transações. Timeout ou resposta incerta não autorizam repetir o comando:
consultar catálogo e progresso primeiro. Uma falha pode deixar índice inválido
que ainda custa manutenção; sua recuperação exige revisão separada.

## 3. Verificações posteriores, sem executar o worker

Repetir a pré-verificação estrita. Confirmar também ausência de build pendente.
`pg_get_indexdef` não contém a palavra CONCURRENTLY; a forma de construção é
comprovada pelo comando registrado, não pela definição final do catálogo.

Os planos abaixo usam UUID deliberadamente fictício, o mesmo antes e depois
da correção. `EXPLAIN` sem ANALYZE não executa a consulta nem processa títulos.
Ele comprova o caminho escolhido pelo otimizador, não uma latência medida.

```sql
EXPLAIN (COSTS TRUE, FORMAT JSON)
SELECT id
FROM internal_proesc.v2_invoice_observations
WHERE task_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND result = 'STAGED'
ORDER BY id
LIMIT 20
FOR UPDATE;

EXPLAIN (COSTS TRUE, FORMAT JSON)
SELECT count(*)
FROM internal_proesc.v2_invoice_observations
WHERE task_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND result = 'STAGED';
```

Resultados observados:

- Catálogo independente às 12:44:49 UTC: definição esperada, não único,
  `indisvalid`, `indisready` e `indislive` verdadeiros.
- Tamanho inicial informado pelo executor: 212.992 bytes.
- Seleção: `Index Scan -> LockRows -> Limit`.
- COUNT: `Index Only Scan -> Aggregate`; visitas ao heap ainda dependem da
  visibilidade das páginas em execuções reais.
- 38 usos naturais às 12:44:10 UTC e 80 às 12:47:09 UTC.

## 4. Evidência de desempenho e limites

Comparação de tráfego normal do RPC, `queryid = 5812891448349558957`:

| Janela UTC de 06/10/2026 | Chamadas | Blocos lidos | Blocos por chamada |
| --- | ---: | ---: | ---: |
| 12:36:14 a 12:38:35, antes | 58 | 946.434 | 16.317,83 |
| 12:44:10.510530 a 12:47:09.824179, depois | 40 | 1.597 | 39,925 |

A redução observada foi 99,755% nas leituras de buffers por chamada. O tempo
médio observado caiu de aproximadamente 1.277,77 ms para 63,618 ms. Não houve
blocos temporários atribuídos ao RPC nessas janelas. O reset e o contador de
desalocação de `pg_stat_statements` permaneceram iguais.

As ações dentro do RPC variaram naturalmente; isso não é benchmark controlado.
Blocos lidos pelo PostgreSQL não equivalem necessariamente a bytes físicos de
disco, pois o cache do sistema operacional pode atendê-los. A recuperação do
Disk IO Budget deve ser conferida nas métricas do provedor, separadamente.

Para nova medição, usar snapshots de `pg_stat_statements` do mesmo queryid,
papel e banco, guardando horário e reset. Comparar deltas de `calls`,
`total_exec_time`, `shared_blks_read`, `shared_blks_hit`, `temp_blks_written`
e `wal_bytes`. Não zerar estatísticas e não invocar RPC mutante como teste.

## Registro formal e lacunas

- Esta operação foi avulsa; não houve `apply_migration` nem linha criada no
  ledger de migrations. Não inventar versão remota ou backfill do ledger.
- As migrations já aplicadas permanecem imutáveis.
- Este runbook registra reconstrução assistida, com autorização e validação;
  não instala automaticamente o índice em ambientes novos.
- Uma integração futura ao mecanismo oficial de migrations precisa respeitar
  a execução não transacional e a política do repositório: Supabase somente
  via MCP, sem CLI. Essa integração não faz parte deste registro documental.
- Nenhuma alteração de produto, nova versão, merge, limpeza ou deploy manual
  é produzida por estes documentos.

## Fontes

- [Consultas da fila na base auditada](https://github.com/DenielsonSLima/UniversoCursosConsultoria/blob/c5315f327f48429a3a09314215aadee01d8b3ef2/supabase/migrations/20261002010300_proesc_v2_persistent_runtime.sql#L234-L249).
- [Esquema e índices originais](https://github.com/DenielsonSLima/UniversoCursosConsultoria/blob/c5315f327f48429a3a09314215aadee01d8b3ef2/supabase/migrations/20261002010000_proesc_v2_ingestion_schema.sql#L50-L66).
- [PostgreSQL 17: índices parciais](https://www.postgresql.org/docs/17/indexes-partial.html).
- [PostgreSQL 17: construção concorrente](https://www.postgresql.org/docs/17/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY).
- [Registro da alteração](../../../ai/operacao/registros/alteracoes/2026-10-06-proesc-v2-indice-fila.md).
