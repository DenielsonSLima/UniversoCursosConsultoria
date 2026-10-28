# Lote ativo

Lote 2026-10-28-certificado-ead-aluno-modelo: entrega 4.8.243. Corrige leitura do modelo EAD do próprio certificado finalizado pelo aluno, sem ampliar a RLS genérica nem alterar registros acadêmicos. Erros e repetição deixam de ser confundidos com geração de PDF.

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-28-certificado-ead-aluno-modelo.md`.

Migration MCP 20261028185541 aplicada e conferida. Testes de autorização e JSDOM passaram com revisão independente; TypeScript e lint focado passaram. Publicação inclui CI e Preview do commit exato. Smoke autenticado Safari e inspeção visual do PDF do aluno não foram realizados por indisponibilidade de sessão, sem contorno do ambiente.
