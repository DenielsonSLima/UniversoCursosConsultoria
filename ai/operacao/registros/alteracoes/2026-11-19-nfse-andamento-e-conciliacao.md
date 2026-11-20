# Emissão e conciliação de NFS-e · 4.8.367

O endereço intermediário anterior deixou de responder. O ajuste publicado na emissão direta já aceitava o relay atual. A rotina interna de conciliação conservava uma lista anterior e recusava esse mesmo endereço.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-19-nfse-andamento-e-conciliacao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseServicePostIssue.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.css`
- `modules/gestor/emissor-nfse/emissao/nfse-fiscal-notice.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-operation.contract.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.css`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.test.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.ts`
- `supabase/functions/_shared/nfse-national/production-relay.test.ts`
- `supabase/functions/_shared/nfse-national/production-relay.ts`
- `supabase/migrations/20261119183522_nfse_production_relay_stable_same_project_allowlist.sql`
- `supabase/migrations/20261120002346_nfse_reconciliation_stable_relay_allowlist.sql`
- `supabase/tests/nfse-reconciliation-relay-token.isolated.test.mjs`

Total: 23 arquivos.

## Validação

- Emissão individual e em lote preservam a mesma operação. A barra acompanha preparo, intervalo, envio e espera. O bloqueio confirmado antes da transmissão encerra o acompanhamento e explica a causa. Uma observação atrasada preserva resultados definitivos.
- Simulação local no Chrome, com casos de autorização e recusa anterior ao envio, em desktop e a 390 px. Testes DOM e de contrato usam transporte simulado.
- PostgreSQL isolado confirmou o novo endereço com dados sintéticos de emissão e cancelamento. Hosts não previstos, perfis sem permissão e reservas de execução inválidas foram recusados.
- A migration de emissão `20261119183522` foi recuperada do ledger aplicado. A migration de conciliação `20261120002346` foi aplicada e a definição ativa, o acesso exclusivo de `service_role` e a lista de endereços foram conferidos por leitura. Worker v3 mantém somente GET.
- O aceite da interface em produção é acompanhado pelo build e pelos checks da PR. O teste autenticado com emissão real ficou fora deste lote.
