# Despesas agrupadas por mês e fornecedor

Data: 08/11/2026. Mudança crítica pelo domínio financeiro, com novo leitor SQL;
sem alteração de pagamentos, cálculos de baixa ou documentos PDF.

## Aceite

Nas despesas fixas e variáveis, controles de tabela/cartões e agrupamento ficam
à direita das abas Mês atual / Em aberto / Todos. Padrão: mês de vencimento,
em ordem cronológica com o ano visível. Seletor próprio também oferece fornecedor,
categoria e sem agrupamento. Em aberto conserva o filtro canônico existente.
No móvel a linha quebra sem recortar opções ou causar rolagem horizontal da página.
Cartões usam quatro colunas a partir de 1280 px, três no notebook, duas no tablet
e uma no celular, tanto nos grupos como na lista simples.

Totais, recebido parcial e quantidade vêm do backend, sobre os mesmos registros
econômicos autorizados da listagem. Frontend apenas particiona os itens e apresenta
o resumo canônico. Fornecedor agrupa por ID e prioriza a fantasia autorizada.
Seleção, exclusão, edição, baixa, anexo e prévia conservam seus handlers.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaListWorkspace.tsx`
- `modules/gestor/financeiro/despesas/despesas-resumos.service.ts`
- `modules/gestor/financeiro/despesas/despesas.queryKeys.ts`
- `modules/gestor/financeiro/despesas/despesas.types.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesasQueries.ts`
- `modules/gestor/financeiro/despesas/components/DespesaViewControls.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-grouping.model.ts`
- `modules/gestor/financeiro/despesas/components/despesa-grouping.model.test.ts`
- `supabase/migrations/20261109003300_expense_month_supplier_groups.sql`
- `supabase/tests/expense_grouping.isolated.test.mjs`
- `.github/workflows/despesas-agrupamento.yml`
- `ai/operacao/registros/alteracoes/2026-11-08-despesas-agrupamento-mes-fornecedor.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 18 arquivos.

## Evidências e validação

Fotos fornecidas confirmam a linha isolada de controles e agrupamento somente por
categoria. Main remoto foi consultado antes do patch: componentes locais têm
diferenças antigas e sintaxe incompleta. Candidato preparado em overlay temporário
com as fontes remotas e dependências do pagamento parcial preservadas; alterações
paralelas locais e o lote NFS-e ativo não foram sobrescritos.

Quatro testes de agrupamento e seis verificações SQL isoladas aprovados, incluindo
anos diferentes, fornecedores homônimos, filtros, cancelados, pagamentos parciais,
operador revogado, ausência de identidade e outro polo. Tipo, scope e ordenação
usam o contrato de leitura existente. TypeScript e ESLint do caminho afetado aprovados.

Leitura real com papel authenticated validou o cenário: 14 meses em Todos, 13 em
Em aberto, previsto 1.680, pago 120 e aberto 1.560; um fornecedor. Somente leitura,
sem schema ou dados persistidos. Migration ainda não aplicada em produção.

Smoke local no Chrome com componentes reais e dados sintéticos aprovado: padrão
mensal, Em aberto, fornecedor pesquisável por teclado, cartões em quatro colunas
e seleção mantida na troca de agrupamento. Menu em 390 px permanece na tela.
TypeScript focado e ESLint aprovados. Teto do manifesto: até 500 linhas por arquivo.
A checagem global local reportou 39 caminhos antigos ausentes no checkout;
validação integral será repetida pelo CI no checkout remoto completo.

Pedido complementar: observações administrativas inseridas nas 13 parcelas foram
removidas pela RPC existente, com identidade autorizada, idempotência e auditoria.
Ensaio com rollback e execução atômica confirmaram somente a limpeza da observação;
13 pendentes de 120, total 1.560, e a parcela paga anterior permanecem inalteradas.
Nenhum identificador financeiro foi incluído neste registro.

CI e Preview em andamento. Publicação do novo leitor e do frontend exige
autorização específica de produção para este lote.
