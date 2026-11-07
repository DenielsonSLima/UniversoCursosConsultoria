# Campos monetários com centavos automáticos — 07/11/2026

## Objetivo e escopo

Lote local de produto solicitado pelo usuário, com três agentes e revisão independente. Espelhar o comportamento de Contas a Receber nos campos monetários ativos do sistema, começando pelo lançamento de despesas. Publicação preparada em snapshot isolado para preservar o lote fiscal paralelo no workspace. Produção autorizada explicitamente no seguimento do pedido. Candidato final 4.8.261/revisão 270 sobre main 260 `55b8bdc8e12b2192e8c1592d76c0dfb2147fe44d`, preservando Biblioteca 260.

## Comparativo e causa comprovada

| Situação | Despesas antes | Padrão Receber aplicado |
| --- | --- | --- |
| Primeiro dígito `3` | `3,00` | `0,03` |
| Sequência `123456` | Tratava dígitos como reais inteiros | `1.234,56` |
| Vírgula após valor formatado | Limpava o campo | Preserva valor |
| Backspace e seleção total | Lógica própria de inteiro | Remove dígitos pelos centavos e permite limpar |

O problema foi reproduzido no formulário autenticado de produção pelo Safari antes do patch, sem salvar lançamento: `3` virou `3,00` e a vírgula limpou o campo.

## Implementação e aceite

- Util compartilhado extraído do contrato existente de Contas a Receber; Despesas e Receber importam a mesma implementação.
- Despesas: criação, ajustes, edição e baixa. Financeiro: empréstimos, convênios, transferências, renegociação, outros créditos, PDV, carnês e cronogramas. Patrimônio reutiliza o util compartilhado.
- Cadastros e gestão: valores de cursos, turmas, matrículas, condições individuais, dependências acadêmicas e transferência externa; recebimento da Secretaria e saldo inicial.
- Componente compartilhado adapta digitação textual a formulários com estado numérico, preservando o contrato de valores em reais. Máscara com prefixo R$ preserva exclusão e limpeza.
- Saldo inicial continua aceitando débito/valor negativo; preços opcionais continuam permitindo Sob Consulta. Percentuais, quantidades, dimensões de documento e regras financeiras permanecem nos contratos existentes.
- Cronograma da renegociação aceita o separador de milhar introduzido pela máscara e converte exatamente para centavos.
- Legado TurmaPresencialForm.tsx não foi alterado: não foram encontrados consumidores ativos. Caixa não possui campo monetário editável próprio nesta revisão.
- Não houve alteração em banco, RPC, cálculo financeiro, autorização, elegibilidade ou emissão de cobranças.

## Validação

- 78 testes focados distintos aprovados: 18 util/Receber; 14 contratos de turmas; 5 saldo inicial; 34 runtime Financeiro/Patrimônio; 7 contratos de despesas/outros créditos.
- Os testes runtime TSX foram empacotados com esbuild em diretório temporário antes de node --test. Saldo inicial executado pelo runner oficial `npm run test:saldo-inicial`; execução direta via Node sem empacotamento não resolve imports sem extensão.
- TypeScript do grafo consolidado de todos os arquivos de implementação deste manifesto aprovado com configuração temporária derivada do tsconfig do projeto. Integração esbuild das duas frentes aprovada.
- Revisão independente do agente do core sobre ambas as frentes concluída. Ajustado prefixo R$ na exclusão antes do aceite.
- Safari local, componente real DespesaFormCoreFields com dados sintéticos: digitação contínua `123456` resultou em `1.234,56` e valor numérico `1234.56`; vírgula e ponto extras preservaram o campo; Backspace resultou em `123,45`; colagem `R$ 3.333,00` resultou em `3333`; limpeza/redigitação `5` resultou em `0,05`; juros `22` resultou em `0,22`.
- Safari local, CurrencyInput compartilhado com prefixo R$: sequência, separadores, Backspace e limpeza/redigitação confirmados; `22` permaneceu `R$ 0,22` após blur, com número canônico `0.22`.
- Safari em iframe de 390 px: componente real manteve campos dentro da largura; sequência `123456` seguida de vírgula preservou `1.234,56` e número canônico `1234.56`.
- Nenhum lançamento, baixa ou transação financeira foi enviado durante os smokes.
- Todos os arquivos deste manifesto têm até 500 linhas físicas.

## Limitações e pendências externas

- `npm run check:file-lines` global encontra referências ausentes em manifestos antigos, fora deste lote. Conferência direta do manifesto atual aprovada; não houve alteração de governança para contornar o erro.
- Pré-scan padrão do Vite encontrou imports malformados preexistentes em DespesasFixasTab.tsx e DespesasVariaveisTab.tsx, fora do manifesto. Smoke local usou entrada isolada do componente. O grafo TypeScript dos arquivos deste lote passou; build global não foi apresentado como aprovado.
- Um teste contratual Deno de empréstimos ainda busca RPC no antigo financeiro.service.ts, agora barrel; seis outros contratos passaram. Falha não pertence à máscara.
- Produção foi autorizada pelo usuário. O smoke autenticado do formulário completo com o patch publicado é parte do fechamento. O smoke sintético verifica interação e conversão, sem comprovar backend ou autorização.
- Harnesses, caches e bundles de teste são temporários e ficam fora do manifesto. Este registro histórico não altera fontes padrão do corpus RAG; memória, lote fiscal e índice não foram regravados.

