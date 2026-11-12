# Acompanhamento de emissão em lote

## Escopo e aceite
Modal compacto, uma linha por nota, dados expansíveis, progresso e retorno canônico. Botões manuais de atualização/consulta removidos; reconciliação da mesma DPS por consultas limitadas, Realtime/foco/online com cooldown e single-flight. Timeout/pausa nunca significam rejeição nem repetem ISSUE. IDs mínimos persistidos, sem payload fiscal. Regras conhecidas têm orientação específica; erro desconhecido sanitizado.

## Validação
14 testes core, 5 mensagens e 1 DOM passaram; tipagem aprovada. Revisão independente com texto/foco corrigidos. CI, build e publicação em andamento. Smoke Safari autenticado pendente, não substituído por testes sintéticos. Nenhuma emissão/cancelamento real, alteração de financeiro ou notas emitidas.

## Manifesto explícito
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-lote-acompanhamento.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-27-versao-4-8-242.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.css`
- `modules/gestor/emissor-nfse/emissao/useNfseBatchRealtime.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual-preparation.service.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.errors.test.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.errors.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.service.ts`
- `modules/gestor/emissor-nfse/preparar/useNfseStudentsDialog.ts`
- `modules/gestor/emissor-nfse/services/nfse-rule-errors.ts`
- `modules/gestor/emissor-nfse/services/nfse.errors.test.ts`
- `modules/gestor/emissor-nfse/services/nfse.errors.ts`

Preserva diagnóstico sanitizado de identidade em resposta POST ambígua sem relaxar validação XML/DPS. Não atribui causa externa sem evidência.

- `supabase/functions/_shared/nfse-national/production.ts`
- `supabase/functions/_shared/nfse-national/production.types.ts`
- `supabase/functions/_shared/nfse-national/production-diagnostics.test.ts`
- `supabase/functions/_shared/nfse-national/production-post-identity.test.ts`

Total: 25 arquivos

Índice RAG remoto preservado: upload rejeitado pela revisão automática de risco por conter metadados amplos. Correções de produto independentes.
