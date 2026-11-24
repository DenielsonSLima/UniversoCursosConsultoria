# Agrupamento mensal de despesas variáveis

Data: 2026-11-23
Versão: 4.8.371

## Entrega

- As abas Todos e Em aberto de Despesas variáveis abrem por mês de vencimento. Mês atual abre em lista.
- Os títulos mostram o nome do mês e o ano. Cada aba mantém a escolha manual de agrupamento durante o uso da tela.
- As somas, quantidades e a ordem retornadas pelo servidor continuam sendo usadas nos grupos.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-23-despesas-variaveis-agrupamento-mensal.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-12-versoes-4-8-299-a-300.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/despesas/components/despesa-grouping.model.test.ts`
- `modules/gestor/financeiro/despesas/components/despesa-grouping.model.ts`
- `modules/gestor/financeiro/despesas/components/despesas-workspace.interaction.test.mjs`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`

Total: 10 arquivos.

## Validação

- 18 testes focados passaram. Foram exercitados o agrupamento, a abertura de mês, a volta à lista de Mês atual e o rótulo por extenso quando o servidor fornece mês e ano numéricos.
- A conferência de publicação usa os conectores de GitHub e Vercel. A interface foi exercitada localmente com dados sintéticos.
