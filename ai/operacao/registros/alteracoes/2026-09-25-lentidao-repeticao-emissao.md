# Lentidão de acesso ligada à repetição de falha BolePix — 25/09/2026

Estado: VALIDADO — backend aplicado; versionamento 4.8.87 em publicação.

## Evidência e causa

Usuário relatou acesso que demora mas abre e pediu análise interna, sem login. Entre 13:40 e 13:58 UTC, logs mostraram portal_listar_perfis em até 28.453 ms, auth/token em até 23.979 ms e rate limit em até 11.588 ms. Não é evidência suficiente para medir a rede do usuário, mas confirma espera no servidor.

97.925 erros SQLSTATE 40001 vieram de quatro processos na função mark_technical_manual_cycle_banese_failure, linha de conflito permanente por autorização sem claim. Últimos registros desses processos: 13:57:25 UTC; eles já não existiam em pg_stat_activity quando inspecionados. Não foi necessário cancelar sessão ou reiniciar projeto. A ausência posterior começou antes deste patch e não deve ser atribuída a ele.

PostgREST 14.5 interpreta 40001 como falha transitória e pode repetir indefinidamente. Fonte oficial: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b . A falha ACL original anterior ao claim entrava no catch do emissor, que chamava a marcação de falha sem possuir reserva. A correção 4.8.86 reparou o claim, mas não cobriu essa consequência das tentativas anteriores.

## Correção delimitada

- Apenas os quatro conflitos permanentes da função de marcação mudam de 40001 para PT409; corpo restante, ACL, SECURITY DEFINER, search_path, locks e guards permanecem idênticos.
- Catch do emissor confere ownership antes da RPC de marcação; falha sem reserva conserva o erro original. Falha da reserva própria continua auditada. Concorrência segue validada novamente pelo banco.
- Emissor e worker recebem somente esse arquivo, preservando suas dependências e autenticação remotas.
- Não alterar login, Turnstile, credenciais, RLS, regras financeiras nem outros fluxos sem evidência.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-25-emissao-ciclos-permissoes.md`
- `ai/operacao/registros/alteracoes/2026-09-25-lentidao-repeticao-emissao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-issuance/claim-recovery-integration.test.ts`
- `supabase/migrations/20260925140500_stop_manual_cycle_failure_retry_storm.sql`
- `supabase/tests/local_reversal_invoker_roles.rollback.sql`

Total: 10 arquivos.

## Validação e aplicação

- Novo assert comportamental falhou antes do patch: uma RPC indevida antes do claim; depois passou, mantendo a marcação após claim próprio.
- 65 testes Deno emissor/worker/guard aprovados.
- Migration local 20260925140500 aplicada como 20260925140341. A mesma transação manteve DDL e executou fixtures sob savepoint revertido: authenticated/service_role efetivos, conflito sem claim PT409, token divergente PT409, falha própria PENDENTE_RETOMADA, listagem e estornos auditados. Zero cursos/alunos sintéticos persistidos, zero boletos de teste, EXECUTE authenticated continua negado.
- Emissor v9 e worker v9 ativos, sem mudar configuração de autenticação. Banco sem 40001 na função corrigida.
- Caso anterior: 12 boletos completos, 12 identidades distintas e 12 transações confirmados; emissão ocorreu 13:58:17–13:58:54 UTC, antes desta correção. Nenhuma emissão ou reemissão acionada pelo agente.
- Não foi usado navegador ou login. Tempo final percebido pelo usuário ainda depende do teste dele.
