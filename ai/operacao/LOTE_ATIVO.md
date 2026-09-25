# Lote ativo

Estado: VALIDADO — BACKEND APLICADO; VERSIONAMENTO EM PUBLICAÇÃO

## Lote: 2026-09-25-lentidao-repeticao-emissao

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-25-lentidao-repeticao-emissao.md`.

- Eliminar repetição ilimitada de conflitos permanentes na marcação de falha BolePix.
- Preservar autorização, ownership, dados financeiros e emissão idempotente.
- SQL e emissor/worker v9 aplicados; 65 testes e regressão SQL real aprovados.
- Boletos do caso anterior confirmados completos; não reemitir.
- Teste de acesso pelo usuário; revisão interna sem login, conforme solicitado.
