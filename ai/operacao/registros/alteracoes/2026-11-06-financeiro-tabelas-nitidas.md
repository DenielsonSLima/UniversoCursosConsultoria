# Financeiro — tabelas, modais, abas e seletores

## Objetivo e aceite

Padronização visual compacta das dez abas financeiras e seus submódulos, conforme capturas e ajustes solicitados durante a revisão local. Tabelas legíveis, modais claros, buscas brancas, comboboxes próprios pesquisáveis e abas com linha inferior. Remover títulos e descrições que repetem a navegação; aproveitar as linhas de abas/filtros para ações. Preservar dados, avisos, permissões, cálculos, seleção, emissão, baixa, estorno e exportação.

## Manifesto explícito

- `.github/workflows/document-identity-history.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-06-financeiro-tabelas-nitidas.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/caixa/workspace/components/CaixaWorkspacePayablesModal.tsx`
- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/financeiro/components/FinancialSelect.tsx`
- `modules/gestor/financeiro/components/FinancialUnderlineTabs.tsx`
- `modules/gestor/financeiro/components/financial-select.css`
- `modules/gestor/financeiro/components/financial-select.test.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/BaneseCnabRemittancePanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/ConciliacaoBancariaTab.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/BaneseCnabReturnPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/CnabReturnResults.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoOrigemBaixaPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoPagination.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoFilters.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoReceivablesPanel.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoTransactionsPanel.tsx`
- `modules/gestor/financeiro/convenios/ConveniosTab.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioCloseMonthModal.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioCreditModal.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioDeleteModal.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioFormModal.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioModalShell.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthCard.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthDetailsPage.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioMonthsTable.tsx`
- `modules/gestor/financeiro/despesas/DespesasTab.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCancelModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCredorPicker.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaDeleteModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaEditModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormAssociations.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormCoreFields.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormSettlementFields.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaModalPortal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaReciboModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `modules/gestor/financeiro/emprestimos/EmprestimosTab.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoBaixaModal.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoCard.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoDetailsPage.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoForm.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoLifecycleModal.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimosExportModal.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimosTable.tsx`
- `modules/gestor/financeiro/financial-data.css`
- `modules/gestor/financeiro/financial-dialogs.css`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCancellationModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPaymentModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPdvModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanFinancialForm.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanForm.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanWizard.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditReversalModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-create-modal.test.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-pdv.test.tsx`
- `modules/gestor/financeiro/outros-debitos/OutrosDebitosTab.tsx`
- `modules/gestor/financeiro/receber/ReceberTab.tsx`
- `modules/gestor/financeiro/receber/components/ReceberActions.tsx`
- `modules/gestor/financeiro/receber/components/manual-settlement/ManualSettlementModal.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/InstitutionalReceiptModal.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberOverlays.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberToolbar.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesList.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber-toolbar.test.tsx`
- `modules/gestor/financeiro/renegociacoes/RenegociacoesTab.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateEnrollment.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateStudentCard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CanonicalSummary.tsx`
- `modules/gestor/financeiro/renegociacoes/components/DiscardProposalDialog.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalCards.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalDetail.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoFilters.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoPanels.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/WizardSteps.tsx`
- `modules/gestor/financeiro/resumo/ResumoTab.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentHistory.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentModal.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentReversal.tsx`
- `modules/gestor/financeiro/transferencias/TransferenciasTab.tsx`
- `modules/gestor/financeiro/transferencias/components/TransferenciaFormModal.tsx`
- `modules/gestor/financeiro/transferencias/components/TransferenciaPicker.tsx`
- `modules/gestor/financeiro/transferencias/components/TransferenciasList.tsx`
- `modules/gestor/relatorios/pdf/ReportPdfPreviewModal.tsx`
- `modules/gestor/secretaria/shared/CanonicalDocumentPreviewModal.tsx`

Total: 103 arquivos.

## Escopo e fronteiras

- Tabelas, grupos, cartões e detalhes das dez abas com fonte nativa, contraste, densidade e valores alinhados.
- Todos os modais ativos inventariados: despesas; recebimento e estorno; créditos, PDV, carnê e pagamento; empréstimos; convênios; transferências; renegociações; compromissos do Resumo e chrome documental.
- Estilos de modais limitados à tela com Financeiro ativo. Conteúdo dos documentos, compositores PDF, marca-d’água, QR/códigos Banese e impressão preservados.
- Seletores nativos do Financeiro substituídos por FinancialSelect: busca por rótulo/identificadores, ID canônico, portal próprio, teclado e estados. Texto digitado não cria vínculo. Bloqueio de fieldset e validação obrigatória conservados.
- Abas principais, modalidades, períodos de listagem e status usam FinancialUnderlineTabs compacto. Presets de data, etapas e botões de visualização mantêm sua função própria.
- Ações aproveitam abas internas em A Receber/A Pagar/Outros Créditos/Outros Débitos/Conciliação e filtros em Empréstimos/Convênios/Transferências. Resumo já possuía ações contextuais adequadas.
- Três frentes independentes, integradas e revisadas; nenhum serviço, RPC, query key, autorização, payload financeiro ou cálculo alterado.

## Validação

TypeScript completo, lint do manifesto e build de integração aprovados. Inventário confirma ausência de select/datalist nativo em fontes de produto do Financeiro e tablists concentrados no componente compartilhado; todos os manuais do lote abaixo de 500 linhas. Comparação AST verificou controllers e atributos de ações, além dos marcadores visuais dos modais.

Testes focados: 30 verificações de créditos/PDV/toolbar/modal manual; 9 do combobox real (incluindo ID canônico, teclado, foco, estados, fieldset desabilitado e seleção obrigatória ao reabrir). Contratos e smoke DOM das abas de Conciliação e Renegociações aprovados. Os contratos anteriores de tabelas tiveram 63/65 aprovados; as duas falhas de lifecycle legado e capability Banese foram reproduzidas na base 4.8.250, sem enfraquecer regras para contorná-las.

Prévia local usa os componentes reais com dados sintéticos e escritas bloqueadas. Conferência visual começou no Safari e passou ao Chrome por solicitação explícita do usuário para liberar seu navegador. Formulários, confirmações, documentos, agrupamentos e ações foram revisados; não houve emissão, pagamento, estorno, exclusão ou geração de documento real. Responsividade e estados não cobertos pela conferência visual permanecem sujeitos ao aceite na Preview.

## Entrega

Versão 4.8.251 na PR #347, branch release/financeiro-tabelas-4.8.251, sobre 4.8.250. Atualização do mesmo lote após revisão do usuário; manifesto consolidado e alterações locais paralelas preservadas. Artefatos de teste, dados sintéticos e saídas de build não integram o commit. Produção não solicitada neste lote.

Ajuste de suporte à validação: document-identity-history usava ubuntu-latest, que passou a Ubuntu 26.04; Playwright 1.58.2 abortou a instalação antes dos testes. O único job afetado fica fixado em ubuntu-24.04, preservando comandos, dependências, permissões e asserções.


Fechamento de CI (2026-11-07): a execução da PR em `25e375` falhou nos dois testes DOM de Convênios porque o ambiente sintético não implementa `scrollIntoView`. A chamada do componente compartilhado agora verifica também a existência do método (`scrollIntoView?.(...)`), preservando o comportamento em navegadores. Convênios passou 2/2 sem alterar asserções de confirmação, pending/Escape, retry/idempotência ou isolamento por polo. Os 20 testes DOM de Renegociações do mesmo trecho da pipeline e as 9 verificações do combobox passaram com jsdom 26.1.0 já disponível em dependência temporária; lint do componente aprovado. Nenhuma instalação global, operação financeira ou alteração de regras foi feita.
