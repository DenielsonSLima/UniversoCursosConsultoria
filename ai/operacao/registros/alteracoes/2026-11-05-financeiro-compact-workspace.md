# Financeiro compacto — etapa 1 de 3

## Pedido e direção

Após publicação da 4.8.248, o responsável pediu repaginação visual de Financeiro, Caixa e Configurações com três agentes, validando cada módulo antes de seguir ao próximo. Financeiro é a prioridade. Direção já aprovada: fontes leves e menores, hierarquia clara, ícones centralizados, menos volume decorativo, mesmas informações e operações.

## Etapas

1. Financeiro: resumo/tesouraria, navegação e apresentação operacional; conferir desktop, móvel, estados e contratos afetados antes de avançar.
2. Caixa: somente após validação da etapa 1, manter realizado/aberto/financiamento separados e totais canônicos.
3. Configurações: somente após validação da etapa 2, preservar autorizações e comportamento dos formulários.

Três agentes: resumo Financeiro, navegação Financeiro, revisão independente e mapa das etapas seguintes. Safari sob controle exclusivo do coordenador. Nenhum agente deve implementar Caixa/Configurações antes da liberação da etapa correspondente.

## Manifesto explícito da etapa 1

- `modules/gestor/financeiro/resumo/FinanceiroResumoTab.tsx`
- `modules/gestor/financeiro/resumo/ResumoTab.tsx`
- `modules/gestor/financeiro/resumo/financeiro-summary.css`
- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/financeiro/components/FinancialUnderlineTabs.tsx`
- `modules/gestor/financeiro/receber/ReceberTab.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberToolbar.tsx`
- `modules/gestor/financeiro/despesas/DespesasTab.tsx`
- `modules/gestor/financeiro/emprestimos/EmprestimosTab.tsx`
- `modules/gestor/financeiro/convenios/ConveniosTab.tsx`
- `modules/gestor/financeiro/transferencias/TransferenciasTab.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/ConciliacaoBancariaTab.tsx`
- `modules/gestor/financeiro/outros-debitos/OutrosDebitosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/renegociacoes/RenegociacoesTab.tsx`
- `modules/gestor/financeiro/financeiro-workspace.css`
- `ai/operacao/registros/alteracoes/2026-11-05-financeiro-compact-workspace.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 19 arquivos.

Nenhuma alteração de dados, serviço, cálculo, autorização, Banese, documento gerado ou backend está incluída. Sem publicação desta nova repaginação.

## Validação da etapa 1

- TypeScript completo do candidato integrado: passou. Lint focado dos TSX e 11 contratos de período/seções: passaram.
- Safari desktop e 390×744: resumo, parcial, zero, erro, carregamento e restrição de abas por permissão conferidos. Valores canônicos extensos permanecem íntegros; moeda pode quebrar em duas linhas.
- Detalhamento real com 23 registros: página 1/2 → 2/2, retorno pelo botão de fechar e layout móvel conferidos. Escape não confirmado pela automação nativa; componente e handler existentes preservados.
- Prévias usam componentes reais, cache/fixtures sintéticos e I/O remoto bloqueado. Não houve operação financeira real.
- Contrato legado resumo-ui exige select móvel, enquanto produção e contrato financeiro-sections já exigem scroll: falha reproduzida no baseline, não introduzida nesta etapa.
- Checkout local de OutrosDebitosTab era legado; usado arquivo publicado4.8.248 com reaplicação exclusiva das classes visuais. useExpensePayment, mutateAsync e onReversed de produção preservados.
- Etapa 1 validada tecnicamente para avançar ao Caixa. Aprovação estética final e publicação ainda não solicitadas para este lote.
