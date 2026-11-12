# Política comum de cache no Emissor

## Escopo
Extrai a política global existente sem alterar os valores do restante do sistema. Projeções do Emissor passam a usá-la. Realtime revalida imediatamente, com isolamento por usuário, contexto, polo, ambiente, mês e filtros. Decisões de autorização continuam fora dessa retenção.

## Verificação
Três testes de interação/multiusuário passaram: navegação, mudança de contexto, evento realtime e recuperação da assinatura. TypeScript, lint e build no fechamento. Nenhuma migration ou operação fiscal. Smoke autenticado Safari pendente.

## Manifesto explícito
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-12-cache-comum-emissor.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-summary-cache.md`
- `index.tsx`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `lib/query-cache-policy.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueue.ts`
- `modules/gestor/emissor-nfse/queries/nfse-summary-cache.ts`
- `modules/gestor/emissor-nfse/realtime/nfse-summary-multiuser.test.mjs`

Total: 13 arquivos
