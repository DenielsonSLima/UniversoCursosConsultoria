# Lote ativo

Estado: VALIDADO — BACKEND APLICADO; VERSIONAMENTO EM PUBLICAÇÃO

## Lote: 2026-09-25-validacao-email-identidade

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-25-validacao-email-identidade.md`.

- Corrigir consulta de titularidade à tabela privada de responsáveis no gerenciamento de acesso.
- RPC mínima por UID, exclusiva do serviço; preservar conflitos de CPF/e-mail e auditoria.
- Regressão comportamental reproduziu HTTP 500 antes do patch.
- Papéis efetivos validados; RPC e Edge v36 aplicadas. Publicação 4.8.88 em andamento.
- 207 testes de acesso aprovados; tabela privada preservada.
- Validação individual pendente de acionamento pelo gestor: conexão interna somente leitura.
- Revisão interna sem login, conforme solicitado. Lote anterior publicado na 4.8.87.
