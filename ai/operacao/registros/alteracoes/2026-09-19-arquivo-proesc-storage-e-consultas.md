# Arquivo Proesc no Storage e consultas após baixa

Registro técnico público. Métricas internas e totais financeiros foram omitidos.

## Comportamento implementado


- Recibos técnicos SNAPSHOT e APPLY/UNCHANGED completos passam a ser elegíveis após 6 horas, desde que não tenham referências financeiras protegidas. A janela inicial de 24 horas foi reduzida após testes das fronteiras e da recuperação.
- O bucket `proesc-history` é privado. Arquivos gzip imutáveis recebem até 500 registros; upload, download, SHA-256 do arquivo/conteúdo, contagem e texto exato precedem o commit SQL.
- O commit reconfere fonte, elegibilidade, referências e trava de idempotência. Falha anterior ao commit preserva os originais. Resposta perdida após commit pode ser reconciliada pelo status; a cópia verificada permanece no arquivo.
- Arquivamento não substitui backup: a recuperação histórica depende tanto do banco quanto dos objetos privados. Não remover objetos de `proesc-history` isoladamente. Este lote não implantou um backup externo desses objetos.
- Um localizador mínimo impede interpretar pedido arquivado como novo. O replay verifica e restaura um recibo, reinvocando a mesma operação com ator, ação e hash originais. Arquivo indisponível ou corrompido encerra com erro, sem repetir financeiro.
- Observações consecutivas de conteúdo idêntico são consolidadas com preservação integral de IDs, horários e dados. Primeira/última observação, estado mais recente, confirmações, eventos relevantes, referências e execuções inseguras permanecem protegidos.
- HTTP bem-sucedido e itens técnicos antigos continuam com janela de 24 horas, compactados em JSONB/TOAST privado. Views reconstroem as linhas exatas. Erros, escopo por polo, contadores, referências, append e reidratação permanecem consultáveis.
- Proesc: pagamento comprovado e inalterado volta à elegibilidade após 24 horas; pesquisa normal sem pagamento, após 3 horas. Mudança local, nova observação, revisão, falha ou cache ausente não recebe esse adiamento. Fila e indisponibilidades podem aumentar o tempo até a consulta efetiva.
- Cache de cadência limitado a um registro por vínculo; atualização condicionada ao estado atual e à geração do snapshot evita sobrescrita por finalização antiga. Não modifica valores, autorização, lease ou CAS financeiro.
- Banese exclui pagos/cancelados concluídos da fila; o contrato bancário permanece preservado.
- Edge: `proesc-api` v18 e `proesc-history-archive` v2. Autenticação interna por segredo Vault e autorização SQL antes do Storage; `verify_jwt=false` é intencional nesse contrato. Segredos não são retornados nem registrados.

## Validação e operação

- Testes de codec, worker, replay, drain, observação e sincronização cobrem integridade, corrupção, indisponibilidade e retomada.
- Ensaios SQL cobrem autorização, ator/payload, replay, commit/abort, restauração, cadência, invalidação, CAS, escopos dos monitores, erros, append e reidratação.
- O piloto exige upload/download/commit/restauração reais antes da ativação; EMPTY não substitui o piloto.
- Conferir hashes, contagem, conteúdo exato e referências antes de eliminar a cópia quente.
- Arquivamento não substitui backup. Banco e objetos privados devem ser preservados em conjunto.
- Recibos: lotes de até 500 a cada dez minutos. Observações: até 25 vínculos por minuto, com timeout de 15 segundos. HTTP e itens: até 25 execuções a cada dez minutos.
- Capacidade nominal depende de sucesso, fila, locks e disponibilidade. A janela de seis horas não assegura arquivamento pontual.
- Histórico útil continua crescendo em localizadores, cabeçalhos, pacotes SQL e Storage. Medir crescimento após a implantação e antecipar intervenção quando a margem cair.
- Revisão considerou compactação adicional de localizadores e a adiou pelos riscos de desempenho, transição e idempotência.
- Conferir reativação e execução natural de todas as rotinas após manutenção. Não há monitoramento externo ou backup adicional implantado neste lote.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-19-arquivo-proesc-storage-e-consultas.md`
- `supabase/migrations/20260919221014_proesc_receipt_archive.sql`

- `supabase/migrations/20260919221238_proesc_archive_operations.sql`
- `supabase/migrations/20260919222817_proesc_settled_polling.sql`
- `supabase/migrations/20260919223121_proesc_http_archive.sql`
- `supabase/tests/proesc_http_archive.transaction.sql`
- `supabase/migrations/20260919223611_proesc_items_archive.sql`
- `supabase/tests/proesc_items_archive.transaction.sql`
- `supabase/migrations/20260919230826_proesc_items_archive_candidates.sql`
- `supabase/tests/proesc_items_archive_candidates.transaction.sql`
- `supabase/tests/proesc_lossless_storage.transaction.sql`
- `supabase/migrations/20260919224812_proesc_items_archive_inline.sql`
- `supabase/tests/proesc_items_archive_inline.transaction.sql`
- `supabase/tests/proesc_receipt_archive.transaction.sql`
- `supabase/migrations/20260919224848_proesc_receipt_archive_prefilter.sql`
- `supabase/tests/proesc_receipt_archive_prefilter.transaction.sql`
- `supabase/tests/proesc_settled_polling.transaction.sql`
- `supabase/functions/_shared/proesc-archive-replay.ts`
- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/migrations/20260919223315_proesc_archive_backlog.sql`
- `supabase/migrations/20260919223705_activate_proesc_archive_maintenance.sql`
- `supabase/functions/proesc-history-archive/drain.ts`
- `supabase/functions/proesc-history-archive/drain.test.ts`
- `supabase/functions/proesc-history-archive/index.ts`
- `supabase/functions/proesc-history-archive/handler.ts`
- `supabase/functions/proesc-history-archive/worker.ts`
- `supabase/functions/proesc-history-archive/codec.ts`
- `supabase/functions/proesc-history-archive/codec.test.ts`
- `supabase/functions/proesc-history-archive/worker.test.ts`
- `supabase/functions/proesc-history-archive/replay.test.ts`
- `supabase/migrations/20260919234600_proesc_history_hot_window.sql`
- `supabase/tests/proesc_history_hot_window_receipts.transaction.sql`
- `supabase/tests/proesc_history_hot_window_observations.transaction.sql`
- `supabase/migrations/20260919235927_proesc_observation_maintenance_cadence.sql`
- `supabase/tests/proesc_observation_maintenance_cadence.readonly.sql`
- `supabase/migrations/20260920000523_proesc_receipt_archive_candidate_plan.sql`
- `supabase/tests/proesc_receipt_archive_candidate_plan.readonly.sql`

Total: 39 arquivos.

Migrations anteriores permanecem imutáveis.


A redução anterior permanece em `2026-09-19-reducao-armazenamento-supabase.md`.
