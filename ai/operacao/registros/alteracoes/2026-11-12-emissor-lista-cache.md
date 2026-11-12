# Emissor NFS-e: apresentação e cache

## Escopo e autorização
Usuário solicitou revisar e publicar lista de notas com CPF/CNPJ e cidade/UF,
além de impedir indicadores piscando na navegação. Não há emissão/cancelamento.

## Implementação
Identificação do tomador derivada apenas do XML autorizado e catálogo IBGE.
Campos ausentes ficam explícitos. Projeção adicional sem alterar filtros, valores
ou guardas. Migration 20261112140440 aplicada, grants e resposta sintética validados.
Cache de leitura em memória por 5 min, chaves completas e limpeza de sessão.
Refetch mantém valor da mesma chave; erro, falta de acesso e mudança de datas
continuam escondendo total. Realtime, foco e reconexão preservados.

## Validação
287 contratos, 3 testes DOM, SQL XML sintético e TypeScript. Build/lint/CI
no fechamento. Smoke autenticado Safari pendente: Mac indisponível.
Advisors remotos sem delta na aplicação. Nenhum dado real mutado.

## Manifesto explícito
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-12-emissor-lista-cache.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-issued-recipient-layout.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-summary-cache.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `internal/versioning/changelog/2026-10-24-a-27-versoes-4-8-234-a-235.md`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedList.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedPeriod.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedRows.tsx`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedTotalMetric.tsx`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-downloads.css`
- `modules/gestor/emissor-nfse/emitidas/nfse-recipient.presentation.test.ts`
- `modules/gestor/emissor-nfse/emitidas/nfse-recipient.presentation.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueue.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseQueries.ts`
- `modules/gestor/emissor-nfse/queries/nfse-summary-cache.interaction.test.mjs`
- `modules/gestor/emissor-nfse/queries/nfse-summary-cache.ts`
- `modules/gestor/emissor-nfse/services/nfse-documents.contract.test.ts`
- `modules/gestor/emissor-nfse/services/nfse.mappers.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `supabase/migrations/20261112140440_nfse_issued_recipient_details.sql`
- `supabase/tests/nfse_issued_recipient.isolated.test.mjs`

Total: 26 arquivos
