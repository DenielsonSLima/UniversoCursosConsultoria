# Consulta API Proesc e acompanhamento Banese

## Estado da entrega

Entrega 4.8.52 publicada no PR146, squash b2b11a5cbd5fba8e4fd8fdea8d76b537e9add785, com CI e Vercel aprovados. O ledger de execuções Proesc já foi aplicado no banco. A projeção de recuperação do histórico Banese também foi aplicada e conferida, sem alteração de títulos, pagamentos ou filas.

Seis unidades SQL isoladas passaram após otimização dos índices. Instrumentação Edge v7 publicada via MCP; interface validada no Safari autenticado. Interface em produção conferida por HTTP200 e Safari autenticado, incluindo Caixa, Recebíveis e os filtros Proesc/Banese.

## Resultado preparado

- Configurações ganha o cartão **Consulta API Proesc**, separado do cartão existente de token e histórico por turma.
- Cinco abas: Visão geral, Execuções, Consultas, Baixas e Erros. Filtros de polo/período, contadores e paginação vêm das RPCs autorizadas.
- Abrir a tela lê o acompanhamento interno. A tela não importa alunos, emite cobranças, executa o worker nem chama diretamente a API externa Proesc.
- Consultas representa observações por cobrança. Uma requisição HTTP pode atender várias cobranças; contagens de observações não são contagens de requisições.
- Baixas identificam automação, importação e correção. Observações em conferência ficam separadas dos erros operacionais.
- O histórico detalhado de execuções começa com a nova instrumentação. Observações/importações anteriores não são convertidas em execuções históricas fictícias.
- Aluno, descrição, referência e valores somente aparecem com a capacidade financeira concedida pela RPC. Nenhum token ou CPF integra o painel.
- Observações em revisão recebem valor recebido e data de pagamento nulos quando não comprovados. O frontend mostra “Não informado”, sem apresentar zero como ausência comprovada de pagamento.
- Os dados monetários e a classificação financeira continuam no Supabase. O frontend apenas apresenta campos, formata valores/datas e controla navegação.

## Consulta API Banese

A projeção distingue o resultado da tentativa histórica, a situação atual do título, a última consulta e o estado da fila. Foram identificados **479 eventos de erro em 51 títulos**: 478 eventos de 50 títulos têm consulta posterior bem-sucedida. Um evento pertence a título atualmente pago/DONE, sem GET posterior comprovado. Nenhuma falha ativa foi identificada nesses títulos.

Essa recuperação é uma informação de leitura. Não apaga erros passados, não comprova pagamento por si só e não altera recebíveis ou filas. Um título pago sem nova consulta comprovada recebe descrição distinta.

## CNAB sob demanda

O resumo CNAB240 deixa de ser consultado ao abrir a lista de Conciliação & Baixas. A consulta é habilitada nas abas Remessas, Retorno e Diagnóstico, que usam esses dados.

Desativação, desmontagem e invalidação de uma consulta desativada não provocam nova busca CNAB. Erros de configuração, como EDI7 ou convênio pendente, continuam visíveis no diagnóstico. Prévia e confirmação explícita de remessa/retorno permanecem preservadas.

## Incidente durante a validação

Entre **21:24 e 21:26 de 12/09/2026**, horário de Maceió, a validação de uma consulta Proesc pesada coincidiu com 45 cancelamentos SQL (`57014`), dos quais 41 por tempo limite e quatro por solicitação e falhas nas telas Financeiro/Caixa. O painel Proesc não estava aprovado para publicação.

No mesmo intervalo, o Auth registrou `GET /user` com 504 e 500. A função `payment-gateway-api` v32 retornou um 401 durante essa indisponibilidade: sua guarda converte qualquer falha de `auth.getUser` em “sessão inválida”. Houve execução da função, e as chamadas subsequentes voltaram a 200. Isso não comprova JWT ausente ou perda da sessão do usuário; nenhum token ou armazenamento de sessão foi inspecionado.

A recuperação de Financeiro e Caixa foi posteriormente comprovada pelo responsável pela integração. A investigação de performance Proesc prosseguiu isoladamente, sem repetir consultas pesadas pelo navegador.

## Política de atualização após erro

- Em sucesso, a política prevê atualização a cada 30 segundos; a liberação depende da medição de performance das RPCs.
- Após erro, o intervalo automático para. Não há retry automático, retomada por foco da janela ou reconexão.
- `retryOnMount:false` e `refetchOnMount:false` impedem retomada ao remontar, inclusive quando existem dados anteriores e o último refresh falhou.
- A tentativa explícita continua disponível ao usuário. Datas inválidas são recusadas antes de `toISOString`; falhas RPC usam mensagens locais fixas, sem exceções livres do servidor.

## Validação realizada

| Frente | Evidência |
| --- | --- |
| UI Proesc | 13 testes aprovados; TypeScript focado sem diagnóstico e ESLint sem erros |
| Edge Proesc | 15 testes Deno aprovados, conforme fechamento da frente backend |
| UI Banese | 4 testes aprovados; TypeScript e ESLint aprovados |
| CNAB sob demanda | 13 testes do conjunto relacionado aprovados; TypeScript e ESLint aprovados |
| SQL Banese | Teste somente leitura aprovado após aplicação da projeção |
| Visual local | Componentes reais com dados sintéticos: desktop e mobile sem overflow; página 1 → 2 e mudança de polo → página 1 comprovadas |

Os testes Proesc cobrem contadores do servidor, origem das baixas, conferência, detalhes financeiros restritos, paginação, HTTP indisponível por polo, apresentação de erros, datas inválidas, mensagens sanitizadas, valor recebido desconhecido e identidade protegida.

O teste com `QueryObserver` real cobre a regressão de remontagem: sucesso na primeira chamada, erro na segunda com dados preservados, remontagem sem terceira chamada e nova chamada somente por tentativa explícita.

