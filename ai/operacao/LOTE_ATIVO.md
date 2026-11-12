# Lote ativo

## Lote: 2026-11-12-numero-sn-automatico
Objetivo: seguir orientação posterior do proprietário: ausência de número vira S/N, não 00; preservar números reais e documentos fiscais emitidos.
Status: integração4.8.311; migration e substituição auditada439 aplicadas; testes/CI/deploy em fechamento.
Autorização: usuário determinou S/N automático e correção dos00 provisórios. Sem emissão/cancelamento de nota real.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-numero-sn-automatico.md`.
Limitações: S/N é marcador autorizado de ausência; demais campos ausentes continuam bloqueando. Smoke Safari autenticado pendente.
