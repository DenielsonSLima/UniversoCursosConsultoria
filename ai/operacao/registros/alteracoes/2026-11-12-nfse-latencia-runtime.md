# NFS-e: latência do runtime e prazo real

## Escopo e aceite
Reduzir consultas redundantes de contrato Swagger validado por 60 segundos por identidade/configuração/certificado, sem cache de A1 e sem fallback vencido. Preservar autorização por requisição. Limitar recuperação após ISSUE a 32 segundos reais, sem repetir POST ou sobrepor GET físico. ISSUE inicial tem limite separado de 45 segundos.

## Validação e limitações
Cache revisado independentemente; 8 testes locais passaram. Frontend 19 testes passaram, incluindo autorização tardia que libera a espera local mesmo com GET físico pendente. Contrato/identidade: 4 testes passaram. Tipagem, lint focado, teto de linhas e build local aprovados. Revisão independente final aprovada; CI e publicação em andamento. Smoke Safari autenticado pendente. Nenhuma emissão/cancelamento real. Cache depende de reutilização do processo e não comprova a causa histórica do atraso. Identidade XML/DPS permanece estrita. Índice RAG remoto preservado após bloqueio de upload anterior.

## Manifesto explícito
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-latencia-runtime.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-01-versao-4-8-244.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `supabase/functions/nfse-national-individual/runtime.ts`
- `supabase/functions/nfse-national-individual/contract-cache.ts`
- `supabase/functions/nfse-national-individual/contract-cache.test.ts`
- `supabase/functions/nfse-national-individual/runtime-contract-cache.test.ts`

Total: 13 arquivos
