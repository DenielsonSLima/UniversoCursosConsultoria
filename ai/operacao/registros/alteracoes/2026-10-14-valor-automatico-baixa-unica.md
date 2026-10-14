# Valor automático na baixa com uma forma

Status: BACKEND_APLICADO_FRONTEND_PRONTO. Versão 4.8.225/revisão234.

## Escopo

Restaurar o ajuste automático do recebimento sugerido quando existe apenas uma forma. Desconto reduz o valor; juros, multa e acréscimos aumentam. O servidor calcula saldo aberto + encargos - desconto. A tela apenas aplica a quantia e a prévia canônicas retornadas.

Editar o valor recebido manualmente ou adicionar/remover formas preserva o preenchimento manual, permitindo baixas parciais e múltiplas formas sem sobrescrever os valores informados. Confirmação usa o valor explícito e fingerprint correspondentes; retomadas enviadas continuam imutáveis. Layout e máscara de reais preservados.

## Publicação

Base main f2aea31be2de5f97f2dc5345d1bb8a8b8859d92a. Migration financial_payment_automatic_single_amount aplicada via MCP no projeto UniversoCursoseConsultoria kfekgwyqozhicpfuunpo, versão remota 20261014194245. Somente definição da RPC de prévia, sem registrar recebimentos ou cancelar boletos. Guarda de usuário/polo e validações existentes preservadas. Frontend aguarda publicação.

## Orientação do usuário

Sem novos testes ou navegador; conferência na tela será feita pelo usuário. Nenhum lançamento financeiro real foi utilizado como teste.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-10-14-valor-automatico-baixa-unica.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`
- `modules/gestor/financeiro/settlements/useFinancialPaymentForm.ts`
- `modules/gestor/financeiro/settlements/financial-payment.service.ts`
- `supabase/migrations/20261014194245_financial_payment_automatic_single_amount.sql`

Total: 10 arquivos.
