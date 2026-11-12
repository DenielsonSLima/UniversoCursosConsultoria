# Lote ativo

## Lote: 2026-11-12-nfse-endereco-consistente
Objetivo: desbloquear preparação de NFS-e por número ausente, preservando revisão fiscal canônica, histórico e idempotência.
Status: integração4.8.310; testes locais aprovados, backend complementar/CI/deploy em andamento.
Autorização: usuário autorizou ajustes e publicação; 00 provisório explícito nos cadastros legados. Sem emissão/cancelamento de nota real.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-nfse-endereco-consistente.md`.
Limitações: demais lacunas cadastrais continuam bloqueando; smoke Safari autenticado pendente; concorrência PGlite cobre interleavings serializados, não multi-sessão real.
