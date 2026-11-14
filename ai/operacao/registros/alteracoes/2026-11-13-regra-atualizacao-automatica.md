# Atualização automática dos dados

Pedido explícito em 13/11/2026: retirar o botão Atualizar, manter dados por TanStack Query/Realtime e registrar a regra na skill, memória e RAG do Universo.
Lote operacional separado do produto. Não altera AGENTS nem regras de negócio.

## Regra

O sistema não deve oferecer botões manuais de atualização/recarregamento/sincronização de dados. Usar invalidação de TanStack Query por eventos/mutações, reconexão e retry limitado, com estados de carregamento/erro. A atualização deve ocorrer automaticamente.

## Manifesto explícito

- `ai/operacao/politicas/INTERFACE.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/skills/universo-interface-compacta/SKILL.md`
- `docs/design/interface-compacta.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-13-regra-atualizacao-automatica.md`

Total: 6 arquivos.

## Validação

Regra acrescentada às fontes canônicas e à skill versionada; cópia instalada e nota da memória pessoal serão sincronizadas. Índice RAG será refeito uma vez no fechamento.
