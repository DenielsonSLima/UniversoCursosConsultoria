# Agrupamento de despesas por período e ordem das abas

Data: 08/11/2026. Correção da interface entregue na 4.8.271, limitada a estado local
e ordem visual. Não altera RPCs, dados, valores, parcelas, autorização ou pagamentos.

## Aceite

- Mês atual inicia por categoria em despesas fixas e variáveis.
- Ao entrar em Em aberto ou Todos, o agrupamento padrão é por mês.
- A troca de período restaura seu padrão; o seletor continua permitindo escolha manual.
- Despesas variáveis aparece antes de Despesas fixas. Somente a ordem visual foi
  invertida, preservando a aba ativa inicial e os contratos existentes.
- Cartões em quatro colunas e controles junto às abas permanecem como na 4.8.271.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/DespesasTab.tsx`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `ai/operacao/registros/alteracoes/2026-11-08-despesas-agrupamento-por-periodo.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 7 arquivos.

## Causa e validação

As imagens fornecidas mostram Mês atual com um grupo mensal redundante.
As duas telas inicializavam o agrupamento em mês e mantinham a mesma escolha
ao alternar período. O patch inicializa categoria e restaura categoria/mês
no evento existente de navegação. A ordem foi invertida no catálogo das abas.

Candidato preparado sobre main remoto cf8f42164b929f3567df66938f801662b6df1b7d.
Overlay temporário preserva diferenças antigas e alterações paralelas do checkout.
Smoke no Chrome autorizado pelo usuário, com os três componentes reais e dados
sintéticos, confirmou a ordem e os seis padrões ao ir e voltar entre períodos.
Mês atual exibe grupo Internet / Telefone; Em aberto e Todos exibem os meses.
Não foi feita operação financeira nem alteração no Supabase.

TypeScript focado e ESLint aprovados. Smoke de desktop e de 390 px aprovado.
Manifesto de sete arquivos respeita o teto de 500 linhas. A checagem global
local continua reportando 39 caminhos históricos ausentes no checkout;
CI executará essa validação no checkout remoto completo.
CI e Preview validam o checkout remoto completo antes de eventual publicação.

