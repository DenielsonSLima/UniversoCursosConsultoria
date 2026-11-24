# Expiração da compra opcional EAD e Resumo financeiro — 4.8.370

## Revisão e aceite

- A revisão com três agentes confirmou a situação da tentativa de compra, o calendário bancário e a divergência entre a aba EAD e o Resumo financeiro.
- A aba EAD exibe a natureza opcional e a conferência após o vencimento. A situação expirada depende de evidência de encerramento bancário associada à própria tentativa. Os totais de pendentes identificam o saldo das compras opcionais.
- O Resumo financeiro aplica o classificador canônico à soma de recebíveis em aberto. O valor recebido continua sujeito à confirmação do pagamento.
- A configuração de produção da Matriz considera o feriado da padroeira em 21/11. Para vencimento de 19/11, os três dias bancários completos são 24, 25 e 26/11. A primeira tentativa de baixa fica elegível em 27/11.

## Validação e publicação

- Ensaios locais em PostgreSQL isolado cobrem escopo, valores, histórico, calendário e preservação das baixas iniciadas. Testes da interface cobrem tabela, cartões e capacidades de operação.
- A validação em produção verifica as RPCs, a configuração da Matriz e a publicação da versão. O smoke autenticado depende de uma sessão disponível no Safari.
- A conferência do boleto existente usa o registro do sistema em modo somente leitura. A baixa segue a rotina de conciliação do Banese.

## Manifesto explícito

Total: 18 arquivos.

- `supabase/migrations/20261124001600_exclude_optional_ead_from_finance_summary.sql`
- `supabase/migrations/20261124001602_update_ead_japoata_2026_expiration_calendar.sql`
- `supabase/tests/optional_ead_checkout.isolated.test.mjs`
- `supabase/tests/ead_checkout_expiration.isolated.test.mjs`
- `docs/contracts/ead-expiracao-calendario-2026.md`
- `supabase/migrations/20261124001601_project_ead_optional_checkout_receivables.sql`
- `supabase/tests/financial_payment.isolated.test.mjs`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesSummaryCards.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-source-capabilities.test.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-11-versao-4-8-298.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-23-ead-expiracao-financeiro.md`
