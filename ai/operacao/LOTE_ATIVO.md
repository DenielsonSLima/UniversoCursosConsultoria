# Lote ativo

Estado: VALIDADO — EM PUBLICAÇÃO

## Lote: 2026-09-25-busca-turmas-automatica

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-25-busca-turmas-automatica.md`.

- Busca de turmas deve atualizar consulta, contador e paginação após digitação.
- Preservar Enter/Filtrar, períodos aplicados, ordenação e escopo existente.
- Mostrar carregamento ao trocar a consulta, sem exibir cartões antigos como resultado atual.
- Implementação restrita ao hook compartilhado e componente de filtros; sem banco/Auth/financeiro.
- Smoke DOM com React/TanStack reais aprovado: busca, contador, paginação, Enter, datas e respostas atrasadas.
- Publicação 4.8.89 em andamento. Lote de e-mail anterior publicado na 4.8.88/PR180.
- Investigação adicional do bloqueio de login está separada deste manifesto.
