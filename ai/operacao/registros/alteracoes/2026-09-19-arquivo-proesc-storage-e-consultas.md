# Arquivo Proesc no Storage e consultas após baixa

Estado: CONCLUÍDO EM PRODUÇÃO — transferência, recuperação, revisão e ciclos automáticos validados.
Projeto: Universo Cursos, `kfekgwyqozhicpfuunpo`.

O usuário autorizou execução em produção por etapas, três agentes, revisão e redução das consultas repetidas após baixa. O objetivo é preservar os dados úteis e reduzir o banco para menos de 500 MB, preferencialmente 450 MB quando viável. Todas as operações remotas deste lote usam MCP Supabase; não houve publicação de frontend/GitHub.

## Medições e preservação financeira

- Baseline em 19/09/2026, 21:59 UTC: cluster de 661.893.297 bytes, incluindo templates; modo somente leitura desligado.
- Medição de encerramento após os ciclos automáticos, em 20/09/2026, 01:25 UTC: cluster de 476.655.793 bytes (476,7 MB decimais), incluindo templates; banco da aplicação de 461.540.499 bytes. Redução de 185.237.504 bytes/27,99% nesta etapa; margem conservadora de 23.344.207 bytes até 500 MB decimais. Modo somente leitura desligado. A medição logo após o backfill, às 01:15, era de 474.927.281 bytes; alocações/manutenção e atividade seguiram durante a observação, e esse intervalo não constitui taxa estável de crescimento.
- Storage total: 866 objetos/67.253.123 bytes; arquivo Proesc: 716 objetos gzip/48.458.894 bytes. Os demais objetos existentes foram preservados.
- Após a consolidação da janela de 6 horas e novamente no fechamento, em 01:25 UTC: mesmos 6.837 recebíveis, R$ 1.876.839,27 de principal e R$ 986.200,19 pagos.
- Os 16.280 eventos financeiros relevantes mantêm o hash `eecb02b049403d99f27c13e9ca8329b3`. A comparação exclui somente `original_snapshot_id`, metadado de consolidação.
- A redução anterior permanece registrada em `2026-09-19-reducao-armazenamento-supabase.md`.

## Divisão e revisão

1. `free_tier_compaction`: SQL, seleção dos registros, manutenção, histórico e monitores.
2. `free_tier_storage`: worker, arquivo privado e revisão independente das migrations.
3. `free_tier_retention`: consultas após baixa, Banese, estabilidade do Proesc e limites da solução.
4. Raiz: integração, ensaios, aplicação, pilotos, transferência, recuperação física e fechamento.

As mudanças de janela, plano de consulta e frequência de manutenção receberam revisão independente antes da aplicação. Não foram encontrados bloqueadores de perda de histórico ou reaplicação financeira nos contratos revisados.

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
- Banese já excluía concluídos: na verificação inicial havia 14 PAGO/DONE, 24 CANCELADO/DONE e zero pendências pós-liquidação. Nenhuma alteração bancária foi feita.
- Edge: `proesc-api` v18 e `proesc-history-archive` v2. Autenticação interna por segredo Vault e autorização SQL antes do Storage; `verify_jwt=false` é intencional nesse contrato. Segredos não são retornados nem registrados.

## Validações e recuperação de espaço

