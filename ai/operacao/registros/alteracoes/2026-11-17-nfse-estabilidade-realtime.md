# Emissor NFS-e: estabilidade e cadência do lote

## Objetivo e autorização
Produção explicitamente autorizada pelo proprietário ao responder Sim à pergunta sobre publicar as duas correções do emissor. Saúde válida preservada em refetch, eventos sem cancelamento e nova leitura após evento em voo. Lote aguarda 5 segundos após resposta e no mínimo 8 segundos entre inícios, uma chamada física de cada vez; 429 pré-envio aguarda prazo sem repetir envio incerto.

## Manifesto explícito
- `.github/workflows/nfse-regressions.yml`
- `modules/gestor/emissor-nfse/components/NfseEnvironmentStatus.tsx`
- `modules/gestor/emissor-nfse/realtime/nfse-subscription.ts`
- `modules/gestor/emissor-nfse/realtime/nfse-realtime.test.ts`
- `modules/gestor/emissor-nfse/realtime/nfse-background-stability.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/nfse-batch-rate-limit.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch-review-quota.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-command-quota-retry.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-11-versao-4-8-291.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-17-nfse-estabilidade-realtime.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 18 arquivos.

## Segurança e aceite
Sem operações fiscais reais, banco, numeração, configuração ou nova alteração no relatório. Testes sintéticos somente. Base fb32519f992664b7a5c3f5cf0f5ee430cd5b5518 preserva relatório4.8.360. Correção piscada revisada independentemente sem bloqueios. Correção lote revisada nos commits38238d9a/fad6ca92.

## Validação
345 testes core passaram. Testes de cache real, interação DOM, TypeScript, lint, build e CI conferidos antes do merge. Mock antigo atualizado para contrato isFetching; testes de UI aguardam cadência real e teste novo incluído no CI. Smoke Safari multiusuário indisponível; não se alega validação visual autenticada nem emissão real. Histórico4.8.291 arquivado sem perda para respeitar500 linhas.