Os artefatos visuais são regeneráveis e permanecem em diretório temporário. Eles não substituem o smoke autenticado do fluxo publicado.

## Banco, execução e desempenho

- Sete migrations Proesc e uma Banese aplicadas por MCP; fontes mantidas imutáveis. Helpers de escopo, índices de prova PAID/VERIFIED e projeção de observações evitam carregar payload completo para contagens.
- Teste transacional do ledger passou com ROLLBACK integral e equivalência dos fatos financeiros; sem fixtures persistidas.
- Teste SQL cumulativo original excedeu o tempo limite e foi substituído por seis unidades independentes, limitadas a três segundos. Autorização negativa: 70 ms; dashboard: 2.475 ms na primeira leitura; execuções: 23 ms; observações: 337 ms; baixas: 913 ms; erros: 56 ms. A primeira carga do dashboard continua mais lenta que os feeds, sem timeout no teste final.
- Edge Proesc v7 preserva dez arquivos remotos byte a byte, com overlay apenas do worker e nova telemetria. Cron real às 21:50/21:52 concluiu 60 consultas por execução, 25/30 requisições HTTP, zero falha e telemetria completa. Timeout real às 21:48 e interrupções associadas foram preservados no histórico; nenhuma baixa foi inventada.
- TypeScript global aprovado e build final aprovado em 7,36 s. HTTP ausente em execução global é apresentado como Não registrado; restrição por polo usa rótulo distinto.

## Manifesto explícito

Total: 42 arquivos.

Publicar somente estes caminhos sobre 02409544d1def71a655e2831c0a6c72cd30fc891. Registro de manifestos remoto recebe apenas este lote; referências locais paralelas ficam preservadas fora da publicação.

- `supabase/migrations/20260913021000_banese_attempt_recovery_projection.sql`
- `supabase/tests/banese_attempt_recovery.readonly.sql`
- `modules/gestor/configuracoes/consulta-api-banese/consulta-api-banese.types.ts`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseAttemptsTable.tsx`
- `modules/gestor/configuracoes/consulta-api-banese/BaneseAttemptsTable.test.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/hooks/useBaneseConciliacaoQueries.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/ConciliacaoBancariaTab.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/banese-cnab-demand.test.ts`
- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ConsultaApiProescConfig.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescConsoleOverview.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescOperationsFeed.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.filters.ts`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.query-policy.ts`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.service.ts`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.test.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.types.ts`
- `supabase/migrations/20260913020000_proesc_execution_ledger.sql`
- `supabase/migrations/20260913020010_proesc_runtime_execution_hooks.sql`
- `supabase/migrations/20260913020020_proesc_monitor_dashboard.sql`
- `supabase/migrations/20260913020030_proesc_monitor_feeds.sql`
- `supabase/migrations/20260913020040_proesc_monitor_set_based_scope.sql`
- `supabase/migrations/20260913020050_proesc_monitor_paid_proof_indexes.sql`
- `supabase/migrations/20260913020060_proesc_monitor_observation_index.sql`
- `supabase/functions/proesc-api/sync-worker.ts`
- `supabase/functions/proesc-api/sync-telemetry.ts`
- `supabase/functions/proesc-api/sync-worker.test.ts`
- `supabase/tests/proesc_execution_ledger.transaction.sql`
- `supabase/tests/proesc_monitor.readonly.sql`
- `supabase/tests/proesc_monitor_dashboard.readonly.sql`
- `supabase/tests/proesc_monitor_runs.readonly.sql`
- `supabase/tests/proesc_monitor_observations.readonly.sql`
- `supabase/tests/proesc_monitor_settlements.readonly.sql`
- `supabase/tests/proesc_monitor_errors.readonly.sql`
- `supabase/tests/proesc_monitor.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/registros/alteracoes/2026-09-12-consulta-api-proesc-banese.md`
- `ai/operacao/registros/alteracoes/2026-09-12-caixa-indicadores-mensais.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

## Smoke autenticado local

- Safari no localhost, sessão de gestor e RPCs reais: Configurações abriu sem tela branca; cinco abas Proesc carregaram, incluindo falha TIMEOUT real e observações em conferência. Paginação 1→2 e troca para Aquidabã→página1/1.715 registros confirmadas.
- Banese: tela de erros exibe 479 eventos históricos, a recuperação posterior e o estado atual de cada título sem confundir recuperação com pagamento.
- Conciliação: filtro Proesc retornou 2.058 registros; Banese retornou 56, dos quais 55 com baixa API. Contadores e origem seguiram o filtro canônico.

## Publicação e limites

Usuário renovou autorização para corrigir e publicar em 12/09 às 21:09. Base 4.8.51/02409544; revisão 61/4.8.52. CI/Preview e produção aprovados no commit atômico deste manifesto; versão pública 4.8.52 confirmada no Safari autenticado.

- Diagnóstico CNAB autenticado confirmou Configuração CNAB240 pendente por ausência do EDI7 real. A integração API Banese permanece independente. Nenhuma credencial foi alterada.
- As exclusões mensais 56/110 do Caixa permanecem: fonte Proesc UNKNOWN/REVIEW não comprova baixa nem aberto integral. Em setembro, 20 dessas cobranças venceram e 90 ainda não. Nenhum valor foi inventado para remover o aviso.
- Atualização automática do painel pausa após erro; a primeira carga do dashboard pode levar cerca de 2,5 segundos. Histórico sem telemetria anterior mantém campos desconhecidos.
- Artefatos gerados, caches e três referências de lotes locais paralelos ficam fora da publicação.

Este registro não inclui mudanças em Caixa, novas importações financeiras ou alteração das credenciais bancárias/Proesc.
