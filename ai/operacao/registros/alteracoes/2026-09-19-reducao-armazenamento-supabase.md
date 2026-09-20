# Redução do armazenamento Supabase — 2026-09-19

Registro técnico público. Métricas internas e totais financeiros foram omitidos.

## Escopo e aceite

Reduzir logs redundantes e cópias repetidas da integração Proesc. Preservar recebíveis, pagamentos, importações, correções, evidências, autorizações, identidade e horário das observações úteis e respostas idempotentes.

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

## Contrato e recuperação

- Retenção de sucesso cron por sete dias e de eventos AUTO/UNCHANGED redundantes por 24 horas. Eventos financeiros relevantes permanecem.
- Observações repetidas são representadas por cabeçalho original e evidência compartilhada, sem expiração de replay. Igualdade inclui ator, fingerprint e campos financeiros.
- Primeira/última observações, latest, confirmações JSON, erros, revisões e referências protegidas permanecem preservados.
- Views reconstroem linhas originais; hashes abortam a transação diante de divergência. Keeper protegido por FK e imutabilidade.
- Leitores por ID e monitores utilizam histórico reconstruído. Reidratação exige as guardas originais e preserva a identidade da observação.
- Recuperação física extraordinária usa staging LOGGED privado, cópia comprimida conferida e TRUNCATE sem CASCADE/RESTART IDENTITY. A restauração deve ocorrer antes da remoção do staging, na ordem documentada no registro de publicação.
- Não reaplicar migrations já registradas nem executar scripts de recuperação fora dessa janela.

## Validação

Revisão independente e ensaios transacionais cobrem replay, autorização, rejeição de payload diferente, preservação financeira, igualdade integral do histórico, confirmação JSON, imutabilidade, monitores e reidratação. Testes com rollback não persistem dados de ensaio. Migrations aplicadas são imutáveis.

A redução de redundância não garante crescimento ilimitado no plano gratuito.
