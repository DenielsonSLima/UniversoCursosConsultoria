# Revisão Banese e composição Proesc — 4.8.47

## Escopo e resultado

- Radiologia: pagamento Banese em próximo dia útil bancário recusado pela faixa contratual; nova janela usa calendário nacional de 2026 verificado, sem alterar termos originais nem aceitar pagamentos parciais intermediários.
- Diagnóstico autenticado isolado faz consultas GET e não executa manutenção ou conciliação.
- Caixa, recebíveis e recebimentos usam composição Proesc confirmada por evidência histórica e pagamento API compatíveis. Evidência posterior conflitante invalida a anterior; omissão de componentes na API não apaga prova anterior.
- Ausência de componentes permanece nula, inclusive quando recebido e principal são iguais. Banese/manual continuam pelo contrato existente.
- Duas comprovações históricas gravadas após a interface 4.8.47 entrar em produção: ambas VERIFIED, desconto de R$ 19,90, juros e multa zero. As duas projeções retornam CONCILIADO_POR_CONFERENCIA_PROESC; recebíveis preservados e replay idempotente confirmado. Demais encargos Proesc ainda não discriminados integralmente.

## Validação

- 53 testes Caixa, TypeScript, build e ESLint focado aprovados.
- 43 testes Deno de conciliação/calendário/diagnóstico aprovados.
- Ensaio SQL de composição e prova idempotente com rollback aprovados; projeção Banese e calendário aprovados no banco.
- PDF nativo com dados sintéticos renderizado: comprovado, não discriminado e Banese preservam seus componentes e totais; texto vetorial e fontes incorporadas.
- Worker100, payment-gateway-api32 e asaas-api96 ativos. Título isolado retomado por CAS; cron concluiu PAGO/DONE sem falhas e projeção com desconto.

## Limitações e sequência

- Calendário automático validado somente para2026; anos sem calendário não recebem extensão presumida. Feriados locais não presumidos.
- PR 141 incorporado por squash e026a0f56c301f86ba9aee30c263042d97ff1631. Vercel success; produção conferida pelo coordenador com HTTP 200 e versão 4.8.47 no ativo público main-BeqyXds2.js.
- GitHub Actions do HEAD 17e83e67 permaneceu QUEUED sem runner: runs 34717154177/178, nenhuma etapa executada. Os testes locais e ensaios SQL acima passaram; não houve aprovação desses jobs de CI. A branch main não tinha checks obrigatórios configurados na consulta realizada.
- Auditoria pós-gravação somente leitura: T42 mantém 346 vínculos, 204 pagos, 142 abertos e R$ 53.813,57 recebidos. Radiologia: título revisado PAGO por R$ 260,00 em 08/09/2026, vencimento original 06/09/2026.
- Registro definitivo das duas evidências concluído; novas turmas e ampliação financeira pertencem ao lote próprio.
- Novo pedido do usuário retomou nove turmas por XLS durante este lote. Preparação independente em arquivos privados; nenhuma importação das novas turmas pertence a este manifesto.

## Registro remoto

- Ensaio rollback:20260912200535, representado por arquivo noop, sem DDL persistida.
- Composição Proesc80–84:20260912201222,20260912201224,20260912201226,20260912201229,20260912201231.

## Manifesto explícito

- `modules/gestor/caixa/report/caixa-report.types.ts`
- `modules/gestor/caixa/report/caixa-report.mapper.ts`
- `modules/gestor/caixa/report/caixa-report.validation.ts`
- `modules/gestor/caixa/report/caixa-report.mapper.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `supabase/migrations/20260912200535_dry_run_proesc_verified_composition.sql`
- `supabase/tests/proesc_verified_composition.transaction.sql`
- `supabase/migrations/20260912220120_preserve_unknown_proesc_components.sql`
- `supabase/migrations/20260912221000_banese_verified_banking_grace.sql`
- `supabase/tests/banese_banking_grace.readonly.sql`
- `supabase/migrations/20260912220084_proesc_composition_receipts_feed.sql`
- `supabase/migrations/20260912220082_proesc_composition_caixa_recurring.sql`
- `supabase/migrations/20260912220081_proesc_composition_caixa_receipts.sql`
- `supabase/migrations/20260912220083_proesc_composition_receivables_page.sql`
- `supabase/migrations/20260912220080_resolve_verified_proesc_composition.sql`
- `supabase/functions/banese-reconciliation-worker/index.ts`
- `supabase/functions/banese-reconciliation-worker/request-guards.ts`
- `supabase/functions/banese-reconciliation-worker/diagnostic.ts`
- `supabase/functions/banese-reconciliation-worker/diagnostic.test.ts`
- `supabase/functions/banese/internal/banking-calendar.ts`
- `supabase/functions/banese/internal/settlement-range.ts`
- `supabase/functions/banese/internal/settlement-range.test.ts`
- `supabase/functions/gateways/api/banese.ts`
- `supabase/functions/gateways/api/banese-settlement.test.ts`
- `supabase/functions/gateways/api/banese-transaction-routing.test.ts`
- `supabase/functions/gateways/api/banese-banking-grace.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-12-revisao-banese-proesc.md`

Total: 31 arquivos
