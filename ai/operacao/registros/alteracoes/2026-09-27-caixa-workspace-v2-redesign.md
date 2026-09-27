# Caixa Workspace v2 — redesign da mesa de tesouraria

Estado: ETAPA 2 APLICADA — PUBLICAÇÃO AUTORIZADA

## Objetivo

Reorganizar o Caixa como uma mesa de tesouraria orientada a decisão, com uma fonte canônica por polo, competência e corte. A primeira dobra deve responder quanto há registrado, quanto vence, se existe sobra ou déficit comprovado e quais limitações afetam a leitura.

## Escopo autorizado neste checkpoint

- Etapa 0: baseline remoto somente leitura das RPCs atuais.
- Etapa 1: contrato semântico financeiro e wireframes desktop, tablet e mobile.
- Etapa 2: núcleo privado, testes PostgreSQL isolados e contrato TypeScript.
- Documentação operacional do novo lote.
- Aplicação da migration privada no projeto Supabase confirmado e publicação atômica do manifesto no GitHub, autorizadas pelo usuário em 2026-09-27.

Ficam fora deste checkpoint o wrapper público, a substituição da interface e qualquer cutover do Caixa. A migration não concede `EXECUTE` a papéis clientes.

## Guardas

- Todo cálculo financeiro, percentual, variação, aging, projeção, classificação, total filtrado e paginação pertence ao backend/RPC.
- O frontend valida o contrato, preserva strings monetárias canônicas, formata e apresenta.
- Obrigações abertas não reduzem o Caixa realizado. Somente pagamentos efetivos alteram a posição registrada.
- Histórico sem temporalidade completa de cancelamentos e exclusões permanece identificado como posição reexpressa.
- Ausência, restrição ou evidência insuficiente não pode ser convertida em zero.
- Operações remotas usam exclusivamente MCP Supabase e MCP GitHub; smoke autenticado usa somente Safari.

## Frentes independentes

- Financeiro: semântica, fórmulas exclusivas da RPC, invariantes e critérios de aceite.
- Arquitetura: inventário remoto, cortes, assinaturas, segurança e baseline de desempenho.
- UX: hierarquia Hoje → Competência → Estrutura, gráficos, estados e responsividade.
- Coordenação: integração, registro, revisão cruzada e aceite do checkpoint.

## Etapas posteriores previstas

1. Núcleo interno do Workspace v2.
2. Wrapper seguro e autorização por escopo.
3. Paridade financeira e desempenho.
4. Contratos, cache e Realtime no frontend.
5. Cockpit e agenda financeira.
6. Gráficos e organização das seções.
7. Drill-down paginado.
8. Smoke, revisão, Preview e publicação mediante autorização específica.

## Critérios de saída das etapas 0 e 1

- RPCs publicadas, assinaturas, grants, cortes e sobreposições documentados a partir do ambiente remoto.
- Glossário separa realizado, comprometido, projetado confirmado, patrimonial a custo e reexpressado.
- Cada indicador do wireframe possui fonte canônica, período, escopo, corte e estado de completude.
- Desktop, tablet e mobile possuem hierarquia definida sem depender de cálculos no React.
- Nenhuma migration ou alteração remota foi aplicada.

## Resultado do checkpoint

- Baseline remoto confirmou dez RPCs atuais, todas `STABLE`, `SECURITY DEFINER`, sem execução anônima e com contratos/cortes não uniformes.
- A prestação mensal apresentou média acumulada de 1.851,36 ms em `pg_stat_statements`; linha de corte, posição total e relatório detalhado também justificam evitar encadeamento das RPCs públicas.
- O banco opera em UTC, enquanto o corte institucional é `America/Maceio`; o Workspace v2 terá data e corte comuns explícitos.
- A amostragem estrutural pelo papel SQL do MCP recebeu `42501`; a restrição foi preservada e a auditoria permaneceu somente leitura.
- O glossário obrigatório separa `REALIZADO`, `COMPROMETIDO`, `PROJETADO_CONFIRMADO`, `PATRIMONIAL_A_CUSTO` e `REEXPRESSADO`.
- Wireframes e estados foram definidos para desktop, tablet e mobile, com a hierarquia Hoje → Competência → Estrutura.
- O protótipo visual poderá usar fixtures tipadas, mas o cutover publicável depende do Workspace v2, snapshot único e paridade financeira.

