# Lote ativo
## Lote: 2026-09-27-caixa-workspace-v2-integracao
Estado: PUBLICADO NA VERSÃO 4.8.124 — AGUARDANDO SMOKE VISUAL FINAL
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-27-caixa-workspace-v2-integracao.md`
- O core, as RPCs e as regras financeiras já publicados permanecem imutáveis.
- O Caixa volta a abrir diretamente a análise mensal com consolidado e polos para a Matriz global.
- A primeira dobra e o drill-down paginado passam a compor o `Resumo` do Financeiro no polo selecionado, acima dos indicadores já existentes.
- O Radar financeiro foi removido do Início para evitar duplicidade com o Financeiro.
- A apresentação do cockpit usa superfícies claras; funcionalidades sem contrato canônico deixam de ocupar a interface.
- Gráficos sem série canônica continuam explicitamente indisponíveis; o frontend não calcula dinheiro, percentual, escala, classificação ou paginação.
- `allPolos` conserva a autorização global vigente; o corte por polo continua explícito.
