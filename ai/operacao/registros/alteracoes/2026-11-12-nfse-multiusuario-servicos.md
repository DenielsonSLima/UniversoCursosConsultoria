# NFS-e: acesso multiusuário e serviços preparados

## Escopo e aceite
Autorizar o executor atual no polo/contexto real, sem emprestar identidade do criador. Preservar autoria, identidade DPS, assinatura e envio único. Exibir preparação não enviada separadamente de retorno fiscal. Remover apenas preparação de serviço ainda sem assinatura/envio, com histórico preservado. Cancelamento fiscal entre usuários não foi ampliado.

## Validação e limites
73 testes Edge e 9 testes SQL PGlite aprovados. UI e remoção revisadas separadamente. Concorrência real PostgreSQL, CI, build integrado e smoke Safari autenticado ainda pendentes. Nenhuma emissão ou cancelamento real realizado. Publicação depende dos gates e coordenação final.

## Manifesto explícito
- `.github/workflows/nfse-postgres-concurrency.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-multiusuario-servicos.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-05-versao-4-8-245.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emissao/nfse-operation.contract.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.errors.test.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.errors.ts`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.tsx`
- `supabase/functions/nfse-national-individual/handler.test.ts`
- `supabase/functions/nfse-national-individual/handler.ts`
- `supabase/functions/nfse-national-individual/runtime.test.ts`
- `supabase/functions/nfse-national-individual/runtime.ts`
- `supabase/migrations/20261112171501_nfse_multiuser_operation_core.sql`
- `supabase/migrations/20261112171502_nfse_multiuser_operation_bridge.sql`
- `supabase/migrations/20261112171503_nfse_multiuser_unsigned_refresh.sql`
- `supabase/migrations/20261112171504_nfse_multiuser_queue_preview.sql`
- `supabase/migrations/20261112173000_nfse_unsigned_service_removal.sql`
- `supabase/tests/nfse_multiuser_operation.isolated.test.mjs`
- `supabase/tests/nfse_partner_service_removal.isolated.test.mjs`
- `supabase/tests/nfse_postgres_concurrency.test.mjs`

Total: 24 arquivos
