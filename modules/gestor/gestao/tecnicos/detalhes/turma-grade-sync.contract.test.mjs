import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [service, gradeHook, realtimeHook] = await Promise.all([
  readSource('./turma-grade.service.ts'),
  readSource('./hooks/useTurmaGrade.ts'),
  readSource('./hooks/useTurmaTecnicoRealtime.ts'),
]);

test('atribuição persiste somente pela RPC e usa o retorno canônico do banco', () => {
  const assignmentService = service.slice(
    service.indexOf('async assignProfessor('),
    service.indexOf('async toggleConcluida('),
  );

  assert.match(assignmentService, /\.rpc\('atribuir_docente_disciplinas_turma'/);
  assert.match(assignmentService, /p_turma_id: turmaId/);
  assert.match(assignmentService, /p_disciplina_ids: uniqueDisciplineIds/);
  assert.match(assignmentService, /p_professor_id: professor\?\.id \|\| null/);
  assert.match(assignmentService, /mapProfessorAssignmentRows\(data, uniqueDisciplineIds\)/);
  assert.doesNotMatch(assignmentService, /\.from\('turmas_disciplinas'\)/);
  assert.doesNotMatch(assignmentService, /professor_nome:\s*professor\?\.nome/);
});

test('atribuição atualiza cache imediatamente, reconcilia o retorno e restaura no erro', () => {
  const assignmentHooks = gradeHook.slice(
    gradeHook.indexOf('export const useAssignProfessorMutation'),
    gradeHook.indexOf('export const useToggleDisciplinaConcluidaMutation'),
  );

  assert.match(assignmentHooks, /onMutate: async/);
  assert.match(assignmentHooks, /cancelQueries\(\{ queryKey, exact: true \}\)/);
  assert.match(assignmentHooks, /updateProfessorOptimistically/);
  assert.match(assignmentHooks, /reconcileCanonicalProfessorAssignments/);
  assert.match(assignmentHooks, /previousGrade/);
  assert.match(assignmentHooks, /cancelLocalProfessorAssignment/);
  assert.match(assignmentHooks, /settleLocalProfessorAssignment/);
  assert.match(assignmentHooks, /changedCanonicalProfessorAssignmentIds/);
  assert.match(assignmentHooks, /refetchType: 'none'/);
  assert.doesNotMatch(assignmentHooks, /onSettled/);
});

test('Realtime ignora somente o eco local correlacionado e preserva eventos externos', () => {
  assert.match(realtimeHook, /candidate\.professorId === professorId/);
  assert.match(realtimeHook, /candidate\.disciplinaIds\.has\(disciplinaId\)/);
  assert.match(realtimeHook, /SETTLED_LOCAL_ASSIGNMENT_TTL_MS = 5_000/);
  assert.match(realtimeHook, /changedDisciplinaIds/);
  assert.match(realtimeHook, /if \(consumeLocalProfessorAssignmentEvent\([\s\S]*?\)\) \{\s*return;/);
  assert.match(realtimeHook, /academicLifecycleKeys\.grade\(turmaId\)/);
  assert.match(realtimeHook, /academicLifecycleKeys\.diarios\(turmaId\)/);
  assert.match(realtimeHook, /clearTimeout\(disciplinaRefreshTimer\)/);
  assert.match(realtimeHook, /row\?\.source_table === 'turmas_disciplinas'/);
  assert.match(realtimeHook, /scheduleGestaoRealtimeRefresh/);
  assert.match(realtimeHook, /supabase\.removeChannel\(channel\)/);
});

test('mutações de aula escrevem o retorno canônico sem iniciar refetch concorrente', () => {
  const aulaHooks = gradeHook.slice(
    gradeHook.indexOf('export const useAddTurmaAulaMutation'),
    gradeHook.indexOf('export const useAddTurmaAtividadeExtraClasseMutation'),
  ) + gradeHook.slice(
    gradeHook.indexOf('export const useUpdateTurmaAulaMutation'),
  );

  assert.match(aulaHooks, /reconcileCanonicalAula/);
  assert.match(aulaHooks, /removeCanonicalAulaFromCache/);
  assert.match(aulaHooks, /useMarkTurmaGradeDependentsStale/);
  assert.match(aulaHooks, /refetchType: 'none'|markStale/);
  assert.doesNotMatch(aulaHooks, /await invalidate\(\)/);
});

test('conclusão de disciplina invalida diretamente os cards de turma', () => {
  const completionHook = gradeHook.slice(
    gradeHook.indexOf('export const useToggleDisciplinaConcluidaMutation'),
    gradeHook.indexOf('export const useAddTurmaAulaMutation'),
  );

  assert.match(completionHook, /useTurmaGradeInvalidation\(turmaId, false, true\)/);
  assert.match(gradeHook, /gestaoQueryKeys\.classesByModality\('TECNICO'\)/);
  assert.match(completionHook, /onSuccess: invalidate/);
});
