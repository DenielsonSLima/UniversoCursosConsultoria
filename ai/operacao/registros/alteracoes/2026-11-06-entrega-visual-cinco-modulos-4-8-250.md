# Entrega visual — cinco módulos — 4.8.250

## Objetivo e aceite

Aplicar a direção compacta aprovada em Formações e seus oito submódulos, Patrimônio, Relatórios, Calendário e Comunicação. Três agentes atuaram em frentes independentes; cada módulo foi implementado e conferido antes do seguinte. Dados, consultas, permissões, operações, geradores e regras de negócio são preservados.

## Manifesto explícito

- `modules/gestor/cadastros/cursos-tecnicos/CursosTecnicosPage.tsx`
- `modules/gestor/cadastros/cursos-tecnicos/components/CursoTecnicoCard.tsx`
- `modules/gestor/cadastros/cursos-tecnicos/components/CursoTecnicoCreateView.tsx`
- `modules/gestor/cadastros/cursos-livres/CursosLivresPage.tsx`
- `modules/gestor/cadastros/cursos-livres/components/CursoLivreCard.tsx`
- `modules/gestor/cadastros/cursos-livres/components/CursoLivreCreateView.tsx`
- `modules/gestor/cadastros/cursos-livres/components/CursosLivresOverview.tsx`
- `modules/gestor/cadastros/cursos-especializacao/CursosEspecializacaoPage.tsx`
- `modules/gestor/cadastros/cursos-especializacao/components/CursoEspecializacaoCard.tsx`
- `modules/gestor/cadastros/cursos-especializacao/components/CursoEspecializacaoCreateView.tsx`
- `modules/gestor/cadastros/cursos-especializacao/components/CursosEspecializacaoOverview.tsx`
- `modules/gestor/cadastros/components/CursoGradeCurricularHeader.tsx`
- `modules/gestor/cadastros/components/CursoGradeCurricularDetails.tsx`
- `modules/gestor/cadastros/formacoes-cursos.css`
- `modules/gestor/cadastros/cursos-ead/CursosEadPage.tsx`
- `modules/gestor/cadastros/cursos-ead/components/CursoEadCard.tsx`
- `modules/gestor/cadastros/ensino-superior/EnsinoSuperiorPage.tsx`
- `modules/gestor/cadastros/checklist-estagio/ChecklistEstagioPage.tsx`
- `modules/gestor/cadastros/ficha-matricula/FichaMatriculaPage.tsx`
- `modules/gestor/cadastros/modelos-documentos/ModelosDocumentosPage.tsx`
- `modules/gestor/cadastros/cursos-ead/components/CursosEadOverview.tsx`
- `modules/gestor/cadastros/ensino-superior/EnsinoSuperiorCatalog.tsx`
- `modules/gestor/cadastros/ensino-superior/EnsinoSuperiorCourseForm.tsx`
- `modules/gestor/cadastros/checklist-estagio/ChecklistCourseMenu.tsx`
- `modules/gestor/cadastros/formacoes-recursos.css`
- `modules/gestor/cadastros/CadastrosPage.tsx`
- `modules/gestor/cadastros/formacoes-hub.css`
- `ai/operacao/registros/alteracoes/2026-11-06-formacoes-compactas.md`
- `modules/gestor/cadastros/cursos-ead/components/EadCourseWizard.tsx`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/patrimonio/PatrimonioPage.tsx`
- `modules/gestor/patrimonio/components/PatrimonioToolbar.tsx`
- `modules/gestor/patrimonio/patrimonio-workspace.css`
- `modules/gestor/patrimonio/components/PatrimonioCard.tsx`
- `modules/gestor/patrimonio/components/PatrimonioTable.tsx`
- `modules/gestor/patrimonio/patrimonio-items.css`
- `ai/operacao/registros/alteracoes/2026-11-06-patrimonio-compacto.md`
- `modules/gestor/relatorios/RelatoriosPage.tsx`
- `modules/gestor/relatorios/components/RelatoriosCatalog.tsx`
- `modules/gestor/relatorios/relatorios-workspace.css`
- `ai/operacao/registros/alteracoes/2026-11-06-relatorios-compactos.md`
- `modules/gestor/calendario/CalendarioPage.tsx`
- `modules/gestor/calendario/components/AgendaWorkspace.tsx`
- `modules/gestor/calendario/components/AgendaColumn.tsx`
- `modules/gestor/calendario/components/EventModal.tsx`
- `modules/gestor/calendario/calendario-workspace.css`
- `modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx`
- `ai/operacao/registros/alteracoes/2026-11-06-calendario-compacto.md`
- `ai/operacao/registros/alteracoes/2026-11-06-comunicacao-compacta.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-05-versoes-4-8-171-a-174.md`
- `modules/gestor/comunicacao/UnifiedCommunicationPage.tsx`
- `modules/gestor/comunicacao/ComunicacaoPage.tsx`
- `modules/gestor/comunicacao/InternalCommunicationPage.tsx`
- `modules/gestor/comunicacao/InternalCommunicationView.tsx`
- `modules/gestor/comunicacao/comunicacao-workspace.css`
- `modules/gestor/comunicacao/comunicacao-framing.css`
- `modules/gestor/comunicacao/comunicacao-mobile.css`
- `modules/gestor/comunicacao/multicanal/MultichannelOperationsPage.tsx`
- `modules/gestor/comunicacao/notificacoes-push/NotificacoesPushPage.tsx`
- `modules/gestor/comunicacao/atendimento-config/AtendimentoConfigPage.tsx`
- `modules/gestor/comunicacao/automacoes-multicanal/AutomacoesMulticanalPage.tsx`
- `modules/gestor/comunicacao/automacoes-multicanal/MultichannelAutomationsPanel.tsx`
- `modules/gestor/comunicacao/comunicacao-operations.css`
- `ai/operacao/registros/alteracoes/2026-11-06-entrega-visual-cinco-modulos-4-8-250.md`
- `ai/operacao/rag/index.json`

Total: 68 arquivos.

## Evidências por etapa

- Formações: oito entradas, grades presenciais, EAD e sete etapas do assistente, Superior, Checklist, catálogos de Ficha e Modelos. Revisão das extrações e contratos, desktop e celular.
- Patrimônio: quatro cartões, tabela, paginação, busca, baixados e perfil restrito. Valores canônicos preservados.
- Relatórios: catálogo com 22 opções, três relatórios abertos e retorno ao catálogo; bloqueio por instituição ausente. Renderizadores e PDFs fora do patch.
- Calendário: navegação de meses e ano, seleção e limpeza de filtro, abertura e fechamento de dia. Correção de pintura do diálogo exclusiva do Gestor no Safari.
- Comunicação: oito entradas, filas e detalhes, configurações por polo em rascunho, catálogo de automações e revisão de Push com audiência sintética. Nenhum envio, gravação ou ativação.

Os registros individuais detalham os smokes, testes, contratos e limites. Fixtures e harnesses temporários não integram esta entrega.

## Validação final

Revisões independentes e TypeScript aprovados em cada etapa. Build integrado com Node 24.22.1 aprovado; lint dos 45 arquivos TypeScript aprovados; teto de 500 linhas e registro da versão 4.8.250 aprovados. Contrato operacional passou com índice RAG atualizado uma vez: 15 fontes e 80 trechos. Os contratos focados de cada etapa constam nos registros individuais.

Safari conferido em 1440 e 390 px, com componentes reais e fixtures sintéticas, sem gravações. As correções finais de ícones, selos, rolagem e quebra das mensagens foram retestadas. Checks remotos e estado da Preview serão acompanhados na PR.

## Entrega remota

GitHub autorizado pelo usuário ao final das cinco etapas. Destino: branch `release/visual-cinco-modulos-4.8.250`, com commit e PR via MCP sobre a base 4.8.249 (`dc23826b4d742f4be154f031fb23f620d83077d0`), somente com este manifesto. Produção não foi solicitada para este lote; entrega em branch, PR e Preview.
