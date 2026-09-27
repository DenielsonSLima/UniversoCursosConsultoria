# Consultas ociosas e rajadas do painel Banese

Versão 4.8.105 / revisão 114.

## Problema e escopo

Dez eventos Realtime podiam iniciar dez consultas concorrentes no painel Banese. A compactação Proesc calculava o hash de todo o histórico dos vínculos selecionados antes de verificar se havia candidatos.

- Janela fixa de 750 ms agrupa eventos, não posterga indefinidamente a leitura e aguarda requisições em andamento. Evento durante leitura exige releitura final.
- AbortSignal chega aos cinco RPCs de leitura; saída da tela cancela requests; falhas usam espera de 30/60 s e sem retry imediato.
- Hash histórico é executado apenas para lote com candidatos; nenhum cron, perfil, pagamento ou evidência foi removido.

## Validação

- 10 testes QueryClient/serviço aprovados; reprodução passou de dez requests concorrentes para um na mesma rajada.
- 15 cenários SQL antes/depois e duas guardas de rollback aprovados em Postgres isolado. Sem candidatos: zero leituras do histórico. Com candidatos: conteúdo, referências, cursor e retorno equivalentes; OID/ACL preservados.
- TypeScript completo e ESLint dos cinco arquivos aprovados.
- Migration aplicada via MCP com hash/identidade/permissões protegidos; definição final 6dd4df85967b028d2014c3fb8d41b4c4.
- Build completo e auditoria de linhas aprovados. Smoke autenticado do painel após publicação pendente.

## Limites do diagnóstico

A captura histórica mostrou pico, enquanto o cartão instantâneo mostrava CPU 9%. Na janela observada de 55 s não havia consultas bloqueadas, deadlocks ou rollbacks. As duas causas acima são desperdícios demonstrados; não constituem prova de toda a saturação histórica. Não se alterou a frequência da conciliação financeira.

## Manifesto explícito

Total: 12 arquivos

- `modules/gestor/configuracoes/consulta-api-banese/ConsultaApiBaneseConfig.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/consulta-api-banese.service.ts`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseRunsPanel.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/banese-realtime-refresh.ts`
- `modules/gestor/configuracoes/consulta-api-banese/banese-realtime-refresh.test.mjs`
- `supabase/migrations/20260927000500_skip_idle_proesc_compaction_history_hash.sql`
- `supabase/tests/proesc_compaction_idle_hash.isolated.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-26-cpu-consultas-ociosas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
