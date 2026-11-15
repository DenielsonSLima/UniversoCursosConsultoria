# Seletor de contas: rolagem e saldo

## Objetivo e aceite

Corrigir o retorno involuntário da lista ao rolar e exibir o saldo ao lado do nome da conta na primeira linha dos modais de pagamento e recebimento.

- Rolagem manual preservada em hover e atualização das opções.
- Abertura, busca e setas revelam a opção somente dentro da lista.
- Saldo usa `saldoAtual` já retornado pelo serviço; sem recomputar valores, alterar RPCs ou registrar pagamentos.
- Zero e saldo negativo são exibidos; saldo ausente ou não finito fica indisponível.
- Busca, seleção, teclado, fechamento e identidade canônica preservados.

## Diagnóstico e escopo

Reproduzido no Safari autenticado: depois de rolar até a última conta, a lista retornou à primeira opção. O combobox acionava `scrollIntoView` ao mudar o destaque por hover e quando as opções recebiam nova identidade no render do modal.

O patch limita a revelação automática a abertura/busca/teclado, ajustando apenas `scrollTop` do listbox. O editor compartilhado inclui o saldo nas opções para os dois fluxos. Trabalho preexistente no checkout preservado; este manifesto descreve somente o incremento atual.

## Manifesto explícito

- `modules/gestor/financeiro/receber/components/manual-settlement/ManualSettlementCombobox.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`
- `modules/gestor/financeiro/settlements/financial-payment.account.interaction.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-15-seletor-contas-rolagem-saldo.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versao-4-8-274.md`

Total: 9 arquivos.

## Validação e limites

- Teste de interação com React/DOM real: rolagem interna por teclado, hover/refresh sem salto, saldo na primeira linha nos dois tipos de lançamento e cenários preexistentes.
- ESLint focado aprovado nos dois arquivos de implementação.
- TypeScript focado aprovado no combobox e editor, incluindo suas dependências.
- Smoke Safari local com o modal real e dados sintéticos: nome/saldo na primeira linha, negativo/zero/indisponível, rolagem até a última conta preservada durante atualizações automáticas a cada 800 ms nos dois fluxos, busca por caixa, seleção por setas/Enter e Escape aprovados.
- Reprodução autenticada ocorreu na versão existente. O smoke do patch em ambiente publicado depende de publicação posterior; a fixture local não comprova o saldo de produção.
- Revisão independente da regressão e do patch concluída sem bloqueios.
- Teto de 500 linhas validado no manifesto ao fechar o lote.
- Na validação inicial do checkout, `npm run check:file-lines` falhou por oito caminhos ausentes em manifestos anteriores, fora deste lote (Caixa, dashboard e changelog). A publicação usa base remota isolada para preservar trabalho paralelo.
- Sem operação de banco ou pagamento real.

## Entrega autorizada

Após perguntar se o GitHub havia sido atualizado, o usuário autorizou o envio. Escopo: branch, PR e prévia Vercel; sem merge na branch de produção.

Versão preparada: 4.8.342, revisão 351, sobre main `854b9c03de6b2bcbe596d48d9a5dda57b704e073`. Comparação com a base remota confirmou que os três arquivos de produto/teste contêm somente o incremento deste lote. Arquivos compartilhados de versão e registro são preparados em pasta temporária, sem substituir versões ou entradas paralelas no checkout.

A entrada 4.8.274 é movida integralmente para o arquivo histórico indicado no manifesto, mantendo changelog e arquivos do lote abaixo de 500 linhas.

Validação na base remota isolada: quatro testes de interação, TypeScript e ESLint focados, auditoria de linhas completa e build do produto aprovados. Build usa Node 24.22.1 exigido pela política existente; nenhuma guarda foi desativada. Todas as 65 entradas prévias do changelog foram preservadas integralmente.
