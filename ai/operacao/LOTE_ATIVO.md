# Lote ativo

Estado: VALIDADO — PUBLICAÇÃO EM ANDAMENTO

## Lote: 2026-09-25-emissao-ciclos-permissoes

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-25-emissao-ciclos-permissoes.md`.

- Corrigir emissão/retomada com papéis SQL reais e centralizar emissão dos ciclos na turma.
- Preservar matrícula LOCAL, histórico importado, dados financeiros e recuperação idempotente.
- SQL com teste revertido e Edge aplicados; web 4.8.86 em publicação.
- Emissão real solicitada permanece pendente: conexão de consulta recusou a credencial interna do worker. Não contornar a permissão.
