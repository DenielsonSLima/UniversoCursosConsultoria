# Ficha do aluno — remoção de impressão e abas mais legíveis

Data: 2026-09-27
Versão: 4.8.111
Estado: validado para publicação

## Objetivo

Remover o atalho “Imprimir ficha” da ficha detalhada do aluno e aumentar o peso dos títulos das abas, preservando o layout compacto aprovado.

## Manifesto explícito

Total: 7 arquivos.

- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoNavigation.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-27-ficha-aluno-abas.md`

## Alteração

- Removidos botão, importação, estado e montagem do modal de ficha cadastral nesse fluxo.
- Abas desktop usam peso semibold e a aba ativa usa bold.
- Rótulo e valor do seletor responsivo também usam semibold.
- Nenhum compositor PDF, dado acadêmico, permissão, banco ou financeiro foi alterado.

## Validação

- ESLint focado nos dois componentes: aprovado.
- `git diff --check` do patch local: aprovado.
- Teto de 500 linhas: aprovado após registrar este manifesto na auditoria canônica.
- Smoke autenticado local: pendente; a origem local redirecionou ao login.
- Preview/CI e smoke autenticado de produção: conferir após a publicação.
