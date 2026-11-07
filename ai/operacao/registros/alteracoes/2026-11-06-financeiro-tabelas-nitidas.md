# Financeiro — tabelas e listagens nítidas

## Objetivo e aceite

Manter o visual compacto aprovado e uniformizar tabelas, agrupamentos e detalhes das dez abas financeiras. Referências: quatro capturas enviadas pelo usuário. Fonte nativa, pesos moderados, metadados de 12 px com contraste maior, cabeçalhos consistentes, valores tabulares alinhados e ícones centralizados. Sem alterar conteúdo, cálculos, consultas, permissões, seleção ou ações.

## Manifesto explícito

- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesList.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/transferencias/components/TransferenciasList.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoReceivablesPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoTransactionsPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/CnabReturnResults.tsx`
- `modules/gestor/financeiro/financial-data.css`
- `modules/gestor/financeiro/conciliacao-bancaria/BaneseCnabRemittancePanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/BaneseCnabReturnPanel.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateStudentCard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateEnrollment.tsx`
- `modules/gestor/financeiro/renegociacoes/components/WizardSteps.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalCards.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalDetail.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CanonicalSummary.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimosTable.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoDetailsPage.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthsTable.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthDetailsPage.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoCard.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthCard.tsx`
- `ai/operacao/registros/alteracoes/2026-11-06-financeiro-tabelas-nitidas.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/rag/index.json`

Total: 35 arquivos.

## Escopo e fronteiras

- Resumo: somente artigos do diálogo de compromissos, condicionado ao Financeiro ativo; nenhuma regra global de Caixa.
- A Receber e modalidades: tabela, grupos, linhas, cartões e paginação existentes.
- A Pagar e Outros Débitos: tabela, cartões e grupos compartilhados, mantendo seleção e rateio informativo.
- Renegociações: candidatos, matrículas, propostas e resumos, incluindo portais.
- Empréstimos e Convênios: tabelas, cartões e detalhes de parcelas, rateios e extrato.
- Transferências: lista e paginação existentes.
- Outros Créditos: tabela, grupos, seleção e linhas.
- Conciliação: recebimentos, transações, cobranças, ocorrências e listas de remessa/retorno; formulários e preparação bancária preservados.

A folha de estilo só atua em tela, sob presença do módulo Financeiro e marcadores explícitos. Sem mudanças em geradores, modelos, prévias PDF ou impressão. Uma frente independente fez inventário, marcadores e revisão; coordenador cuidou da camada visual e demais marcadores.

## Validação

Concluída a validação técnica: AST dos 28 arquivos TSX equivalente à base após remover somente classes e import CSS; TypeScript, lint focado, build Node 24.22.1, teto de linhas e contrato operacional aprovados. Foram verificadas 128 montagens SSR dos componentes reais, sem I/O nem execução de callbacks.

Contratos: 63 de 65 aprovados. Duas asserções legadas falham de forma idêntica na base 4.8.250: lifecycle de Empréstimos procura uma RPC no antigo arquivo agregador; apresentação de Receber espera abrir um título Banese sem capability canônica. Testes, cálculos e permissões não foram modificados para contornar essas falhas.

Capturas analisadas e tela atual confirmada antes do patch. Usuário solicitou seguir pelas fotos e código após questionar o uso do navegador; nenhuma inspeção visual do resultado em navegador será realizada neste lote. A validação visual final permanece limitada às referências fornecidas.

## Entrega

Versão 4.8.251 preparada para revisão na branch `release/financeiro-tabelas-4.8.251`, sobre a base remota 4.8.250. Alterações locais paralelas preservadas; somente marcadores de classe e importação do estilo foram aplicados no workspace. Commit remoto usa o candidato completo da base atual, com este manifesto. Produção não solicitada.

A revisão final confirmou escopo em tela e no Financeiro ativo, inclusive portais. Índice operacional atualizado uma vez (15 fontes/80 trechos). PR e Preview terão seus checks acompanhados no GitHub; conferência visual final não foi executada por orientação do usuário.
