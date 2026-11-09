# Agrupamento por período, ordem das abas e detalhes do rateio

Data: 08/11/2026. Correção da interface entregue na 4.8.271, com estado local,
ordem visual e leitura dos rateios existentes. Não altera RPCs, dados, valores,
parcelas, autorização ou pagamentos.

## Aceite

- Mês atual inicia por categoria em despesas fixas e variáveis.
- Ao entrar em Em aberto ou Todos, o agrupamento padrão é por mês.
- A troca de período restaura seu padrão; o seletor continua permitindo escolha manual.
- Despesas variáveis aparece antes de Despesas fixas. Somente a ordem visual foi
  invertida, preservando a aba ativa inicial e os contratos existentes.
- Cartões em quatro colunas e controles junto às abas permanecem como na 4.8.271.

- O indicador Custo rateado abre modal na tabela e no cartão, com polos, valor base,
  valor destinado, ajustes e situação, consultados apenas na abertura.
- Linhas derivadas usam o ID do lançamento físico; somente rateios autorizados
  pela RLS existente são exibidos. Valores são lidos do banco, sem recálculo.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/DespesasTab.tsx`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `ai/operacao/registros/alteracoes/2026-11-08-despesas-agrupamento-por-periodo.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaRateioBadge.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaRateioModal.tsx`
- `modules/gestor/financeiro/despesas/despesas-rateios.service.ts`

Total: 12 arquivos.

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
Manifesto de doze arquivos respeita o teto de 500 linhas. A checagem global
local reporta 39 caminhos históricos ausentes e o manifesto ainda não registrado\ndo lote NFS-e paralelo, totalizando 40 pendências locais;
CI executará essa validação no checkout remoto completo.
CI e Preview validam o checkout remoto completo antes de eventual publicação.


## Pedido adicional de rateio

Badge reutilizado na tabela e no cartão corrige polo/polos e abre dialog nativo
com foco contido, Escape, fechamento pelo fundo e devolução do foco ao botão.
Consulta usa despesa_lancamento_id e relacionamento FK de polos já existente,
com TanStack Query no prefixo de lançamentos para receber invalidação existente.
A reabertura consulta novamente. Há carregamento, falha com nova tentativa e vazio.

Leitura authenticated no banco confirmou o contrato existente, polo de destino,
valores canônicos e RLS por polo. Consulta sem identidade retornou zero registros.
Smoke local com componentes reais confirmou tabela, cartão, 390 px, erro, vazio,
Tab/Shift+Tab contidos e Escape com retorno de foco. Nome longo quebra sem cortar.
Não houve alteração remota no schema nem nos dados financeiros.
