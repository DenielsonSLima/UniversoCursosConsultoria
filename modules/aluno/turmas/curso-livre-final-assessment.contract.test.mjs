import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [
  managerService,
  managerHook,
  managerUi,
  managerQuestionEditor,
  header,
  grade,
  studentService,
  studentHook,
  studentUi,
  detail,
  catalog,
  catalogUtils,
  catalogHook,
] = await Promise.all([
  readSource('../../gestor/cadastros/cursos-livres/avaliacao-final/avaliacao-curso-livre.service.ts'),
  readSource('../../gestor/cadastros/cursos-livres/avaliacao-final/useAvaliacaoCursoLivreGestao.ts'),
  readSource('../../gestor/cadastros/cursos-livres/avaliacao-final/CursoLivreAvaliacaoFinalTab.tsx'),
  readSource('../../gestor/cadastros/cursos-livres/avaliacao-final/QuestaoCursoLivreEditor.tsx'),
  readSource('../../gestor/cadastros/components/CursoGradeCurricularHeader.tsx'),
  readSource('../../gestor/cadastros/components/CursoGradeTab.tsx'),
  readSource('./components/final-assessment/curso-livre-final-assessment.service.ts'),
  readSource('./components/final-assessment/useCursoLivreFinalAssessment.ts'),
  readSource('./components/final-assessment/LiveFinalAssessmentTab.tsx'),
  readSource('./components/TurmaDetail.tsx'),
  readSource('../cursos/components/CourseCatalogGrid.tsx'),
  readSource('../cursos/cursosPage.utils.ts'),
  readSource('../cursos/hooks/useAlunoCoursesCatalog.ts'),
]);

test('gestão usa somente as RPCs versionadas da avaliação Livre', () => {
  assert.match(managerService, /obter_avaliacao_curso_livre_gestao_secure/);
  assert.match(managerService, /salvar_avaliacao_curso_livre_gestao_secure/);
  for (const parameter of [
    'p_request_id',
    'p_curso_id',
    'p_avaliacao_id',
    'p_expected_revisao',
    'p_publicar',
    'p_config',
    'p_questoes',
  ]) assert.match(managerService, new RegExp(parameter));
  assert.match(managerService, /p_expected_revisao: input\.expectedRevisao/);
  assert.match(managerHook, /avaliacaoCursoLivreGestaoKeys\.detail\(input\.cursoId\)/);
  assert.match(managerUi, /avaliacaoId: createVersion \? null : assessment\.id/);
  assert.match(managerUi, /expectedRevisao: createVersion \? null : assessment\.revisao/);
  assert.match(managerUi, /id: _publishedQuestionId/);
});

test('publicação exige banco mínimo e a aba só aparece para Curso Livre', () => {
  assert.match(managerUi, /activeQuestions < minimumBank/);
  assert.match(managerUi, /DEFAULT_MINIMUM_BANK = 50/);
  assert.match(managerUi, /DEFAULT_DRAW_COUNT = 10/);
  assert.match(header, /curso\.modalidade === 'LIVRE'.*\['avaliacao', 'Avaliação final'\]/s);
  assert.match(detail, /data\.selectedIsLive.*id: 'prova_final'/s);
  assert.match(detail, /activeTab === 'prova_final'/);
  assert.match(grade, /Resumo do conteúdo de \$\{disciplina\.nome\}/);
  assert.match(grade, /updateDescription\(modulo\.id, disciplina\.id/);
  assert.match(managerUi, /MAX_QUESTIONS = 500/);
  assert.match(managerUi, /disabled=\{draft\.questoes\.length >= MAX_QUESTIONS\}/);
  assert.match(managerUi, /MAX_RETRY_HOURS = 720/);
  assert.match(managerUi, /question\.opcoes\.length > MAX_OPTIONS/);
  assert.match(managerUi, /new Set\(question\.opcoes\.map/);
  assert.match(managerQuestionEditor, /MAX_OPTIONS = 8/);
  assert.match(managerQuestionEditor, /disabled=\{question\.opcoes\.length >= MAX_OPTIONS\}/);
});

test('aluno recebe tentativa sem normalizar ou renderizar gabarito', () => {
  assert.match(studentService, /obter_avaliacao_curso_livre_aluno_secure/);
  assert.match(studentService, /iniciar_tentativa_curso_livre_secure/);
  assert.match(studentService, /entregar_tentativa_curso_livre_secure/);
  assert.match(studentService, /p_respostas: input\.respostas/);
  assert.doesNotMatch(studentService, /respostaCorreta|resposta_correta/);
  assert.doesNotMatch(studentUi, /Math\.random|sort\(.*random|gabarito/i);
  assert.match(studentService, /podeIniciar/);
  assert.match(studentService, /novaTentativaEm/);
  assert.match(studentUi, /INTERVALO_NOVA_TENTATIVA/);
  assert.match(studentUi, /workspace\.liberacao\.podeIniciar/);
  assert.match(studentUi, /query\.refetch\(\)/);
  assert.match(studentService, /status de tentativa inválido/);
  assert.doesNotMatch(studentService, /\? rawStatus : 'EM_ANDAMENTO'/);
});

test('entrega invalida somente tentativa, matrícula, catálogo e certificado relacionados', () => {
  assert.match(studentHook, /cursoLivreFinalAssessmentKeys\.detail\(workspace\.matriculaId\)/);
  assert.match(studentHook, /alunoCourseAccessKeys\.enrollments\(alunoId\)/);
  assert.match(studentHook, /alunoCourseAccessKeys\.catalog\(alunoId\)/);
  assert.match(studentHook, /\['aluno-certificados-matricula', alunoId, workspace\.matriculaId, turmaId\]/);
});

test('catálogo abre a turma Livre já vinculada antes de oferecer checkout', () => {
  assert.match(catalog, /isLive && hasLinkedLiveEnrollment\(course\)/);
  assert.match(catalog, /enrolledLiveTurmaId \?/);
  assert.match(catalog, /onOpenEnrollment\(course\.id, enrolledLiveTurmaId\)/);
  assert.match(catalog, /Matrícula já vinculada\. Abra a turma em Meus Cursos\./);
  assert.match(catalogUtils, /LIVE_LINKED_ENROLLMENT_STATUSES = new Set\(\['ATIVO', 'CONCLUIDO', 'PENDENTE'\]\)/);
  assert.match(catalogUtils, /hasLinkedLiveEnrollment[\s\S]*LIVE_LINKED_ENROLLMENT_STATUSES\.has/);
  assert.match(catalogUtils, /normalizeStatus\(modality\) === 'LIVRE'/);
  assert.match(catalogUtils, /normalized === 'ATIVO'\) return 4/);
  assert.match(catalogUtils, /EAD_ACCESS_STATUSES\.has\(normalized\)\) return 3/);
  assert.match(catalogUtils, /EAD_PENDING_STATUSES\.has\(normalized\)\) return 2/);
  assert.match(catalogHook, /getEnrollmentRank\(matricula\.status, modality\)/);
  assert.match(catalogHook, /nextIsPending = EAD_PENDING_STATUSES\.has/);
  assert.match(catalogHook, /nextEnrollmentTime > currentEnrollmentTime/);
  assert.doesNotMatch(catalogHook, /nextRank === 2/);
  assert.doesNotMatch(catalogUtils, /LIVE_LINKED_ENROLLMENT_STATUSES[^\n]*CANCELADO/);
});
