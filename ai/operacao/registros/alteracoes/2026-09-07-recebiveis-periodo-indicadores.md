# Recebíveis: período e indicadores operacionais

Estado: publicação em produção autorizada explicitamente em 07/09/2026; validação da entrega em andamento. Versão 4.8.33.

## Objetivo e escopo

Substituir os quatro cartões genéricos de A Receber por Recebido, A vencer e Em atraso, com valor e quantidade. Adicionar período inicial no mês atual e atalhos de mês anterior, últimos 30 dias (hoje + 29 dias), todo o período e personalizado. O compositor compartilhado atende Técnico, Cursos Livres, Especialização e EAD.

## Manifesto explícito

- `modules/gestor/financeiro/receber/components/ModalidadeReceberTab.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ModalidadeReceberToolbar.tsx`
- `modules/gestor/financeiro/receber/hooks/useModalidadeReceberQueries.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivables-period.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivables-period.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesPeriodFilter.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivablesSummaryCards.tsx`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-07-recebiveis-periodo-indicadores.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`

Total: 13 arquivos.

## Contrato e decisões

- Definição da RPC `get_receivables_modality_summary_v3_secure` conferida por MCP Supabase somente leitura: agregados por polo, turma, busca e data de vencimento; recebido usa valor pago e vencidos usam status VENCIDO.
- Nenhuma migration, alteração remota ou soma monetária no frontend. A vencer reutiliza o agregado de pendentes, com início do intervalo limitado a hoje; preserva a regra canônica de pendentes, inclusive suspensos. A descrição diz que inclui vencimentos de hoje.
- A mesma interseção de datas e situação alimenta a lista e o extrato. Mês passado resulta em A vencer vazio, sem abrir o histórico geral.
- Indicadores mostram o recorte de busca/turma/período independentemente da aba; clique seleciona situação e a linha de total acompanha essa situação em todas as páginas.
- Todo o período remove as datas. Redefinir filtros retorna ao mês atual, todas as turmas, busca vazia e pendentes.
- Em Todos, o total é explicitamente nominal e inclui canceladas. Recebido esclarece que o recorte é por vencimento, não por data do pagamento.
- Alterações preexistentes nos componentes, incluindo filtro de turma e agrupamento por aluno, foram preservadas e conferidas com a main remota. O compositor de PDF, as regras bancárias e as permissões não foram alterados.

## Validação

- 8 testes focados de período, fronteira UTC/Maceió, ano bissexto, virada do ano, intervalo inválido, interseção de A vencer e seleção dos agregados: aprovados.
- 6 testes existentes do utilitário de períodos reutilizado: aprovados.
- ESLint dos 7 arquivos de implementação/teste e diagnóstico TypeScript limitado a esses arquivos: aprovados.
- Bundle esbuild do componente integrado e diff-check do diretório afetado: aprovados.
- Revisão independente sem bloqueadores: confirmou ausência de cálculo financeiro no frontend e paridade dos filtros entre resumo, lista e exportação.
- Testes de período incluídos no gate financeiro do CI.
- Build de produção 4.8.33, controle de versão e auditoria de linhas aprovados antes do envio ao GitHub.
- `npm run check:file-lines`: aprovado; todos os arquivos do manifesto dentro de 500 linhas. Índice RAG atualizado uma vez no fechamento.
- Reprodução por captura e inspeção do caminho real de filtros/RPC. Smoke autenticado desktop/celular não realizado: controle do Chrome não autorizado, navegadores Chrome/IAB indisponíveis e Safari em uso com intervenções do usuário. Nenhum teste foi apresentado como substituto desse smoke.

## Pendências de entrega

- Exercitar na sessão autenticada: presets, turma, busca, clique nos três indicadores, abas, personalizado inválido, redefinição e exportação com os filtros aplicados; desktop e celular.
- Publicação autorizada pelo gestor após ciência da limitação do smoke. Conferir Preview, CI e produção para o commit exato do manifesto.