- 43 testes Edge/replay/drain/worker aprovados; typecheck dos dois entrypoints aprovado.
- Ensaios SQL com rollback cobrem autorização, ator/payload, replay, corrupção, commit/abort, restauração, cadência, invalidação, CAS, escopos dos monitores, erros, append e reidratação.
- Piloto real de um recibo executou upload/download/commit/restauração. Lote real interrompido preservou os originais e foi retomado pelo mesmo arquivo verificado.
- Teste legado de histórico aprovado em 14,7 segundos. Somente nesse teste, JSONPath filtra antes da reconstrução tipada; hashes do conteúdo atual e assertions foram preservados. Leitores produtivos usam run ou observação, sem a varredura ampla por vínculo.
- Janela de 6 horas: testes de 5h59, 6h exatas, 6h01 e 23h59; lotes PREPARED antigos, eventos/claims, confirmações, keepers, primeira/última/latest e runs ativos/recentes/falhos. Histórico integral e obrigação financeira mantidos.
- HTTP: 84.272 registros antigos/3.111 runs preservados; fonte física de 2.957.312 bytes após recuperação, além de aproximadamente 2,7 MB compactados.
- Itens: 237.070 registros compactados; índice parcial de 32 KB resolveu a seleção sem candidatos. Arquivo SQL de 51.232.768 bytes; fonte de 18.784.256 bytes após a recuperação mais recente.
- Observações na janela de 6 horas: 38.499 corpos repetidos consolidados em 6.417 vínculos, todos com verificação integral por lote. Lotes que excederam 15 segundos foram revertidos e retomados em grupos menores.
- Após VACUUM FULL/ANALYZE e VACUUM/ANALYZE: `financial_snapshots` com 37.150.720 bytes/30.681 linhas; cabeçalhos com 32.399.360 bytes/205.669 linhas.
- Recibos: recuperação física reduziu a tabela de 173.662.208 para 14.942.208 bytes. Ao atingir 356.500 recibos arquivados, a seleção esgotou 15 segundos perto do fim da fila, sem PREPARED ou exclusão parcial. FULL/ANALYZE e VACUUM/ANALYZE resolveram; a retomada arquivou mais 435 e retornou EMPTY. Nenhuma migration adicional ou ampliação de timeout foi necessária.
- Final: 356.995 localizadores frios, zero overlap global com recibos quentes e zero PREPARED. Os 716 lotes confirmados registram 356.996 linhas originais: a diferença de uma linha é o piloto restaurado, que voltou ao banco e teve seu localizador frio removido conforme o contrato.
- Auditoria de todos os manifests: objetos presentes, únicos, caminhos esperados e tamanhos iguais aos metadados SQL; zero objetos de tentativas incompletas. Bucket privado, política restritiva exata, zero grants diretos de tabelas/RPCs para clientes e sete FKs protegidas/validadas. Amostra explícita de 256 localizadores sem referências financeiras protegidas; o overlap global foi conferido separadamente. Os hashes de conteúdo foram verificados pelo pipeline antes de cada commit, não por um novo download integral nesta auditoria de metadados.
- O crescimento do mapa frio fez o prepare escolher Hash Anti Join e exceder 15 segundos. Pré-filtros JSON necessários e OFFSET 0 mantêm a busca pelo índice existente, sem alterar helper/locks. Benchmark de 500 linhas: 1,343 segundo; equivalência e plano aprovados antes e depois da aplicação.
- Advisor de segurança no escopo novo: somente INFO de RLS sem política em tabelas privadas, cujos grants foram revogados intencionalmente.
- Probe real do worker publicado sem o segredo retornou HTTP 403; nenhum arquivo foi solicitado nesse teste. Ciclos financeiros de 00:50 e 00:52 UTC concluíram com 60 consultas e zero falhas.
- Smoke final autenticado: oito feeds (runs, observations, errors e settlements, globais e por polo) aprovados sobre uma execução com itens/observações arquivados; histórico obrigatório permaneceu presente. Dashboard autenticado de sete dias também aprovado. O teste usa o contrato RPC real, sem expor dados pessoais nos resultados; não foi smoke visual do navegador.

## Operação, prevenção e limites

