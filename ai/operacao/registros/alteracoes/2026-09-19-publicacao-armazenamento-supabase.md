# Publicação da redução de armazenamento — 4.8.72

Estado: VALIDADO E AUTORIZADO PARA PUBLICAÇÃO. Versão 4.8.72, revisão 81.

O usuário solicitou publicar no GitHub, revisar o sistema e conferir regressões. A entrega reúne somente as duas etapas coesas de armazenamento já aplicadas em produção, cuja primeira etapa também ainda não estava no repositório. Base remota conferida: `b0943b3a3fff7133d6606a1855cb7e3d21bbdf76`.

## Resultado operacional já validado

- Banco de 476.655.793 bytes incluindo templates; aplicação de 461.540.499 bytes. Storage de 67.253.123 bytes, dos quais 48.458.894 bytes/716 objetos são o arquivo privado Proesc. Medição em 20/09/2026 às 01:25 UTC (19/09 às 22:25 local).
- 356.995 recibos frios; zero overlap quente/frio e zero PREPARED. A diferença entre 356.996 linhas originais e localizadores corresponde ao piloto restaurado.
- Mesmos 6.837 recebíveis, principal de R$ 1.876.839,27, pago de R$ 986.200,19 e 16.280 eventos relevantes com hash preservado. Nenhum dado pessoal, documento de aluno, credencial ou dump pertence ao manifesto.
- Quatro rotinas automáticas ativas com ciclos naturais aprovados; financeiro às 01:20/01:22/01:24 SUCCEEDED, com 60 consultas/60 UNCHANGED/zero falhas.
- Proesc: cadência de 24 horas para pagamento comprovado/inalterado e três horas para aberto elegível; mudanças, erros, revisão e cache ausente não recebem adiamento. Fila e indisponibilidade podem alongar a consulta efetiva. Banese já excluía pagos/cancelados concluídos.
- Folga de 23,3 MB; sustentabilidade permanente do Free não demonstrada. Medir novamente em 24 horas. Arquivamento depende do banco e dos objetos privados e não substitui backup externo.

## Revisão e mudanças desta publicação

- 54 arquivos dos dois manifestos operacionais, mais versão/changelog, CI, configuração Edge, exemplos opcionais da configuração, configuração do linter e este registro: 61 arquivos.
- Todas as 24 migrations coincidem em nome/versão com o ledger. Fontes aplicadas permanecem imutáveis; esta publicação não reaplica SQL nem refaz a transferência.
- Código dos entrypoints/módulos publicados coincide com `proesc-api` v18 e `proesc-history-archive` v2 ACTIVE. Os 17 módulos existentes fora do patch também coincidem com a base GitHub e a produção.
- Revisão detectou ausência de configuração declarativa: `verify_jwt=false` agora explícito para ambas as funções. Elas continuam validando a autorização própria antes dos dados/Storage; isso registra o comportamento já ativo, sem abrir endpoint anônimo.
- Exemplos comentados de Passkey/WebAuthn separados em `supabase/config-template-examples.md`, preservando documentação e configurações ativas. O TOML continua com 500 linhas.
- CI passa a executar codec, worker, replay, drain, observação e sincronização Proesc. Os arquivos de versão avançam para 4.8.72/revisão 81; histórico anterior preservado.
- Registro de limites reconciliado sobre a base remota, recebendo somente estes três registros. Alterações locais de outros lotes permanecem fora da publicação.

- CI identificou globals nativos do Deno ausentes no linter. Declarações adicionadas somente ao escopo do arquivador, mantendo as regras de lint e sem alterar o código em produção.

## Validação de publicação

- 53 testes passaram em diretório temporário isolado, com dependências lidas do commit remoto e somente o patch desta entrega sobreposto; zero falhas.
- Typecheck dos dois entrypoints e controle de versão aprovados. Revisão independente reconstruiu e conferiu os hashes intermediários dos patches SQL; nenhuma dependência intermediária ausente foi encontrada.
- Os ensaios SQL, autorizações, corrupção/indisponibilidade, replay, preservação financeira, monitores autenticados e cron real estão detalhados nos registros operacionais anteriores.
- CI/build e Preview são verificados no PR antes do merge; os resultados finais e o SHA publicado ficam no histórico/checks do próprio PR. Testes aprovados não equivalem a garantia de ausência absoluta de bugs.

## Implantação e reconstrução

