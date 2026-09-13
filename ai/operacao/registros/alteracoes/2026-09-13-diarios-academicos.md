# Migração dos diários acadêmicos

Estado: histórico migrado no Supabase; versão 4.8.54, revisão 63, preparada localmente. Publicação do frontend e smoke visual autenticado ainda pendentes.

## Pedido e escopo

- Analisar os DOCX, cadastrar docentes somente pelo nome e conferir turmas, alunos, cronograma, aulas, conteúdo, frequência e notas antes da migração.
- Usar o cronograma técnico oficial como referência de carga. Não fabricar datas, presenças, notas ou aulas para completar diferenças documentais.
- Preservar a matrícula exata. Um aluno em outra turma pode estar refazendo disciplina; o documento não autoriza transferi-lo ou conceder aproveitamento.
- Quatro frentes independentes trabalharam em fontes, contrato acadêmico, segurança da gravação e consulta. A conversão foi interna, conforme orientação do usuário.

## Fontes e resultado da migração

- 17 arquivos locais, 14 diários distintos por SHA-256: 12 T41 e dois T42. Três cópias binárias idênticas foram deduplicadas. Originais preservados e revalidados por hash.
- Onze docentes cadastrados somente com nome documentado, sem CPF, e-mail, identidade fictícia ou acesso ao portal. Foram atribuídos a 14 diários: 12 T41 e dois T42.
- T41 recebeu a grade oficial de 27 disciplinas em três períodos PLANEJADO, com datas não comprovadas mantidas nulas. Não houve alteração do estado acadêmico dos alunos.
- A RPC importou 14 fontes e 122 aulas documentais. Das 389 ocorrências de aluno/diário, 369 foram vinculadas à matrícula exata; 20 permanecem sem correspondência conclusiva.
- Foram preservadas 3.218 marcações vinculadas, das quais 3.006 estão conferidas. Os resultados contêm 284 notas conferidas e 85 em revisão.
- Quatro identidades concentram as 20 ocorrências sem vínculo. Nomes e demais dados pessoais não integram este registro versionado.

## Contrato e proteções

- Fontes, aulas, frequências e resultados históricos ficam em tabelas privadas de internal_academic, com RLS, privilégios restritos, referências por célula e importação idempotente.
- Identidades históricas usam a matrícula exata, inclusive quando seu status atual não permite lançamento operacional. A leitura não concede nova permissão de escrita.
- Diário, histórico acadêmico e snapshot consomem o mesmo resolvedor de resultados. A consulta de detalhes usa essa decisão para apresentar o estado de conferência.
- Médias escritas não são recalculadas pela soma dos instrumentos atuais. Zero, vazio e traço permanecem distintos; falta de prova não vira nota, presença ou aprovação.
- Aprovação documental contraditória fica em conferência sem corrigir a nota por inferência. O documento original continua preservado como evidência.
- Guards de notas e frequência impedem a mistura com resultados históricos. O importador e as escritas acadêmicas compartilham lock por turma/disciplina, incluindo a presença de aulas no escopo.
- A consulta histórica é somente leitura. Seus indicadores vêm do servidor; o frontend formata os valores e mostra fontes, instrumentos repetidos e pendências.
- Cards de disciplinas usam consulta com indicadores históricos do servidor, evitando apresentar zero horas ou ausência de lançamento quando existe fonte importada. Datas não comprovadas continuam nulas.
- O editor operacional e seus hooks de exportação só são montados após resposta explícita de ausência de histórico. Erro, consulta pendente ou histórico existente mantêm esse caminho protegido.
- Cache da lista e do detalhe separado por ator, contexto, polo e escopo acadêmico; a entrada revalida a ausência de histórico antes de liberar o editor. Respostas incompletas e membros inválidos falham de forma protegida.
- Fechamento, promoção, aproveitamento e PDF preenchido histórico não foram liberados pela migração.

## Validação executada