## Integração para produção

- Base259 reconstruída de fontes locais e arquivos lidos via MCP; todos os 6818 blobs conferidos contra a árvore GitHub atual.
- DespesaBaixaModal legado local excluído do manifesto publicado: a produção conserva seu wrapper FinancialPaymentModal e o contrato de pagamentos compartilhado.
- FinancialPaymentEditor ativo passa a usar o util comum e tem regressões DOM de sequência, vírgula e Backspace no smoke existente. Demais diffs comparados com main259 e aprovados em revisão independente.
- Versão, histórico, registro de manifestos e lote da entrega atualizados somente no candidato isolado. Nenhuma migration ou alteração de backend neste lote.
- Candidato integrado: 78 testes focados aprovados, regressão DOM do formulário compartilhado aprovada com cliente sintético, TypeScript e lint globais aprovados, teto global de linhas aprovado e build completo aprovado (9,36 s) com Node 24.22.1. O Node24.19 instalado no shell foi recusado pela guarda de segurança; o build foi repetido com o runtime homologado já disponível, sem alterar a guarda.
- Índice RAG local regenerado uma vez (15 fontes/80 trechos) e contrato operacional aprovado. Caches gerados não entram no manifesto.
- Revisão independente adicional do editor compartilhado e do smoke aprovada. Prévia e merge serão condicionados aos checks do commit; resultado de produção será registrado no fechamento.

## Mudança de base após CI

- Candidato 260 inicial passou nos 12 workflows e Preview READY, commit 0b52f7b13d46347b139eeb3787cd395e0b725848/PR356.
- Biblioteca 260 entrou em main durante a espera dos checks. Seu delta de 30 arquivos foi lido via MCP e verificado por blob; fontes monetárias não se sobrepõem. O candidato passa a 261/revisão 270 e preserva Biblioteca e histórico completo.
- Nova base 260 aprovada em TypeScript, lint, versão e teto globais; build completo em 15,06 s. Os 26 blobs não operacionais da entrega Biblioteca foram preservados byte a byte; histórico e registro de manifestos reconciliados. Os 78 testes e o smoke DOM permanecem aprovados nas fontes monetárias idênticas. Revalidar checks do novo commit antes do merge. Nenhuma reversão da entrega paralela.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-07-campos-monetarios-centavos.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/cadastros/components/CursoFinanceiroTab.tsx`
- `modules/gestor/cadastros/components/CursoPublicoTab.tsx`
- `modules/gestor/cadastros/cursos-ead/components/steps/EadCourseWizardStep2.tsx`
- `modules/gestor/configuracoes/saldo-inicial/components/AccountBalanceManager.tsx`
- `modules/gestor/configuracoes/saldo-inicial/saldo-inicial.currency.test.ts`
- `modules/gestor/configuracoes/saldo-inicial/saldo-inicial.currency.ts`
- `modules/gestor/financeiro/components/financial-currency-inputs.behavior.test.tsx`
- `modules/gestor/financeiro/convenios/components/ConvenioCreditModal.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaEditModal.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-form.utils.ts`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoBaixaModal.tsx`
- `modules/gestor/financeiro/emprestimos/components/EmprestimoForm.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPdvModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanFinancialForm.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanSchedule.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanTermsFields.tsx`
- `modules/gestor/financeiro/outros-creditos/outros-creditos.presentation.ts`
- `modules/gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.ts`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoScheduleEditor.tsx`
- `modules/gestor/financeiro/renegociacoes/components/WizardSteps.tsx`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoScheduleDraft.ts`
- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`
- `modules/gestor/financeiro/settlements/financial-payment.smoke.test.mjs`
- `modules/gestor/financeiro/transferencias/components/TransferenciaFormModal.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/CurrencyInput.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/turma-plano-unico-form.contract.test.mjs`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoFinanceiroStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/turma-tecnico-form.contract.test.mjs`
- `modules/gestor/gestao/presencial-financeiro-unico/components/CondicaoPlanoFinanceiroUnicoModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferDecimalInput.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/ConfirmarMatriculaModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoOverrideDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfigEditor.tsx`
- `modules/gestor/patrimonio/patrimonio.formatters.test.ts`
- `modules/gestor/patrimonio/patrimonio.formatters.ts`
- `modules/gestor/secretaria/consulta-financeira/components/SettlementModal.tsx`
- `modules/gestor/secretaria/dependencias-academicas/components/DependenciasFinancialRules.tsx`
- `modules/shared/components/CurrencyInput.tsx`
- `modules/shared/utils/currency-input.test.ts`
- `modules/shared/utils/currency-input.ts`

Total: 46 arquivos.
