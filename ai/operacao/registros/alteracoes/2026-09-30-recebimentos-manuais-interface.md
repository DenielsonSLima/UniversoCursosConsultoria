# Interface dos recebimentos manuais

Estado: VALIDADO PARA PUBLICAÇÃO — PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Normalizar juros, multa, desconto e outros acréscimos da baixa manual para real brasileiro ao sair do campo e abrir o cadastro manual de Outros Créditos como workspace de viewport completo, sem alterar contratos financeiros.

## Manifesto explícito

- `modules/gestor/financeiro/receber/components/manual-settlement/ManualSettlementModal.tsx`
- `modules/gestor/financeiro/receber/components/manual-settlement/useManualSettlementForm.ts`
- `modules/gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.ts`
- `modules/gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.test.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-create-modal.test.ts`
- `scripts/test-pdv-receipts.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-recebimentos-manuais-interface.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 12 arquivos.

## Contratos preservados

- A máscara atua somente na apresentação; composição e payload continuam derivados dos mesmos centavos.
- Entrada inválida permanece visível para correção e continua bloqueando a confirmação.
- O workspace de Outros Créditos preserva modos, validação, payload e mutação existentes; somente a contenção visual, rolagem e foco mudam.
- Backend, RPC, autorização, idempotência, banco e invalidações permanecem inalterados.

## Validação

- Reprodução confirmada pelas imagens de produção: `19` permanecia cru na baixa e Novo crédito era limitado a um diálogo central.
- Treze testes da baixa e 31 testes do fluxo PDV/Outros Créditos aprovados.
- TypeScript, ESLint focado e verificação de diff aprovados; arquivos manuais permanecem abaixo de 500 linhas.
- Revisão independente confirmou que o portal já era correto e que `max-w-4xl` causava a contenção indevida.
- Publicação em GitHub, Vercel e produção autorizada explicitamente pelo usuário em 30/09/2026.
