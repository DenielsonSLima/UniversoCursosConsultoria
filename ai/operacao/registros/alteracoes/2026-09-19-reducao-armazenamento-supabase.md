# Redução do armazenamento Supabase — 2026-09-19

Estado: APLICADO E VALIDADO EM PRODUÇÃO — sem publicação de frontend/GitHub.
Projeto: Universo Cursos, kfekgwyqozhicpfuunpo. Operação crítica de banco, autorizada pelo usuário nesta conversa.

## Escopo e aceite

Reduzir logs redundantes e cópias repetidas da integração Proesc. Preservar todos os recebíveis, pagamentos, importações, correções, evidências, autorizações, identidade e horário das observações úteis e respostas idempotentes. O usuário reforçou que o sistema está em produção e que apenas conteúdo sem utilidade deve ser descartado.
Sem mudanças de frontend, versão pública, GitHub ou arquivos de outras frentes.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-19-reducao-armazenamento-supabase.md`
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
- `supabase/operations/restore-cron-history-disk-recovery.sql`
- `supabase/operations/prune-redundant-proesc-events.sql`
- `supabase/tests/proesc_storage_noop.transaction.sql`
- `supabase/tests/proesc_lossless_storage.transaction.sql`

Total: 18 arquivos.

## Diagnóstico e decisões

- Baseline: 1.540.533.395 bytes; eventos Proesc ~602 MB, snapshots ~308 MB, requests ~182 MB, cron ~168 MB, telemetria ~115 MB.
- Arquivos Storage ~18,8 MB não eram a causa do aviso de banco. Nenhum documento de aluno ou arquivo enviado foi removido.
- Removidos apenas logs cron de sucesso com mais de sete dias e eventos AUTO/UNCHANGED redundantes, sem mutation_claims. Observações, telemetria e respostas de requisições permanecem.
- Limpeza inicial removeu os no-ops acumulados; manutenção futura conserva até 24 horas de eventos compactos para diagnóstico. APPLIED, IMPORT, LINK, CORRECTION e demais eventos relevantes permanecem.
- Snapshots automáticos repetidos, de execuções SUCCEEDED/UNCHANGED finalizadas há mais de 24 horas, são representados por cabeçalho original e evidência compartilhada. Não há expiração/tombstone de replay.
- Igualdade integral inclui source_fingerprint, recorded_by e todos os campos financeiros/contábeis. Primeira/última observações de cada sequência (inclusive A→B→A), latest, provas significativas, erros, revisões, confirmações financeiras em JSON e keepers permanecem físicos.
- A view privada reconstrói exatamente as linhas originais. Hash integral antes/depois de cada lote aborta a transação se houver divergência. Keeper é protegido por FK e trigger de imutabilidade.
- Leitores por ID e monitores usam histórico reconstruído. Aplicação de observação arquivada a reidrata somente após as guardas originais. Original_snapshot_id preserva identidade de auditoria e impede atribuir baixa antiga a consulta posterior.
- Monitor: o filtro por execução parte de no máximo seus itens, com busca por PK; a hidratação acontece depois da paginação. Correção comprovada por EXPLAIN ANALYZE e RPC real.

## Recuperação de espaço físico

Durante a manutenção, o Supabase entrou em modo somente leitura por falta de disco; VACUUM FULL cron não tinha espaço de trabalho.
Foi criado staging LOGGED privado com payloads comprimidos, cópia conferida linha a linha e checksum. TRUNCATE sem CASCADE/RESTART IDENTITY liberou espaço, preservando/restaurando registros ativos na mesma transação. Os 46.915 logs retidos foram restaurados e comparados; staging ocupou ~3,4 MB, cron reconstruído ~22,6 MB. O modo somente leitura voltou a off.
O apply_migration não conseguiu inicializar seu ledger em readonly. Somente nessa recuperação, a migration versionada 20260919162500 e sua entrada de ledger foram aplicadas atomicamente por execute_sql do MCP Supabase, com SET TRANSACTION READ WRITE. Nenhuma CLI, conexão direta ou exportação de payload foi usada.
Depois da remoção dos eventos redundantes e VACUUM FULL, o banco chegou a 856.059.027 bytes, antes da recuperação de espaço dos snapshots.

## Validação

- Revisão independente de segurança, referências, replay, preservação de jobs ativos e planos SQL.
- Ensaio transacional da RPC no-op: replay, rejeição de payload diferente, autorização e recebível intacto.
- Ensaio transacional lossless: igualdade integral do histórico, contadores por execução/polo, proteção de confirmação JSON, keeper imutável, replay com ID arquivado, monitor com ID/data/run originais, ausência de baixa atribuída a run incorreto e reidratação sem alterar recebível.
- Timeouts durante diagnóstico e lotes grandes fizeram rollback; processamento retomado com lotes menores. Nenhuma tentativa de teste foi registrada por apply_migration com ROLLBACK.
- Migrations aplicadas são imutáveis. Arquivos manuais deste manifesto estão abaixo de 500 linhas.
- Checkpoint 17:16 UTC: 6.837 recebíveis; principal R$ 1.876.839,27 e pago R$ 986.200,19, idênticos ao baseline. Os 16.280 eventos relevantes mantêm hash integral eecb02b049403d99f27c13e9ca8329b3.
- O hash global de recebíveis inclui metadados atualizados naturalmente pelo worker; a preservação financeira foi conferida pelos totais e pelos ensaios com igualdade integral dentro da transação.
- Execução natural 17:20 UTC: SUCCEEDED, 60 consultas/UNCHANGED e zero falhas.
- Revisão de plano do hash: 55 ms no caminho atual versus 146 ms na alternativa LATERAL; alternativa descartada por piorar o resultado.
- Consolidação inicial completa: 166.700 observações representadas sem duplicar o corpo; 58.976 snapshots físicos, 225.676 observações lógicas na medição de 17:28 UTC. Zero confirmações JSON arquivadas e zero referências originais de itens sem histórico.
- Banco em 17:28 UTC: 615.353.491 bytes, contra 1.540.533.395 no baseline. Economia de 925.179.904 bytes (60,1%). Ainda acima de 500 MB; nenhuma informação útil foi descartada para atingir a cota.
- Recuperação física concluída com VACUUM FULL em eventos, snapshots, requests e itens. VACUUM simples/ANALYZE após reescrita restaurou o mapa de visibilidade para as consultas pelos índices existentes.
- Smoke do monitor: feed padrão passou em ~3 s (inclui MCP); dashboard inicialmente excedeu 15 s após reescrita, passou em ~5,9 s após VACUUM simples e sem consultas paralelas. Não foi necessário novo índice ou outra mudança de função.
- Ensaio lossless completo repetido após consolidação: aprovado com rollback. Nenhum dado de teste persistiu.
- Smoke natural após recuperação física: worker de 17:28 UTC SUCCEEDED, 60 consultas/UNCHANGED e zero falhas; manutenção de 17:29 UTC succeeded em ~1,94 s. Modo somente leitura off; staging de emergência removido após verificação.
- Retenção automática: sucesso cron sete dias; eventos AUTO/UNCHANGED redundantes 24 horas; falhas, alterações financeiras e requests preservados. Consolidação a cada dois minutos ímpares (10 vínculos, timeout de 15 s), alternada com worker financeiro em minutos pares.
- Verificação final de limite de linhas aprovada: 1.386 arquivos auditados, 155 exceções/artefatos ignorados. Os 18 arquivos do manifesto respeitam o teto; todas as 11 migrations constam no ledger remoto.

## Continuidade

A ficha do aluno anteriormente validada permanece registrada em 2026-09-19-ficha-aluno-remodelacao.md, sem publicação por este lote. A redução de redundância não implica que o histórico útil ou o crescimento normal caibam indefinidamente no plano gratuito.