## Decisão para a Etapa 2

Criar localmente um core privado do Workspace v2 com bases compartilhadas e dinheiro textual, sem substituir as RPCs atuais. O wrapper público seguro, aplicação remota e cutover pertencem a checkpoints posteriores.

## Resultado da Etapa 2

- Core privado aplicado no Supabase, sem `EXECUTE` para `anon`, `authenticated` ou `service_role`.
- Contrato físico v2 congelado em `versao`, `meta`, `regras` e `secoes`, com envelope uniforme `{disponivel, completo, motivo, observacao, dados}`.
- Agenda operacional ancorada em `meta.data_institucional`; competência e posição histórica preservam o corte próprio.
- Contas abertas não alteram realizado ou posições; rateio misto preserva frações pagas e abertas sem duplicação.
- Testes contratuais e PostgreSQL isolados passaram 6/6 com PGlite.
- Tipos e validador frontend, sem serviço, query ou montagem visual, passaram 7/7 testes em Node, 7/7 em Deno, TypeScript focado, bundle browser e ESLint focado.
- A revisão cruzada acrescentou metadados de snapshot/histórico, fontes estruturadas, coerência de completude e testes reais de D0, D+7, D+8, escopo e entradas inválidas.
- Pagamentos parciais comprometem apenas o saldo aberto; registros marcados pagos sem valor confirmado realizam `0.00`, declaram `PAGAMENTOS_SEM_VALOR` e deixam as seções afetadas incompletas.
- Os 16 arquivos manuais do manifesto permanecem abaixo de 500 linhas; o índice RAG gerado possui 1.397 linhas e é artefato regenerável isento. `git diff --check` focado não apontou erro.
- O primeiro CI expôs perda de cobertura incremental no índice de manifestos usado para montar o commit.
- O índice foi recomposto a partir dos 117 registros da `main` e recebeu somente o manifesto atual como 118º item; nenhuma migration ou implementação histórica foi alterada.
- Changelog Supabase revisado: a mudança recente de PostgreSQL 15.19/17.11 não afeta este núcleo; extensões citadas no alerta não fazem parte do desenho.
- Documentação oficial confirma `search_path` vazio para funções `SECURITY DEFINER` e revogação explícita de execução; o core privado continuará sem exposição cliente.
- As migrations foram registradas remotamente como `20260927212124_create_caixa_workspace_v2_core` e `20260927212419_fix_caixa_workspace_v2_rateio_payment_quality`.
- Smoke remoto confirmou raiz física v2, agenda com oito dias, qualidade completa na base atual e contador de pagamentos sem valor igual a zero.
- A função permaneceu `STABLE`, `SECURITY INVOKER`, com `search_path` vazio e execução exclusiva do papel `postgres`; os advisors não produziram achado para o novo core.
- `EXPLAIN (ANALYZE, BUFFERS)` mediu 11,095 ms na base atual, sem leitura física ou escrita temporária.
- A publicação atômica da versão 4.8.122 foi explicitamente autorizada e depende somente dos gates da árvore limpa do PR.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-27-caixa-workspace-v2-redesign.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/planejamentos/2026-09-27-caixa-workspace-v2-baseline.md`
- `ai/operacao/planejamentos/2026-09-27-caixa-workspace-v2-ux.md`
- `docs/decisions/caixa-workspace-v2-semantica.md`
- `supabase/migrations/20260927203000_create_caixa_workspace_v2_core.sql`
- `supabase/migrations/20260927214500_fix_caixa_workspace_v2_rateio_payment_quality.sql`
- `supabase/tests/caixa_workspace_v2_core.contract.test.mjs`
- `supabase/tests/caixa_workspace_v2_core.isolated.test.mjs`
- `modules/gestor/caixa/workspace/caixa-workspace.types.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.validation.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.contracts.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.contracts.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 17 arquivos.

O manifesto está congelado para a aplicação e a publicação desta etapa.
