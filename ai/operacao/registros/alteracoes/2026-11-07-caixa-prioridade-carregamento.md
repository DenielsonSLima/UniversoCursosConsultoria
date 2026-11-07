# Caixa — prioridade de carregamento e linha de corte

## Objetivo e base

Etapa 1 do plano autorizado: melhorar a apresentação inicial da prestação mensal e a consistência da linha de corte no módulo Caixa ativo. Sem redesign principal, alteração de cálculo financeiro, RPC, schema, autorização ou PDF. O frontend continua apresentando valores canônicos do backend.

Base: Parceiros 4.8.252 integrada pela PR #347, merge 2b29a02745fe44ebc7f64373c67123235103d6b5, com 14 checks verdes. Produção 4.8.252 confirmada READY pelo responsável no deployment dpl_8bJCAmbfhmQq97jHZEM4yX1bXTdY, com aliases do domínio principal e www. Verificação HTTP real: domínio raiz redireciona para www, resposta 200 e asset /assets/main-B-U3s2jt.js 200 contendo 4.8.252. Essa prova confirma entrega pública, sem sessão autenticada ou acesso a dados. Entrega Caixa preparada como 4.8.253, revisão 262, em 07/11/2026.

## Manifesto explícito

- `.github/workflows/caixa-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-07-caixa-prioridade-carregamento.md`
- `docs/analises/caixa-carregamento-calculos-2026-11-07.md`
- `docs/planos/padronizacao-visual-etapas-2026-11-07.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/caixa-first-summary.behavior.test.mjs`
- `modules/gestor/caixa/caixa-linha-corte.realtime.test.tsx`
- `modules/gestor/caixa/useCaixaRealtime.ts`
- `scripts/test-caixa-report.mjs`

Total: 14 arquivos.

## Estado do manifesto

Manifesto consolidado das duas frentes, regressões CI e documentação. Validação local concluída pelo responsável nos limites abaixo; build e TypeScript finais de integração aprovados. RAG gerado uma única vez nesta etapa; sincronização do workspace e operações remotas continuam reservadas ao comando do responsável. Não se afirma ganho real de produção.

## Escopo implementado e fronteiras

- Montar a query da prestação antes da posição a receber no CaixaPage real, mantendo as 10 leituras, fila serial, detalhes interativos prioritários, cancelamento e todas as validações de escopo/competência.
- Incluir linha de corte na invalidação Realtime mensal com escopo e consolidado, sem aplicar delta financeiro no cliente nem refetch desnecessário de consultas inativas.
- Não alterar limites históricos, coerção/precisão, números, status, provas de pagamentos, elegibilidade, cálculos, políticas, API, migrations, cache TTL ou exportador para anunciar rapidez.
- Diagnóstico e limites quantitativos em docs/analises/caixa-carregamento-calculos-2026-11-07.md. Médias SQL históricas não são TTI atual; ensaio sintético de ordem não comprova redução real de produção.

## Evidências disponíveis

Auditoria local e definições aplicadas indicam custo histórico em composição/carteira e espera da prestação atrás da posição a receber na mesma fila. O ensaio controlado com página real, delays fixos e zero rede antecipa o resumo DOM de 3714,1 ms para 1493,1 ms em uma execução; mantém o trabalho pesado total e as consultas. Isso comprova o efeito da ordem no simulador, não ganho real de produção.

EXPLAIN VERBOSE JSON remoto somente leitura, sem ANALYZE, confirmou Aggregate → FunctionScan de cash_receivables com filtro externo de polo/status nesse plano; não mede execução nem prova helper dominante. Helpers inspecionados STABLE e search_path vazio em cash_receivables. Nenhuma migration; eventual refinamento SQL exigirá equivalência e medição próprias, sem atribuir ganho ao patch atual.

Não foi identificado cálculo financeiro no caminho frontend auditado; mappers/formatadores/geometria não devem ser confundidos com contabilidade. O objetivo desta etapa é ordem de leitura e frescor, preservando os motores financeiros canônicos.

## Validação e limitações

Frente da prestação informada pelo agente: patch move o mesmo bloco de posição para depois da prestação, sem alteração no conteúdo. Teste DOM do CaixaPage real mostra a prestação enquanto a posição ainda aguarda, com sete resumos independentes, dez consultas válidas e zero fetch externo. Um teste novo e seis existentes da fila passaram, assim como lint das duas fontes e TypeScript. A mesma prova falha contra a ordem anterior, confirmando controle negativo.

Realtime: teste do hook/cache com QueryClient real passou 6/6 (pai e cinco cenários), após reproduzir quatro falhas afetadas na base e preservar o cenário patrimonial. Contratos existentes de escopo/linha de corte passaram 15/15; lint das duas fontes e TypeScript completo aprovados. Eventos polo/global/fallback, consulta inativa sem fetch, cleanup e outros módulos preservados; zero RPC remoto.

Revisão independente dos quatro arquivos contra a base 4.8.252 confirmou só a ordem da query e os dois prefixos financeiros: contratos, chaves, argumentos, guards e alvos de patrimônio intactos. Página 1/1 e demais regressões 27/27, lint das quatro fontes e teto 368/203/188/162 linhas aprovados.

CI integrado por .github/workflows/caixa-regressions.yml e modo --performance do runner existente scripts/test-caixa-report.mjs: Node 24 com mínimo 24.22.1, jsdom 26.1 temporário e permissões somente leitura, sem secrets. O comando node scripts/test-caixa-report.mjs --performance, com CAIXA_JSDOM_PATH definido, passou 7 testes; lista default de 27 testes do relatório e quality-gates.yml de 500 linhas preservados. O waitFor do teste usa scheduler real sob act e a base 4.8.252 continua falhando por ordem. Fechamento da união aprovado: TypeScript sem emissão exit 0, build completo Node 24.22.1 com 4470 módulos em 10,24 s e 26 páginas sociais; versão 4.8.253 válida. O gate de linhas passou com 3780 manuais auditados e 161 exceções/artefatos reconhecidos; manuais do lote abaixo de 500 linhas. RAG gerado uma vez, 15 fontes/80 trechos, e test:agent-operations aprovado com busca imutável 32,9 ms; nenhum gate ampliado. Smoke real no Chrome do cenário AFTER, com página real e transporte sintético: prestação 1464,2 ms, DOM 1468,6 ms, 10/10 consultas e rede externa 0. BEFORE teve 17/18 consultas por refoco/DevTools e não é comparação pareada; não foi usado para anunciar ganho. Troca de competência Novembro→Outubro também foi conferida no Chrome com respostas sintéticas coerentes com o mês solicitado. Validação local concluída para este patch pelo responsável; loading/erro/zero, respostas tardias e frescor têm provas contratuais/DOM, sem declarar cobertura visual de cada estado ou operações financeiras em produção. Não foi feita medição de TTI/bytes em sessão autenticada representativa; médias acumuladas e fixtures não substituem essa prova.

Celular: não houve nova mudança CSS nesta etapa de performance. O aceite anterior de Parceiros foi PF real a 390 px e marcador compartilhado de etapas, com Aluno pósfix no desktop de 1146 px; não se transfere esse aceite ao Caixa. Esta entrega não altera CSS móvel nem afirma um novo smoke celular sem evidência do responsável.

O usuário autorizou entregar o que estiver pronto e continuar em sequência, sem nova pergunta de autorização a cada etapa. Publicar a entrega pronta depende dos checks e aceite técnico do responsável. Configurações, Comunicação e Biblioteca continuam aguardando; nenhum desses módulos foi analisado por esta frente. Nenhum acesso remoto ou operação financeira foi executado por esta frente documental.
