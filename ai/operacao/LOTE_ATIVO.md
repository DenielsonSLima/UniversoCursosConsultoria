# Lote ativo

## Lote: 2026-11-17-nfse-estabilidade-realtime
Objetivo: corrigir oscilação Realtime e cadência do lote no emissor.
Status: produção explicitamente autorizada para as duas correções; CI/Preview antes de merge.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-17-nfse-estabilidade-realtime.md`.
Aceite: saúde válida mantida, eventos sem cancelamento; 5 segundos após resposta e mínimo8 segundos entre inícios; single-flight e recuperação429 pré-envio sem duplicar nota.
Validação: testes sintéticos, TypeScript, build, CI; smoke Safari multiusuário indisponível.
Predecessor: 2026-11-17-nfse-resumo-cbs-ibs.
