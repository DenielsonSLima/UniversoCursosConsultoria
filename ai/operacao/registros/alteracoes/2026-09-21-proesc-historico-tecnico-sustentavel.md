# Histórico técnico Proesc sustentável

Estado: IMPLEMENTADO LOCALMENTE — VALIDAÇÃO INTEGRADA E PRODUÇÃO PENDENTES.

## Problema e comportamento proposto

Conferências sem mudança ainda criavam evidências e detalhes técnicos permanentes. A proposta reutiliza evidência estritamente idêntica mediante autorização, concessão vigente, revisão da credencial, estado financeiro e evidência mais recente. Preserva totais por execução, polo e turma, além do horário da conferência.

Detalhes antigos de itens e HTTP passam a arquivo comprimido privado, com upload imutável, download, verificação de integridade e conferência da origem antes da retirada do payload do banco. O banco mantém os fatos financeiros e metadados necessários aos filtros, autorização, auditoria e recuperação. O Storage também requer acompanhamento de capacidade.

Falhas transitórias de consulta recebem espera progressiva limitada, sem avanço do cursor financeiro. Credencial alterada invalida a espera e a prova anterior.

## Critérios de aceite

- Nenhuma baixa, pagamento, revisão ou evidência nova é descartada por simples igualdade de status.
- Ausência, corrupção ou divergência do arquivo impede remoção da origem.
- Leitura autenticada revalida ator e escopo depois de baixar o arquivo privado.
- Piloto recuperável comprova restauração, igualdade do histórico, filtros e contadores.
- Rotina automática permanece desativada até validação integrada e piloto.
- Publicação e aplicação usam MCP e somente este manifesto.

## Manifesto explícito

- `ai/operacao/registros/alteracoes/2026-09-21-proesc-historico-tecnico-sustentavel.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`
- `eslint.config.js`
- `supabase/config.toml`
- `supabase/config-template-examples.md`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescOperationsFeed.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescConsoleOverview.tsx`
- `supabase/migrations/20260922000100_proesc_reuse_unchanged_observations.sql`
- `supabase/migrations/20260922000110_proesc_reused_observation_finish.sql`
- `supabase/migrations/20260922000120_proesc_fetch_failure_backoff.sql`
- `supabase/migrations/20260922000200_proesc_technical_archive_schema.sql`
- `supabase/migrations/20260922000201_proesc_technical_archive_commit.sql`
- `supabase/migrations/20260922000202_proesc_technical_archive_restore.sql`
- `supabase/migrations/20260922000203_proesc_technical_archive_operations.sql`
- `supabase/migrations/20260922000300_proesc_technical_history_readers.sql`
- `supabase/migrations/20260922000301_proesc_technical_history_service.sql`
- `supabase/migrations/20260922000302_proesc_technical_readers_ready.sql`
- `supabase/functions/proesc-technical-history-archive/codec.test.ts`
- `supabase/functions/proesc-technical-history-archive/codec.ts`
- `supabase/functions/proesc-technical-history-archive/fixtures.test.ts`
- `supabase/functions/proesc-technical-history-archive/handler.ts`
- `supabase/functions/proesc-technical-history-archive/index.ts`
- `supabase/functions/proesc-technical-history-archive/worker.test.ts`
- `supabase/functions/proesc-technical-history-archive/worker.ts`
- `supabase/functions/_shared/proesc-technical-history.ts`
- `supabase/functions/_shared/proesc-technical-history.test.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/functions/proesc-api/sync-worker.test.ts`
- `supabase/functions/proesc-api/sync-worker.scale.test.ts`
- `supabase/tests/proesc_unchanged_observation_reuse.transaction.sql`
- `supabase/tests/proesc_unchanged_observation_integration.transaction.sql`
- `supabase/tests/proesc_fetch_backoff.transaction.sql`
- `supabase/tests/proesc_technical_archive.readonly.sql`

Total: 39 arquivos.

## Validação e limitações

- Revisão dividida entre três agentes: geração, arquivamento e leitores.
- Testes locais: 85 do backend e 13 de apresentação passaram.
- TypeScript, lint focado, build, teto de linhas e contrato operacional aprovados. Índice operacional regenerado localmente, sem publicação de artefatos gerados.
- Ensaio inicial das migrations foi revertido; a última revisão de credenciais/backoff não foi reexecutada no banco.
- Nenhuma migration deste lote foi aplicada permanentemente; nenhuma nova Edge Function foi implantada.
- Ensaios SQL que modificam fixtures ou credenciais devem usar ambiente isolado representativo, nunca produção.
- Leitura real do arquivo, restauração e comparação dos feeds permanecem pendentes. Respostas simuladas dos testes não substituem essas provas.
- Ativação do cron, transferência do acervo, recuperação física de espaço e observação de ciclos naturais permanecem pendentes.
- Smoke visual autenticado pendente; a alteração no painel é somente explicativa, com renderização coberta pelos testes existentes.

## Sequência de implantação pendente

1. Validar o contrato SQL final em ambiente isolado e conferir drift remoto somente por leitura.
2. Aplicar migrations em ordem, preservando a rotina de arquivo desativada, e publicar os leitores/worker compatíveis.
3. Executar piloto de uma execução técnica encerrada, com download, hash, restauração e comparação antes/depois. Não simular metadados de Storage em produção.
4. Somente após o piloto íntegro, ativar rotina limitada e transferir o acervo em lotes pequenos.
5. Medir espaço efetivo e geração por ciclo; fatos financeiros e referências históricas permanecem no banco.
