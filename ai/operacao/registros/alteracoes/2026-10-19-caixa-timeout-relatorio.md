# Caixa: timeout na prestação de contas

Estado: BACKEND_APLICADO_FRONTEND_EM_PUBLICACAO. Versão 4.8.227/revisão236.
Aplicação e produção autorizadas explicitamente pelo usuário em 19/10/2026.
Base GitHub: 61578d503fe4bff8b3a9367780ac51ed0148b36b (4.8.226), preservada.
Classificação: crítica (leitura financeira). Pedido: análise interna com três
agentes, cruzamento das capturas e correção somente com causa comprovada.
Usuário restringiu expressamente o acesso ao navegador durante a análise.

## Evidência e causa

- As capturas exibem erro de `reportQuery`, antes de executar o compositor PDF.
- Logs Supabase de 20/10/2026, 00:05–00:25 UTC (19/10, 21:05–21:25 local):
  quatro falhas HTTP500/57014 no relatório, média 8,091s; três na composição
  mensal, e uma composição bem-sucedida em 5,066s. Limite SQL: 8s.
- Contexto PostgreSQL nos horários 00:14:05/00:14:14 aponta o lookup latest de
  snapshots Proesc no resolver integrado, chamado pelo core de recebimentos.
- Histórico com aproximadamente 609 mil snapshots. O JOIN anterior ordena
  todo o histórico do vínculo para cada recebível; a subconsulta escalar usa
  primeiro o vínculo único e permite encerrar cedo no índice existente.
- Leituras remotas limitadas: 20 títulos sem divergência, além de nulo e
  inexistente. Medição isolada: 10,709ms/3.404 blocos → 0,746ms/191 blocos.
  Isso não mede o relatório completo nem comprova sua recuperação.
- Índices de invoice/source e FULL/COMPLETE de 07/10 já existem; preservados.
- Três agentes cruzaram consulta React, compositor e SQL. Revisão independente
  da migration sem bloqueios. Cloudflare/Realtime não explicam o 57014 comprovado.

## Correção e aceite

- Migration troca somente a consulta latest por lookup escalar do vínculo.
  Hash remoto-base `5f0357c93d635447fd6cb21d7ea7c73c`, alvo único, constraint
  UNIQUE não postergável e metadados integrais são verificados antes/depois.
- Mesmos filtros, estados de evidência e desempates observed_at/recorded_at/id.
  Sem alterar cálculos, dados financeiros, RLS, grants ou limite SQL.
- Frontend encaminha AbortSignal e reutiliza retryDatabaseRead: não repete
  timeout PostgreSQL; mantém uma repetição para falha transitória de rede.
- SQL isolado: paridade integral, casos vazios/nulos, evidência nova conflitante,
  desempates e plano limitado; regressão financeira com 44 guardas negativas,
  prioridade documental, campos NULL, imutabilidade e ACL aprovadas.
- Query: três testes aprovados; reversão em memória fez os três falharem.
- PDF: oito testes existentes aprovados, compositor não alterado.
- Validação final `npm run test:caixa-report`: 153 aprovados, zero falhas,
  dois ignorados pelo runner existente. Dois ensaios SQL isolados aprovados.
- Manifesto inicial com nove arquivos, todos abaixo de 500 linhas; diff-check
  limpo. `npm run check:file-lines` global encontra 21 arquivos ausentes de um
  manifesto de contrato individual anterior, fora deste lote. Não corrigidos
  nem usados como lista de trabalho. Alterações paralelas foram preservadas.

## Manifesto explícito

- `modules/gestor/caixa/report/caixa-report.service.ts`
- `modules/gestor/caixa/report/caixa-report.service.test.ts`
- `scripts/test-caixa-report.mjs`
- `supabase/migrations/20261020003000_bound_caixa_latest_proesc_snapshot.sql`
- `supabase/migrations/20261020004500_gate_caixa_proesc_composition_reads.sql`
- `supabase/migrations/20261020005000_cache_caixa_proesc_candidate_plans.sql`
- `supabase/migrations/20261020005500_index_caixa_proesc_conflicting_history.sql`
- `supabase/tests/caixa_latest_snapshot_lookup.isolated.test.mjs`
- `supabase/tests/caixa_candidate_cached_plans.isolated.test.mjs`
- `supabase/tests/caixa_conflicting_history_index.isolated.test.mjs`
- `supabase/tests/proesc_paid_net_discount_rule.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-10-19-caixa-timeout-relatorio.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-01-a-04-versoes-4-8-145-a-168.md`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-10-14-alinhamento-data-pagamento.md`

Total: 19 arquivos.

## Limites da entrega

Migration aplicada via MCP no projeto kfekgwyqozhicpfuunpo, ledger 20261020003607.
Fonte local 20261020003000 preservada integralmente; prefixo remoto foi atribuído
pelo MCP. Readback hash c4cbe356f04f83c78fd80747af6f47dc; função STABLE,
SECURITY DEFINER, search_path vazio e ACL postgres/service_role preservados.
Publicação frontend usa apenas este manifesto sobre a base remota atual,
sem enviar o estado amplo do workspace. Histórico antigo foi movido integralmente
para arquivo próprio para manter CHANGELOG abaixo de 500 linhas.
Gates de avaliação aplicados em 20261020004054 e wrappers de plano em
20261020004342. A consulta de cada candidate foi preservada integralmente;
os testes de 44 negativas de desconto e 22 de antecipação passaram, além
de paridade, ACL, imutabilidade, prioridade documental e guardas de drift.
Perfil transacional do core:6,62s, dos quais6,13s em71 chamadas do candidate
líquido. O último ajuste, ledger20261020004958, adicionou índice parcial válido
de442.368bytes e pré-filtro necessário mantendo a guarda histórica inteira.
No recorte76 títulos,55.600 históricos→474 relevantes, zero divergências.
Planos genéricos ficam escopados às duas candidatas; consultas parametrizadas
e evidências continuam avaliadas por chamada, sem cache de resultados.
Teste final inclui44 negativas de desconto e22 de antecipação, índice usado
com2.000 observações OPEN inofensivas por título e paridade/ACL/drift.
Após aplicação, RPC completa global de outubro sob service_role e limite8s
retornou versão7/completo=true em6.531,6ms e4.685,2ms na repetição. Composição
v2 recusou service_role por sua ACL (42501), preservada. Mês futuro recusado
pela regra canônica de posição total (22023), preservada. Nenhum limite global
da aplicação foi alterado. Build completo e TypeScript aprovados.
Smoke visual e conferência no perfil autenticado do usuário ficam reservados
ao usuário; a validação interna não equivale a esse smoke.
CI remota identificou ausência do total declarado no registro anterior de
alinhamento da data. Acrescentado somente `Total: 7 arquivos.` àquele registro,
preservando integralmente seu manifesto e produto. Sem alteração de políticas.
Navegador não será usado nesta tarefa conforme instrução do usuário.
