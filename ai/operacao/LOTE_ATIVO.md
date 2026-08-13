# Lote ativo

Estado: `PUBLICACAO_AUTORIZADA`

## Lote: 2026-08-13-conciliacao-banese-sem-ciclos-vazios

- Objetivo: impedir que o worker Banese crie execuções financeiras vazias quando não houver título elegível na fila.
- Escopo incluído: uma RPC atômica que reserva a fila antes de criar a execução; adaptação do worker; nova retenção automática de 48h para ciclos vazios e telemetria técnica bem-sucedida; hardening dos entrypoints; documentação e teste focal.
- Fora de escopo: alterar valores, perfil ou quantidade de consultas Banese; emitir cobranças; mudar a frequência do cron de reconciliação; alterar a política de retenção de falhas, pagamentos ou tentativas.
- Risco e guarda: financeiro em produção. Pausar cron, garantir zero execução/lease ativo, aplicar migration, publicar o worker, testar o caso de fila vazia e reativar o cron sem criar título real.
- Critérios de aceite: fila vazia retorna `NO_CLAIMABLE_TITLES` sem criar `run`, tentativa, OAuth ou chamada Banese; transições de configuração relevantes continuam preservadas; lote com título continua protegido por advisory lock, `SKIP LOCKED`, lease e `config_version`; reserva restrita a `service_role`, prune restrito ao `postgres`/cron e entrypoints legados revogados; dois ciclos reais após reativação sem logs de reconciliação vazios.
- Produção Supabase: migrations `20260813031252_prune_banese_no_work_reconciliation_runs.sql`, `20260813034453_prepare_banese_reconciliation_batch_atomically.sql` e `20260813041928_harden_banese_reconciliation_entrypoints.sql` aplicadas por MCP; worker `banese-reconciliation-worker` v26 ativo; cron pausado durante o rollout e reativado após a validação.
- Validação: teste focal 9/9 e `deno check` aprovados; chamadas transacionais como `service_role` e `postgres` validaram os privilégios mínimos; chamada direta da RPC em fila vazia devolveu `NO_CLAIMABLE_TITLES` com zero `run`/lease; ciclos reais do worker v26 retornaram HTTP 200 com `skipped`; ao fechamento há zero execução, tentativa, transição e lease Banese; não foi criada cobrança real.
- Publicação GitHub: versão `4.3.2` autorizada em 2026-08-13, com manifesto explícito e revisão final independente antes da PR.
