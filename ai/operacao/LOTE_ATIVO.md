# Lote ativo

## Lote: 2026-11-11-nfse-servicos-canceladas

Objetivo: retirar da aba Serviços apenas notas com cancelamento comprovado pela mesma projeção da aba Canceladas. Mudança crítica por RPC/publicação. Base 300930ece9980c8a0c46b5a2eb3446c1f9f2b507; candidata 4.8.293/revisão 302. Publicação solicitada pelo usuário. Uma migration somente leitura, sem excluir registros nem alterar status, XML ou contas. Teste reproduziu o defeito antes e passou depois; partição fiscal existente e interação diária preservadas. CI/build/Preview e validações remotas serão conferidos antes de produção. Smoke Safari autenticado pendente: Mac offline confirmado.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-11-nfse-servicos-canceladas.md`.
