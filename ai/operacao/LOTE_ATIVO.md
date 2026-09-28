# Lote ativo
## Lote: 2026-09-27-caixa-workspace-v2-integracao
Estado: PUBLICADO NA VERSÃO 4.8.124 — AGUARDANDO SMOKE VISUAL FINAL
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-27-caixa-workspace-v2-integracao.md`
- O core privado publicado na versão 4.8.122 permanece imutável.
- A Etapa 3 aplicou o core por empresa, o wrapper seguro, o drill-down e a correção de unidade de contagem no Supabase.
- A Etapa 3B adiciona transporte TanStack Query, validação pedido/resposta e invalidação Realtime por empresa/escopo.
- O Caixa volta a abrir diretamente a análise mensal com consolidado e polos para a Matriz global.
- A primeira dobra e o drill-down paginado passam a compor o `Resumo` do Financeiro no polo selecionado, acima dos indicadores já existentes.
- O Radar financeiro foi removido do Início para evitar duplicidade com o Financeiro.
- A apresentação do cockpit usa superfícies claras; funcionalidades sem contrato canônico deixam de ocupar a interface.
- Gráficos sem série canônica continuam explicitamente indisponíveis; o frontend não calcula dinheiro, percentual, escala, classificação ou paginação.
- `allPolos` conserva a autorização atual de administrador global do sistema. Um futuro isolamento por empresa exigirá vínculo gestor ↔ empresa explícito.
- O cutover integral depende das séries canônicas restantes; este lote ativa o cockpit de contas a pagar e preserva o modo mensal.
