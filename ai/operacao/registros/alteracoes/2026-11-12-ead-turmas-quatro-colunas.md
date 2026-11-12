# Turmas EAD em quatro colunas

## Pedido e aceite
Usuário solicitou padronização compacta da lista EAD e manteve o controle do navegador. Telas largas exibem quatro cartões por linha e doze turmas por página. A barra reúne situações e abertura de turma sem cabeçalho redundante.

Busca responde à digitação com debounce; datas são aplicadas pelo filtro. Eventos sanitizados de Gestão atualizam a lista após alterações, reconexão e retorno da visibilidade, preservando paginação, filtros e erros canônicos.

## Validação
- Revisão independente dos quatro arquivos sem achado bloqueante. Query key inclui pageSize e invalidações alcançam a lista EAD.
- Smoke DOM regenerável `tmp/ead-compact-flow.smoke.mjs`: criação, abas, doze itens por página, quatro colunas e eventos/reconexão. Sem banco ou navegador.
- Conferência visual permanece com o usuário em 127.0.0.1. Smoke interno não equivale à inspeção visual autenticada.
- Manifesto dentro do teto de 500 linhas. CI será acompanhado na PR antes de integração.

## Manifesto explícito
Total: 10 arquivos. Somente EAD e sua documentação de versão. Auth é herdado como base; Serviços/BolePix fica fora do diff.

- `modules/gestor/gestao/ead/GestaoEad.tsx`
- `modules/gestor/gestao/components/gestao-catalog-workspace.css`
- `modules/gestor/gestao/hooks/useGestaoRealtime.ts`
- `modules/gestor/gestao/hooks/useTurmasPaginadas.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-12-ead-turmas-quatro-colunas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-253.md`

## Entrega
Candidato 4.8.323 sobre `8fe410ca7fc7d8f48a02b958746bb262454e41c4` (PR #413 / 4.8.322), mantendo main/produção 4.8.321. Sem merge, migration, deploy ou operação real. A entrada 4.8.253 foi arquivada integralmente, junto ao índice histórico, para manter o changelog ativo no teto.
