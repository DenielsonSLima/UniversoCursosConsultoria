# Incidente de login e ingestão de logs — 25/09/2026

Estado: PUBLICADO — backend aplicado; frontend 4.8.90 em produção; causa física da indisponibilidade permanece não confirmada.

## Objetivo e aceite

Eliminar espera indefinida do login e os códigos de erro de domínio que causam repetição transacional, preservando autorização, idempotência e dados financeiros. Validar prazo, cancelamento e resposta tardia; preservar migrations aplicadas; confirmar saúde após recuperação/publicação. Usuário autorizou corrigir e normalizar o sistema e depois fará o teste de login. Autorizou explicitamente exceção para reinício pelo painel, pois MCP não oferece essa ação.

## Evidências

- Capturas mostram Turnstile concluído e botão preso em “Autenticando”.
- MCP confirmou projeto `kfekgwyqozhicpfuunpo`; consultas SQL e ledger de migrations falharam por timeout de conexão.
- Em 25/09 UTC: aproximadamente 502 mil eventos Postgres, 16 mil gateway e 157 Auth. Contagens são eventos de serviço, não visitantes.
- 478.985 erros `40001` de divergência de autorização em `mark_technical_manual_cycle_banese_failure`, entre 12:34:39Z e 13:57:25Z; quatro chamadas gateway à função na janela.
- Outros 1.864 erros `40001` de replay incompatível em `authorize_technical_manual_receivable_issuance_secure`.
- À noite: `PGRST002`, timeouts no catálogo e banco marcado “Unhealthy / Database not usable”; painel mostrou CPU 98%.
- Origem agregada das chamadas: Edge/Deno do fluxo interno. Não há evidência de invasão nessa amostra; não constitui auditoria global de segurança.
- Aproximadamente 1,25 GB de payload Postgres no período; Auth aproximadamente 132 KB.
- Main remoto 4.8.89 contém hotfix 4.8.87: `20260925140500_stop_manual_cycle_failure_retry_storm.sql`, ledger `20260925140341`, já converteu quatro rejeições de mark_failure para PT409. Este lote o preserva e corrige sete rejeições restantes em quatro funções diretamente relacionadas.
- Não há novos 40001 após 14:00Z. Rastreamento posterior refinou o início dos timeouts: exporter às 13:03 locais (16:03Z), APIs às 13:39 locais (16:39Z) e schema cache às 14:39 locais (17:39Z), no fuso America/Maceio. Essa evidência substitui a aproximação inicial de 18:00Z; a causalidade e a persistência da indisponibilidade seguem em investigação.
- Reinício final confirmado por `pg_postmaster_start_time`: 23:59:09Z (20:59 locais). SQL respondeu normalmente em 26/09 às 00:06Z; o usuário confirmou login às 00:23Z (21:23 locais), ainda com o frontend anterior.
- Supabase documenta o mesmo mecanismo: [SQLSTATE 40001 provoca retries infinitos](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Processos já presos podem exigir encerramento individual após identificação, além da correção da função.
- Nova captura do portal do aluno confirmou a necessidade de proteger também o resolvedor público: o fluxo descartava o usuário recém-autenticado e repetia getUser sem prazo. A correção reutiliza essa identidade e limita a resolução dos perfis.
- `portal-auth` v16 publicada via MCP e payload remoto conferido; migration `stop_manual_cycle_validation_retries` aplicada com sucesso no ledger `20260926000726`, mantendo a fonte versionada `20260925235500_stop_manual_cycle_validation_retries.sql`. O teste contratual remoto passou com quatro rejeições, snapshots preservados e rollback integral; aplicação bem-sucedida não é apresentada como prova de saúde sustentada.
- Conferência pelo MCP GitHub contra main `807c8f66128379c3f3d2831230aaec64332c111c`: arquivos Auth/aluno existentes equivalem à base local anterior ao patch. `package.json` remoto já incluía o teste Turnstile; a entrega apenas acrescenta testes Auth/aluno/backend, preservando dependências e scripts existentes.

## Divisão e reunião dos agentes

- Login: transporte sem dependência da sessão anterior, prazos e prevenção de continuação tardia.
- Logs: agregação remota e correção restrita dos códigos de erro de domínio.
- Revisão: confirmação independente do mecanismo e revisão dos contratos e testes.
- Coordenador: reprodução visual, integração, manifesto e validação final.
- Consenso: Cloudflare cross-origin isolado não demonstra falha do desafio; banco indisponível explica o bloqueio atual. Não reduzir proteção nem silenciar logs para esconder a causa.

## Manifesto explícito

- `lib/supabase.ts`
- `lib/portal-auth-client.ts`
- `modules/login/auth-request.ts`
- `modules/login/auth-request.test.mjs`
- `modules/login/login.service.ts`
- `modules/login/portal-context.service.ts`
- `modules/login/LoginPage.tsx`
- `modules/login/institutional-login-timeout.test.mjs`
- `modules/login/portal-login-boundaries.contract.test.ts`
- `modules/public/login/aluno-public-session.service.ts`
- `modules/public/login/useAlunoLoginPublicPage.ts`
- `modules/public/login/aluno-login-timeout.test.mjs`
- `scripts/test-portal-auth-flow.mjs`
- `package.json`
- `supabase/functions/portal-auth/index.ts`
- `supabase/functions/portal-auth/request-security.ts`
- `supabase/functions/portal-auth/request-resilience.test.mjs`
- `supabase/migrations/20260925235500_stop_manual_cycle_validation_retries.sql`
- `supabase/tests/manual_cycle_validation_retries.rollback.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-25-incidente-login-logs.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 24 arquivos.

## Validação e limites

- Conjunto integrado: 81 testes aprovados via `npm run test:portal-auth`, incluindo institucional, aluno, callback Google, timeout, cancelamento, resposta tardia e handler backend. Typecheck focado dos arquivos Auth/aluno sem erros.
- Aluno: sete testes novos comprovam sucesso único, proteção contra duplo submit, encerramento de loading, cancelamento na desmontagem, descarte de perfil tardio, prazo de callback Google e reutilização do usuário autenticado. Google web/native respeita a mesma guarda de mutação Auth pendente.
- Backend Auth: sete testes do handler com transporte simulado aprovados; rate limit falha fechado, Auth indisponível/body lento retorna503, sucesso preserva tokens sem cache. Deno check aprovado.
- Financeiro: 19 testes existentes aprovados; migration revisada e aplicada via MCP. Teste remoto corrigiu fixture ausente e passou: quatro rejeições verificadas, snapshots completos preservados e ROLLBACK. Confirmados sete PT422, zero 40001 nas cinco funções e PT409 do hotfix anterior preservado.
- SDK não cancela setSession/signOut: o gate impede outra tentativa enquanto essas operações reais estão pendentes, sem navegação tardia. Não declarar isso como cancelamento da operação SDK.
- Smoke visual local aprovou os dois formulários, institucional e aluno. O login real confirmado pelo usuário às 21:23 locais comprova recuperação do serviço com o frontend anterior; não é apresentado como teste autenticado da release 4.8.90.

## Rastreio da indisponibilidade posterior

- Horários locais America/Maceio: compactação terminou normalmente às 12:50 (3,2 s). Às 12:51, cinco rotinas independentes falharam com job startup timeout antes de executar SQL; às 12:51:20 surgiram falhas SSL EOF. Depois ocorreram os timeouts de API e catálogo descritos acima.
- Nenhum commit main após 12:18 nem publicação Edge entre 13:00 e a queda. Não foram encontrados novos 40001, reinício, disco cheio, deadlock ou OOM nessa janela. Ausência nos logs não exclui falha de infraestrutura.
- Última amostra de CPU antes da queda, às 12:50 locais (15:50Z), foi 7,71%, com 26/60 conexões. A coleta de memória interrompeu às 12:56 locais (15:56Z). Disco aproximadamente 0,8/2 GB estava estável; swap de aproximadamente 0,9 GB já existia antes do episódio matinal. Memória committed aproximadamente 1,82 GB acima do limite mostrado não comprova OOM. Esses dados não demonstram CPU, disco ou limite de conexões como causa física.
- Após reinício, verificações às 21:06 e 21:10 responderam em poucos segundos, sem sessões bloqueadas ou consultas presas; banco principal aproximadamente 481,8 MB. A soma com os templates atingiu aproximadamente 496,95 MB, explicando os 497 MB do painel e deixando margem de apenas 3,05 MB para 500 MB. Não atribuir a queda a essa margem sem evidência de esgotamento físico.
- A causa física posterior ao loop continua desconhecida. O pedido de análise ao suporte deve se concentrar em 15:45–16:15Z e examinar host, paginação, CPU, I/O e supervisor. O pico matinal de 40001 e o início posterior das falhas são eventos temporalmente distintos; não afirmar causalidade comprovada entre eles.
- Solicitação enviada pela interface do suporte Supabase, com confirmação “Support request sent”. Nenhum número foi exibido; resposta esperada no e-mail da conta. Acesso adicional do suporte permaneceu desativado. O envio não implica diagnóstico ou revisão de consumo aceitos pelo fornecedor.
- O consumo aproximado de 24/09, sem o incidente, foi 100,9 MB/dia de payload de logs. A redução de chamadas periódicas sem trabalho está registrada no lote complementar `2026-09-25-reducao-chamadas-ociosas.md`; não há projeção validada de consumo abaixo de 1 GB/ciclo.
- Build 4.8.90, check:version e check:file-lines aprovados. Publicação usa main remoto mais manifesto; registro de limites composto da base remota, preservando entradas paralelas locais.

## Publicação e smoke

- [PR182](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/182) publicou exatamente 24 arquivos; commit main `ddafd0634d457784fbf931aab84a4b78e7521758`. CI de qualidade e controle de versão aprovados.
- A tela branca da Preview foi diagnosticada pelo console como ausência de variáveis Supabase naquele ambiente. A fábrica pública foi validada separadamente sem efeitos durante o import; não houve evidência de ciclo de módulos como causa. O ambiente Preview requer configuração própria antes de servir como aceite visual.
- Deploy de produção `4cVVvtvwATgqWuVJfFd1H7Ahm8nh` concluído com sucesso. Asset `/assets/main-DWo0zUDL.js` contém a release 4.8.90 e configuração pública correta do Supabase; valores de chaves não são registrados.
- Permanecem distintos os aceites: formulários locais renderizados, produção publicada e login real com frontend anterior. Monitoramento e confirmação autenticada da nova release devem registrar sua própria evidência.
