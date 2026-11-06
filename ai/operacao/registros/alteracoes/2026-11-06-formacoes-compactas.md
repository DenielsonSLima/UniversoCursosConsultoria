# Formações compactas — etapa 1 de 5

## Objetivo e aceite

Aplicar o padrão compacto aprovado à Central de Formações e seus oito submódulos. Preservar conteúdo, dados, consultas, handlers, permissões, modelos e documentos. Conferir navegação, abertura de cursos, perfis restritos e telas desktop/móvel antes de avançar a Patrimônio, Relatórios, Calendário e Comunicação.

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

Total: 31 arquivos.

## Coordenação e risco

Três agentes solicitados pelo usuário: catálogos acadêmicos; EAD/Superior/recursos institucionais; harness e revisão independente. Coordenador integra o hub, valida Safari e libera uma etapa por vez. Sem gravações acadêmicas, emissão ou edição de documentos no smoke. GitHub autorizado ao final das cinco etapas; produção depende de pedido explícito.

## Validação

- Revisão independente: returns das seis páginas equivalentes à base 4.8.249 após reinserir as extrações; 215 props transportadas diretamente e hooks/handlers preservados. TypeScript integrado e 11 contratos passaram.
- Safari desktop: hub com quatro cartões por linha; oito subrotas carregadas; abertura das três grades presenciais, configuração EAD e formulário Superior; duas abas do Checklist conferidas. Ficha/Modelos permaneceram nos catálogos, sem abrir PDF/editor.
- Safari 390×744: hub restrito exibe apenas os três recursos permitidos; catálogos EAD/Modelos legíveis em uma coluna; enquadramento EAD e navegação horizontal das sete etapas conferidos. Desktop 1440 confirma sete etapas em uma linha.
- Smoke revelou animações que deixavam conteúdo invisível e precedência de utilitários Tailwind. Correções CSS restritas às superfícies do módulo, sem estilos de impressão nem modais fixos; reteste mostrou conteúdo e estilos compactos.
- Gates SSR: cinco combinações do hub e modos normal/readOnly Livre/Especialização passaram. Sem gravações, cobranças, publicação de curso ou emissão documental.
- Enquadramento EAD adicional revisado: AST idêntico excluindo classes/import CSS e TypeScript final aprovado. Etapa 1 validada em prévia com componentes reais e fixtures sintéticas; etapa 2 liberada.
