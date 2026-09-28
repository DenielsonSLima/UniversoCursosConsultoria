# Caixa imersivo v3

Estado: MIGRATION REMOTA APLICADA — PUBLICAÇÃO 4.8.125 EM ANDAMENTO

## Objetivo

Reorganizar o módulo Caixa como uma sala de controle financeira clara, profissional e responsiva, preservando integralmente os dados já exibidos. A mudança adiciona gráficos úteis e hierarquia editorial sem transferir cálculo financeiro, percentual, escala, classificação ou geometria para o navegador.

## Guardas

- O polo e a competência selecionados governam todas as leituras e visualizações.
- Resultado geral continua disponível somente ao perfil global da Matriz.
- Pagamentos efetivos compõem o realizado; títulos abertos permanecem posição.
- Patrimônio, financiamento, convênios e resultado operacional continuam semanticamente separados.
- O frontend valida e apresenta o contrato; a RPC entrega valores e geometria chart-ready.
- Zero, ausência, parcialidade, indisponibilidade e erro permanecem estados distintos.
- Migration e publicação foram autorizadas explicitamente em 27/09/2026.

## Frentes

1. RPC visual segura e testes de ACL/isolamento.
2. Componentes acessíveis de barras, linhas, roscas e distribuição de saldo.
3. Navegação editorial, visão executiva e agrupamento das seções existentes.
4. Integração, contratos TypeScript, testes focados e smoke local proporcional.

## Critérios de aceite

- Nenhuma informação atualmente presente no Caixa é removida.
- Os cinco escopos da Matriz global permanecem disponíveis.
- Todos os gráficos mudam junto com competência e polo, sem misturar caches.
- Nenhum gráfico fabrica fatias ou séries quando os valores canônicos são zero ou indisponíveis.
- Teclado, foco, nomes acessíveis, contraste e movimento reduzido são preservados.
- Arquivos manuais do lote possuem no máximo 500 linhas.

## Resultado local

- Visão executiva clara em tema claro, sem retornar ao painel excessivamente escuro.
- Navegação por Visão, Fluxo, Composição, Riscos, Estrutura e Governança.
- Gráfico combinado com barras de entradas/saídas e linhas de resultado/inadimplência.
- Gráficos de rosca para receitas e despesas, preservando valor, percentual e quantidade.
- Distribuição visual dos saldos positivos, seguida do detalhamento integral das contas.
- Contas a pagar, compromissos, linha de corte, posição total/líquida, patrimônio, financiamento, convênios e conciliação preservados.
- Resultado geral e abas por polo preservados, com escopo governando todas as consultas.

## Validação

- `npm run test:caixa-report`: 94/94 testes aprovados.
- Teste contratual da RPC visual: 4/4 aprovados.
- Teste PostgreSQL isolado/PGlite: 1/1 aprovado.
- TypeScript e ESLint focado: aprovados.
- Build de produção: aprovado.
- `git diff --check`: aprovado.
- Arquivos manuais deste manifesto: todos abaixo de 500 linhas.
- O gate global de linhas ainda reporta 12 referências ausentes preexistentes e fora deste manifesto; nenhuma falha pertence ao lote imersivo.
- Migration `create_caixa_prestacao_mensal_visual_secure` aplicada no projeto `kfekgwyqozhicpfuunpo`, registrada remotamente como versão `20260928012441`.
- Contrato remoto validado com `visual_version = 1`, janela de seis competências e séries/segmentos chart-ready no escopo GLOBAL.
- ACL remota validada: `anon` sem execução; `authenticated` e `service_role` com execução; função `STABLE`, `SECURITY DEFINER` e `search_path` vazio.
- Advisors revisados: o alerta da nova função é esperado pelo uso deliberado de `SECURITY DEFINER`; a autorização e o escopo continuam delegados à RPC base segura antes da composição visual. Nenhum alerta de performance referencia o novo contrato.
- Smoke autenticado de produção: pendente do deploy 4.8.125.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-27-caixa-imersivo-v3.md`
- `ai/operacao/rag/index.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/caixa-request-orchestration.test.tsx`
- `modules/gestor/caixa/caixa-visual.contracts.test.ts`
- `modules/gestor/caixa/caixa-visual.contracts.ts`
- `modules/gestor/caixa/caixa-linha-corte.test.ts`
- `modules/gestor/caixa/caixa-patrimonio-resumo.test.ts`
- `modules/gestor/caixa/caixa.mappers.ts`
- `modules/gestor/caixa/caixa.service.ts`
- `modules/gestor/caixa/caixa.types.ts`
- `modules/gestor/caixa/components/CaixaStatementSection.tsx`
- `modules/gestor/caixa/components/immersive/CaixaAccountPositionList.tsx`
- `modules/gestor/caixa/components/immersive/CaixaEditorialSection.tsx`
- `modules/gestor/caixa/components/immersive/CaixaExecutiveHero.tsx`
- `modules/gestor/caixa/components/immersive/CaixaImmersiveBalanceDistribution.tsx`
- `modules/gestor/caixa/components/immersive/CaixaImmersiveChart.types.ts`
- `modules/gestor/caixa/components/immersive/CaixaImmersiveCharts.test.tsx`
- `modules/gestor/caixa/components/immersive/CaixaImmersiveComboChart.tsx`
- `modules/gestor/caixa/components/immersive/CaixaImmersiveComponents.test.tsx`
- `modules/gestor/caixa/components/immersive/CaixaImmersiveDonutChart.tsx`
- `modules/gestor/caixa/components/immersive/CaixaImmersiveNavigation.tsx`
- `modules/gestor/caixa/components/immersive/caixa-immersive.palette.ts`
- `modules/gestor/caixa/components/immersive/index.ts`
- `scripts/test-caixa-report.mjs`
- `supabase/migrations/20260927234500_create_caixa_prestacao_mensal_visual_secure.sql`
- `supabase/tests/caixa_prestacao_mensal_visual.contract.test.mjs`
- `supabase/tests/caixa_prestacao_mensal_visual.isolated.test.mjs`

Total: 32 arquivos.

## Pendências remotas

1. Publicar somente o manifesto explícito na `main` como versão 4.8.125.
2. Aguardar o deploy de produção do Vercel.
3. Executar smoke autenticado no Safari nos cinco escopos e em mais de uma competência.
