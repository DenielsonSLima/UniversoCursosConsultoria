# Calendário compacto — etapa 4 de 5

## Objetivo e aceite

Após validar Relatórios, compactar cabeçalho, filtros, calendários e agenda de eventos. Preservar datas, foco/navegação de mês, categorias, eventos, callbacks e exportações existentes. Conferir agenda, filtros, navegação e abertura de dia no desktop/móvel antes de Comunicação.

## Manifesto explícito

- `modules/gestor/calendario/CalendarioPage.tsx`
- `modules/gestor/calendario/components/AgendaWorkspace.tsx`
- `modules/gestor/calendario/components/AgendaColumn.tsx`
- `modules/gestor/calendario/components/EventModal.tsx`
- `modules/gestor/calendario/calendario-workspace.css`
- `modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx`
- `ai/operacao/registros/alteracoes/2026-11-06-calendario-compacto.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 9 arquivos.

## Coordenação e risco

Três agentes: implementação visual e extração pura; revisão de contratos/fronteira PDF; harness com componentes reais. EventModal recebeu apenas marcador de estilo para corrigir pintura no Safari. Tipos, geradores e exportações ICS/CSV/PDF preservados. Nenhum evento criado/excluído e nenhuma exportação executada no smoke.

## Validação

Concluída. TypeScript e contrato de mês ativo aprovados. Revisão AST confirmou consultas, callbacks, filtros, datas, permissões e exportações preservados, incluindo a extração pura da coluna de eventos. SSR dos componentes reais cobriu 12 combinações entre Gestor, Professor e Aluno, com dados, filtros, vazio e carregamento.

Smoke Safari em 1440 e 390 px: meses novembro/dezembro/janeiro, retorno ao mês inicial, seleção e limpeza de professor, grades mensais, agenda e abertura/fechamento do dia com dois eventos. O diálogo foi corrigido após reproduzir conteúdo acessível sem pintura; a regra é exclusiva do Gestor em tela. Nenhum evento foi salvo ou excluído e nenhum arquivo foi exportado.

Limite conhecido: o fluxo existente não oferece painel específico de erro da consulta; esse comportamento foi preservado. A verificação de PDF limitou-se à integridade dos contratos, sem geração.
