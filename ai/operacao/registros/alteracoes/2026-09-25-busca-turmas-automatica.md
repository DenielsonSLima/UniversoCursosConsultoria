# Busca automática das turmas — 25/09/2026

Estado: VALIDADO — versão 4.8.89 em publicação.

## Evidência e correção

Imagens mostram texto sem correspondência e as mesmas 63 turmas. O input atualizava somente search; a chave/consulta usava applied.search, alterado apenas por Enter ou Filtrar. O botão pode ficar fora do recorte visível e digitar não produzia consulta.

- Hook aplica search.trim() após 300 ms, cancela o temporizador anterior e retorna à página 1 junto com a nova busca.
- Mantém o período já aplicado; Enter/Filtrar aplicam imediatamente busca e datas e cancelam a busca pendente.
- Query key inclui busca, modalidade, polo, status, ordenação e página; respostas anteriores permanecem em sua própria chave.
- Loading inclui isPlaceholderData: cartões antigos não são apresentados como a nova busca. Contador sinaliza busca e paginação fica bloqueada durante carregamento.
- Mudança no hook compartilhado beneficia EAD e técnicos. Não alterar consulta Supabase, regras acadêmicas/financeiras, permissões ou dados.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-25-validacao-email-identidade.md`
- `ai/operacao/registros/alteracoes/2026-09-25-busca-turmas-automatica.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/hooks/useTurmasPaginadas.ts`
- `modules/gestor/gestao/components/TurmasFilters.tsx`

Total: 8 arquivos.

## Aceite e validação

- Digitar texto sem correspondência deve resultar em zero turmas e estado vazio sem precisar Enter/Filtrar.
- Busca por nome/código, limpeza, retorno à primeira página, ordenação, troca de status, datas e resposta fora de ordem devem manter a lista coerente com o contador.
- Smoke DOM sintético com React 19, ReactDOM e TanStack Query reais: reproduziu antes do patch (digitação mantém 63 turmas sem consulta) e passou depois.
- Eventos reais de input/Enter/click conferiram debounce, lista vazia/contador, carregamento, paginação desabilitada, limpeza/cache, página 2→1, datas+Enter sem repetição, preservação de datas aplicadas, ordenação/status/polo e resposta antiga que chega depois da nova.
- Lint dos dois arquivos, versão e teto de linhas aprovados. Revisão independente não encontrou bloqueador.
- Testes usam somente fixtures sintéticas; nenhum login ou consulta autenticada de produção. Busca sem acentos continua o contrato ILIKE existente, fora deste escopo.
- Chromium indisponível no ambiente; download não concluiu. Não afirmar smoke visual autenticado.
- Publicação via MCP GitHub, com CI e Preview antes da integração.
