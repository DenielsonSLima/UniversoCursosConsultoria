# Forma de pagamento por conta

## Pedido e aceite

Ao escolher caixa físico, sugerir Dinheiro; Banese ou Caixa Econômica, Pix.
Manter a forma editável, sem efetuar pagamentos nem modificar dados financeiros.
Mudança crítica por interface financeira/publicação, restrita ao modal compartilhado
de baixa manual usado por Despesas, Contas a Pagar e recebimentos compatíveis.
Base 4.8.291, preservando as entregas NFS-e anteriores.

## Implementação

- Caixa físico identificado pelo metadado CAIXA_INTERNO, nunca por ocorrência do nome Caixa.
- Bancos reconhecidos pelo campo banco normalizado com nomes exatos, sem busca parcial.
- Padrão aplicado na conta inicial e em troca explícita de conta, por componente.
- Mesma conta, renderizações e contas sem regra preservam a forma manual escolhida.
- Tentativas enviadas recuperam integralmente forma, conta, valores, requestId e fingerprint.
- Nenhuma alteração de RPC, cálculo, saldo, confirmação, estorno ou integração bancária.

## Validação

- Regressão reproduzida no código anterior: Banese inicial aparecia como Dinheiro.
- Três testes unitários e um teste React DOM com o modal real aprovados.
- Interação cobre caixa/Banese/Caixa Econômica, forma manual, nova renderização,
  mesma conta, conta desconhecida, múltiplas formas, remoção, reabertura e retomada.
- O cliente é sintético e rejeita chamadas de confirmação/estorno. Nenhum pagamento real executado.
- ESLint focado aprovado. CI cobre tipagem/build, ledger e regressão financeira.
- Smoke visual autenticado pendente: Safari indisponível no Mac offline.
  Teste DOM não substitui conferência visual em produção.
- Histórico antigo do changelog arquivado sem remover conteúdo para manter teto de 500 linhas.

## Manifesto explícito

Total: 13 arquivos

- `.github/workflows/financial-payments.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-forma-pagamento-por-conta.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `internal/versioning/changelog/2026-10-14-versoes-4-8-218-a-226.md`
- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentModal.tsx`
- `modules/gestor/financeiro/settlements/useFinancialPaymentForm.ts`
- `modules/gestor/financeiro/settlements/financial-payment.account.ts`
- `modules/gestor/financeiro/settlements/financial-payment.account.test.ts`
- `modules/gestor/financeiro/settlements/financial-payment.account.interaction.test.mjs`