- Proesc apresentou timeouts externos de 12 segundos e HTTP 502 em alguns ciclos, antes de SNAPSHOT/APPLY. O cursor conservou os registros; ciclos posteriores retomaram os mesmos vínculos com sucesso. Nenhum timeout foi ampliado.
- A relação causal entre carga do arquivo e falhas externas não foi demonstrada. O drain final usa duas unidades de 500 por chamada, fora de execução financeira ativa e reservando margem antes do próximo ciclo. Ciclos 00:16 e 00:18 UTC concluíram sem falhas.
- Recibos: cron de 500 a cada 10 minutos. Capacidade nominal de 72 mil/dia pressupõe sucesso e lotes completos; não é produtividade sustentada medida. A geração teórica máxima do sync agendado, sem adiamentos, seria 86,4 mil/dia; a cadência reduz os estados comuns.
- Observações: nova agenda de 25 vínculos/minuto, timeout de 15 segundos. Para 6.417 vínculos, ciclo nominal de 4h18 incluindo wrap; a janela de 6 horas não implica arquivamento pontual às 6 horas. Falhas, locks e crescimento alongam a passagem.
- HTTP e itens: 25 runs a cada 10 minutos. Histórico útil continua crescendo em localizadores, cabeçalhos, pacotes SQL e Storage. A solução reduz repetição e automatiza o tratamento, mas não garante permanência ilimitada no plano Free. Medir crescimento já nas próximas 24 horas e continuar acompanhando por sete dias, antecipando intervenção se a margem cair; não esperar uma semana para a primeira conferência.
- Projeção, ainda não taxa observada: com 3.792 vínculos pagos e 2.625 abertos na cadência completa, até 24.792 consultas/28.584 recibos por dia. Os tamanhos físicos médios sugerem crescimento residual de 7,5–13 MB/dia em localizadores e histórico SQL. O cache estava preenchido em cerca de 42%; fila, falhas e alocação alteram o resultado. Uma margem de 25 MB poderia durar somente 2–4 dias nesse cenário.
- Os três agentes avaliaram compactar também os localizadores em arrays/Bloom. A decisão foi adiar: ganho estimado de 22–35 MB e aproximadamente 2 MB/dia não resolve a sustentabilidade, enquanto aumenta os riscos de desempenho, transição e idempotência. Nenhuma alteração desse estudo foi aplicada; o rascunho incompleto ficou em `/private/tmp`, fora das migrations e do manifesto.
- As rotinas de itens/observações ficaram pausadas durante o backfill; o arquivador de recibos foi pausado brevemente para a recuperação física final. Todas foram reativadas por `cron.alter_job` por volta de 01:15 UTC; HTTP permaneceu ativo. O worker financeiro permaneceu ativo em toda a manutenção. Ciclos 01:10, 01:12 e 01:14 concluíram 60 consultas/60 UNCHANGED/zero falhas cada.
- Retomada natural: observações 01:17/01:18 concluídas em 5,4/3,7 segundos; financeiro 01:16/01:18 concluído com 60 consultas e zero falhas. Cron de recibos às 01:17 produziu resposta HTTP 200/COMMITTED e arquivou mais 60 recibos; não foi um acionamento manual.
- Fechamento das rotinas: HTTP às 01:23 concluído em 0,7 segundo; itens às 01:24 em 2,2 segundos; observações às 01:24 em 0,5 segundo. As quatro agendas estão ativas e passaram por execução natural após a retomada.
- Financeiro após todas as rotinas reativadas: ciclos 01:20, 01:22 e 01:24 SUCCEEDED, cada um com 60 consultas/60 UNCHANGED/zero falhas. Auditoria final dos 716 objetos novamente aprovada às 01:25.
- Manifesto final conferido: 39 caminhos existentes e únicos, todos dentro de 500 linhas. Verificação global exigida pelo repositório também aprovada (1.421 arquivos manuais e 155 exceções/artefatos).

## Encerramento

- Meta imediata de menos de 500 MB alcançada com dados financeiros preservados. Não foi necessário mudar o plano; a sustentabilidade permanente do Free não foi demonstrada.
- Nenhuma rotina permanece pausada. Não houve publicação de frontend/GitHub. Migrations aplicadas e versões Edge estão registradas no manifesto e no corpo deste documento.
- Acompanhamento recomendado em 24 horas para medir o crescimento real e decidir a próxima etapa de retenção/arquivamento. Não há promessa de monitoramento externo ou de backup implantado neste lote.
- Indexação do RAG no fechamento: `node scripts/agent-memory-rag.mjs index`, uma execução após finalizar os documentos deste lote.

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
