# Histórico técnico Proesc sustentável

Estado: CORREÇÃO INSTALADA E PILOTO RECUPERÁVEL CONCLUÍDO — ARQUIVAMENTO AUTOMÁTICO DESLIGADO.

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
- `supabase/migrations/20260922001248_proesc_reuse_unchanged_observations.sql`
- `supabase/migrations/20260922001348_proesc_reused_observation_finish.sql`
- `supabase/migrations/20260922001351_proesc_fetch_failure_backoff.sql`
- `supabase/migrations/20260922001353_proesc_technical_archive_schema.sql`
- `supabase/migrations/20260922001411_proesc_technical_archive_commit.sql`
- `supabase/migrations/20260922001413_proesc_technical_archive_restore.sql`
- `supabase/migrations/20260922001416_proesc_technical_archive_operations.sql`
- `supabase/migrations/20260922001451_proesc_technical_history_readers.sql`
- `supabase/migrations/20260922001454_proesc_technical_history_service.sql`
- `supabase/migrations/20260922001457_proesc_technical_readers_ready.sql`
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

## Validação e limites

- Revisão dividida entre três agentes: geração, arquivamento e leitores.
- Testes focados: cobertura de backend, apresentação, autorização, corrupção, resposta de commit perdida e restauração; a cadeia final de arquivo/leitor passou em 39 testes locais.
- TypeScript, lint, build, teto de linhas e contrato operacional aprovados na validação anterior; CI do fechamento confere os arquivos finais.
- Dez migrations aplicadas, com nomes locais alinhados ao ledger e conteúdo preservado. Proesc API e arquivador técnico implantados.
- Regra de reutilização exercitada no SQL em transação somente leitura; espera progressiva conferida no SQL e no ciclo operacional.
- Piloto real de uma execução: upload imutável, download/hash, commit, leitura fria autorizada, comparação integral e restauração concluídos.
- Envelope restaurado idêntico ao original; comparativos das fontes SQL e financeiro sem diferenças. Nenhum metadado de Storage foi simulado.
- Arquivo privado do piloto preservado; payload temporário limpo e localizador frio retirado após restauração.
- Ensaios que modificam fixtures ou credenciais permanecem exclusivos de ambiente isolado; não foram executados nesta implantação.
- Confirmação de reutilização em um ciclo natural bem-sucedido permanece pendente. Os testes de contrato não são apresentados como substituto desse acompanhamento.
- Smoke visual autenticado pendente; a alteração no painel é somente explicativa e passou nos testes de renderização existentes.

## Escopo aplicado e próximas etapas

- Usuário confirmou instalação e piloto limitado. A rotina automática permanece desligada e não há cron técnico criado.
- Não houve transferência em massa do acervo nem recuperação física de espaço neste piloto. Ele comprova leitura e recuperação de uma execução.
- A geração de evidências sem novidade passa pela prova de reutilização; falhas transitórias respeitam espera progressiva limitada.
- Próxima etapa operacional: ativação controlada e transferência do acervo, com métricas de espaço e crescimento, mantendo fatos financeiros e referências históricas no banco.
- Não reaplicar as migrations instaladas nem reexecutar o piloto selecionando outra execução sem necessidade.
