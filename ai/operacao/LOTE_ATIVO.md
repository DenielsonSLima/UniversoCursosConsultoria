# Lote ativo
## Lote: 2026-09-27-caixa-workspace-v2-integracao
Estado: RPCs APLICADAS E VALIDADAS — CUTOVER CONTROLADO PRONTO PARA PUBLICAÇÃO
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-27-caixa-workspace-v2-integracao.md`
- O core privado publicado na versão 4.8.122 permanece imutável.
- A Etapa 3 aplicou o core por empresa, o wrapper seguro, o drill-down e a correção de unidade de contagem no Supabase.
- A Etapa 3B adiciona transporte TanStack Query, validação pedido/resposta e invalidação Realtime por empresa/escopo.
- A primeira dobra e o drill-down paginado entram no módulo Caixa pelo modo `Cockpit de tesouraria`.
- `Cockpit de tesouraria` e `Análise mensal` são modos mutuamente exclusivos; somente o modo visível consulta dados e assina Realtime.
- Gráficos sem série canônica continuam explicitamente indisponíveis; o frontend não calcula dinheiro, percentual, escala, classificação ou paginação.
- `allPolos` conserva a autorização atual de administrador global do sistema. Um futuro isolamento por empresa exigirá vínculo gestor ↔ empresa explícito.
- O cutover integral depende das séries canônicas restantes; este lote ativa o cockpit de contas a pagar e preserva o modo mensal.
