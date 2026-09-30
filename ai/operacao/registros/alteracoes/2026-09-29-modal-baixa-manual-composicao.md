# Modal de baixa manual com composição automática

Estado: VALIDADO PARA PUBLICAÇÃO — PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Refazer a confirmação de recebimento no padrão visual do sistema, explicitar valor da cobrança e valor final recebido, recalcular automaticamente `principal + juros + multa + acréscimos − desconto` e substituir os menus nativos de conta e forma de pagamento por comboboxes próprios.

## Manifesto explícito

- `modules/gestor/financeiro/receber/components/manual-settlement/ManualSettlementModal.tsx`
- `modules/gestor/financeiro/receber/components/manual-settlement/ManualSettlementCombobox.tsx`
- `modules/gestor/financeiro/receber/components/manual-settlement/useManualSettlementForm.ts`
- `modules/gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.ts`
- `modules/gestor/financeiro/receber/components/manual-settlement/manual-settlement-calculation.test.ts`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-29-modal-baixa-manual-composicao.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 11 arquivos.

## Contratos preservados

- A composição visual usa centavos; `valorPago` é derivado e o servidor continua validando o resultado canônico.
- Formato monetário inválido, total zero ou desconto igual/superior ao bruto bloqueiam a confirmação.
- Chave idempotente, payload, autorização, RPC, banco e invalidações permanecem inalterados.
- Conta e forma de pagamento usam busca, teclado, ARIA, fechamento externo e proteção durante envio, sem `<select>` nativo.

## Validação

- Três agentes atuaram em implementação, testes e revisão financeira/acessível.
- Quatorze testes focados aprovados; TypeScript global, ESLint focado, build e verificação de diff aprovados.
- Arquivos do manifesto permanecem abaixo de 500 linhas.
- Smoke autenticado no Safari pendente porque a superfície CUA não está disponível nesta sessão.
- Publicação em GitHub, Vercel e produção autorizada explicitamente pelo usuário em 29/09/2026.
