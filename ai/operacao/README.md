# Operação de agentes

Esta é a fonte versionada de contexto operacional do repositório. Ela evita buscas amplas, decisões esquecidas e publicações fragmentadas.

## Leitura mínima por agente

1. `MEMORIA_CANONICA.md`
2. `LOTE_ATIVO.md`
3. A busca focada pelo script `node scripts/agent-memory-rag.mjs search "<demanda>"`

Não leia todo o repositório, todos os registros ou todas as decisões sem necessidade. O manifesto RAG define as fontes permitidas e a busca devolve trechos citáveis.

## Fontes de verdade

- Regras duráveis e decisões operacionais: `MEMORIA_CANONICA.md`.
- Trabalho em curso: `LOTE_ATIVO.md`.
- Processo de entrega: `PROTOCOLO_DE_LOTES.md`.
- Histórico de produto: `internal/versioning/CHANGELOG.md`.
- Decisões de arquitetura: `docs/decisions/`.
- Registros de execução e publicação: `registros/`.

Os diretórios legados `ai/memoria`, `ai/rag` e `ai/skil` não são fontes autoritativas. Eles são mantidos apenas como histórico até uma migração explícita.