- Produção atual: migrations já aplicadas e Edge ativas. Publicar fontes/configuração não autoriza reaplicar migrations ou executar novamente a recuperação de disco.
- A sequência pressupõe a base anterior completa: Proesc, Storage, Vault, pg_cron, pg_net e autorizações, PostgreSQL 17 e privilégios administrativos compatíveis. Não houve ensaio integral de reconstrução nesta publicação.
- `20260919162500` cria staging durável e confere a cópia antes do TRUNCATE de logs cron. `20260919172744` restaura, confere e remove o staging. O script operacional de restauração serve somente para recuperação entre essas etapas; não executá-lo depois que o staging foi removido.
- Antes de `20260919223705_activate_proesc_archive_maintenance.sql`, publicar os entrypoints compatíveis, configurar o segredo Vault e realizar o piloto verdadeiro de upload/download/commit/restauração. O worker cria o bucket privado. Sem recibo elegível, EMPTY não satisfaz a guarda; nunca inserir COMMITTED artificial nem remover a proteção.
- Depois do piloto, prosseguir cronologicamente pelas correções de plano, janela de seis horas e cadência. A migration da cadência preserva o estado active; a reativação final é operacional e deve ser conferida por ciclo natural.
- Os enqueues contêm a URL fixa do projeto de produção. Não ativar estas agendas em outro projeto sem configuração específica revisada; este lote não fornece implantação portátil automática.

## Manifesto explícito

- `eslint.config.js`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-19-arquivo-proesc-storage-e-consultas.md`
- `ai/operacao/registros/alteracoes/2026-09-19-publicacao-armazenamento-supabase.md`
- `ai/operacao/registros/alteracoes/2026-09-19-reducao-armazenamento-supabase.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/config-template-examples.md`
- `supabase/config.toml`
- `supabase/functions/_shared/proesc-archive-replay.ts`
- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/functions/proesc-history-archive/codec.test.ts`
- `supabase/functions/proesc-history-archive/codec.ts`
- `supabase/functions/proesc-history-archive/drain.test.ts`
- `supabase/functions/proesc-history-archive/drain.ts`
- `supabase/functions/proesc-history-archive/handler.ts`
- `supabase/functions/proesc-history-archive/index.ts`
- `supabase/functions/proesc-history-archive/replay.test.ts`
- `supabase/functions/proesc-history-archive/worker.test.ts`
- `supabase/functions/proesc-history-archive/worker.ts`
- `supabase/migrations/20260919161214_proesc_compact_unchanged_events.sql`
- `supabase/migrations/20260919161251_cron_success_history_retention.sql`
- `supabase/migrations/20260919162500_stage_cron_history_disk_recovery.sql`
- `supabase/migrations/20260919162810_proesc_noop_event_retention.sql`
- `supabase/migrations/20260919165124_proesc_lossless_observation_storage.sql`
- `supabase/migrations/20260919165134_proesc_observation_replay_readers.sql`
- `supabase/migrations/20260919165136_proesc_observation_history_monitor.sql`
- `supabase/migrations/20260919165139_proesc_observation_compaction.sql`
- `supabase/migrations/20260919165536_proesc_history_run_lookup.sql`
- `supabase/migrations/20260919165815_proesc_history_bounded_page.sql`
- `supabase/migrations/20260919172744_activate_storage_maintenance.sql`
- `supabase/migrations/20260919221014_proesc_receipt_archive.sql`
- `supabase/migrations/20260919221238_proesc_archive_operations.sql`
- `supabase/migrations/20260919222817_proesc_settled_polling.sql`
- `supabase/migrations/20260919223121_proesc_http_archive.sql`
- `supabase/migrations/20260919223315_proesc_archive_backlog.sql`
- `supabase/migrations/20260919223611_proesc_items_archive.sql`
- `supabase/migrations/20260919223705_activate_proesc_archive_maintenance.sql`
- `supabase/migrations/20260919224812_proesc_items_archive_inline.sql`
- `supabase/migrations/20260919224848_proesc_receipt_archive_prefilter.sql`
- `supabase/migrations/20260919230826_proesc_items_archive_candidates.sql`
- `supabase/migrations/20260919234600_proesc_history_hot_window.sql`
- `supabase/migrations/20260919235927_proesc_observation_maintenance_cadence.sql`
- `supabase/migrations/20260920000523_proesc_receipt_archive_candidate_plan.sql`
- `supabase/operations/prune-redundant-proesc-events.sql`
- `supabase/operations/restore-cron-history-disk-recovery.sql`
- `supabase/tests/proesc_history_hot_window_observations.transaction.sql`
- `supabase/tests/proesc_history_hot_window_receipts.transaction.sql`
- `supabase/tests/proesc_http_archive.transaction.sql`
- `supabase/tests/proesc_items_archive.transaction.sql`
- `supabase/tests/proesc_items_archive_candidates.transaction.sql`
- `supabase/tests/proesc_items_archive_inline.transaction.sql`
- `supabase/tests/proesc_lossless_storage.transaction.sql`
- `supabase/tests/proesc_observation_maintenance_cadence.readonly.sql`
- `supabase/tests/proesc_receipt_archive.transaction.sql`
- `supabase/tests/proesc_receipt_archive_candidate_plan.readonly.sql`
- `supabase/tests/proesc_receipt_archive_prefilter.transaction.sql`
- `supabase/tests/proesc_settled_polling.transaction.sql`
- `supabase/tests/proesc_storage_noop.transaction.sql`

Total: 61 arquivos.
