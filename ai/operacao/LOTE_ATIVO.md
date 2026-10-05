# Lote ativo

## Lote: 2026-10-05-aluno-zoom-nitidez

Estado: ajustes preparados para 4.8.170; produção autorizada, condicionada aos checks e Preview finais.
Objetivo: corrigir autozoom e renderização turva no acesso/portal do aluno em PC e celular, preservando design e zoom manual.
Aceite: campos mobile >=16px, renderização local sem camadas persistentes, teclado/zoom distintos e nenhuma abertura de navegador.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-05-aluno-zoom-nitidez.md` (16 arquivos).
Validação: três agentes e reunião; testes de viewport, cascade CSS, tipos/lint/build e HTTP. Smoke visual/autenticado pendente por solicitação expressa.
Base: main `78afddaf51a5fe738621c8e19feb2c6dfef5db24`, versão 4.8.169. Somente manifesto publicado via MCP GitHub.
Histórico: lote Proesc anterior preservado em `ai/operacao/registros/alteracoes/2026-10-03-proesc-desconto-liquido.md`.