- Ensaios SQL com rollback validaram a regularização estrutural e a importação integral, incluindo replay das 14 fontes sem duplicação. A gravação real foi seguida de conferência agregada.
- Treze migrations de estrutura, guardas e contratos foram aplicadas por MCP Supabase. Dois registros adicionais de ensaio são no-ops auditados; seus scripts de teste permanecem versionados.
- A consulta dos cards foi aplicada como `20260913044848_diario_cards_historical_overlay.sql`. Teste somente leitura com rollback passou para T41 e T42: campos e ordem do getter operacional preservados, resumo histórico coerente e acesso sem identidade negado.
- Os hashes de 67 matrículas e 1.132 cobranças são idênticos antes e depois. Nenhuma emissão, baixa ou alteração financeira integra este lote.
- Projeção SQL testada com fontes sintéticas: preservação de média escrita e REC, zero explícito, campos nulos, revisão independente de nota/frequência e ausência de aprovação inferida.
- Testes de autorização negam leitura sem identidade autorizada. Snapshot mantém segurança do invocador e a projeção histórica não expõe as tabelas de evidência.
- Oito testes da interface passaram, cobrindo instrumentos repetidos, fonte textual, estados de revisão, ausência de editores, frequência desconhecida, JSON nulo/inválido, encerramento sem data e card histórico com período PLANEJADO e datas nulas.
- Dez renderizações SSR das cinco abas passaram com duas respostas RPC reais, de Anatomia T42 e Informática T41. Essa checagem não substitui o smoke visual autenticado.
- TypeScript e build completo passaram. Versionamento e teto de 500 linhas foram conferidos no manifesto explícito.
- Revisão independente encontrou e corrigiu divergência no estado de resultado, exibição de média em revisão, cache de ausência de histórico e itens nulos no fechamento.

## Pendências e limites

- Oito diários apresentam divergência de carga; 113 datas permanecem em revisão. Não redistribuir horas nem mover aulas para sábados sem comprovação.
- Esclarecimentos sobre calendário, carga e regras de médias ainda não foram respondidos. Valores comprovados ficam preservados; registros contraditórios permanecem em conferência.
- Resolver as quatro identidades pendentes com evidência de matrícula ou dependência, sem criar alunos por aproximação de nomes.
- Smoke visual autenticado no Safari pendente de sessão de acesso. Build e testes não substituem a validação dessa interface com dados autorizados.
- Publicação do frontend ainda não confirmada neste registro. Migrations já aplicadas são imutáveis; correções subsequentes devem usar nova migration.
- Não versionar DOCX, nomes de alunos, notas individuais, payloads, dumps, capturas, hashes de registros pessoais ou artefatos regeneráveis.

## Manifesto explícito

Total: 42 arquivos. Publicar somente estes caminhos; preservar todo trabalho paralelo fora deste manifesto.

- `supabase/migrations/20260913042627_dry_run_historical_diaries_contract.sql`
- `supabase/migrations/20260913043200_dry_run_historical_diaries_full_validation.sql`
- `supabase/migrations/20260913043244_historical_technical_structure_registry.sql`
- `supabase/migrations/20260913043249_historical_technical_structure_guards.sql`
- `supabase/migrations/20260913043251_regularize_historical_technical_structure_rpc.sql`
- `supabase/migrations/20260913043254_diario_historical_source_ledger.sql`
- `supabase/migrations/20260913043256_diario_historical_import.sql`
- `supabase/migrations/20260913043300_diario_historical_read.sql`
- `supabase/migrations/20260913043302_diario_historical_result_projection.sql`
- `supabase/migrations/20260913043304_diario_historical_roster_results.sql`
- `supabase/migrations/20260913043307_diario_historical_enrollment_results.sql`
- `supabase/migrations/20260913043309_diario_historical_snapshot_results.sql`
- `supabase/migrations/20260913043312_diario_historical_operational_write_guard.sql`
- `supabase/migrations/20260913043454_diario_historical_read_result_state.sql`
- `supabase/migrations/20260913044848_diario_cards_historical_overlay.sql`
- `supabase/tests/historical_technical_structure.rollback.sql`
- `supabase/tests/diario_historical_import.rollback.sql`
- `supabase/tests/diario_historical_result_projection.transaction.sql`
- `supabase/tests/diario_cards_historical_overlay.rollback.sql`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.defaults.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/TurmaDiarioCard.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/TurmaDiarios.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/turma-diarios.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/turma-diarios.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useTurmaDiarios.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioSessionIdentity.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioHistoricoBoundary.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioHistoricoCardResumo.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioHistoricoFrequencia.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioHistoricoResultados.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/DiarioHistoricoTabs.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/HistoricalField.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.issues.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.types.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-13-diarios-academicos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
