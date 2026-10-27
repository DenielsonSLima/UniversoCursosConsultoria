# Emissão interna restrita de taxa corrigida

Mudança crítica, candidato 4.8.240/revisão249. Objetivo: executar uma taxa previamente preparada mediante autorização explícita e capability privada por operação/manifesto/recebível; ator Sistema, nenhuma identidade humana simulada. Implantar software não aprova nem emite título.

Risco e aceite: manter autorização histórica intacta; impedir pagamento, divergência, concorrência e reenvio após resposta perdida; preservar12mensalidades e run. Worker autenticado limita ação a um recebível, consulta título/pagamentos após POST e persiste pelo contrato canônico. Novo GET é obrigatório antes do POST. Aprovação e dispatch são privados/admin-only; tabela sem grants e com RLS.

Validação: testes SQL isolados e contratos do worker; revisão independente obrigatória. CI remoto, readback de migrations/bundle e operação real ainda pendentes. Smoke UI depende da sessão real; nenhum teste local toca banco externo.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-taxa-rejeitada-servico-restrito.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `scripts/test-rejected-technical-fee.mjs`
- `supabase/functions/technical-manual-cycle-issuance/dependencies.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/index.ts`
- `supabase/functions/technical-rejected-fee-correction/service-issuance.ts`
- `supabase/functions/technical-rejected-fee-correction/service-issuance.test.ts`
- `supabase/functions/technical-rejected-fee-correction/service-recovery.ts`
- `supabase/migrations/20261027182200_rejected_fee_service_capability.sql`
- `supabase/migrations/20261027182300_rejected_fee_service_dispatch.sql`
- `supabase/tests/financial-correction-worker-auth.test.ts`
- `supabase/tests/rejected-fee-service-capability.isolated.test.mjs`

Total: 16 arquivos.
