import assert from 'node:assert/strict';
import {
  alunoCourseAccessKeys,
  alunoCourseAccessQueryKeys,
  invalidateAlunoCourseAccessQueries,
} from './aluno-course-access.queries.ts';

Deno.test('centraliza todas as consultas afetadas pela liberação de curso', () => {
  const alunoId = 'student-1';
  const keys = alunoCourseAccessQueryKeys(alunoId);

  assert.equal(keys.length, 9);
  assert.deepEqual(keys[0], alunoCourseAccessKeys.catalog(alunoId));
  assert.deepEqual(keys[2], alunoCourseAccessKeys.enrollments(alunoId));
  assert.deepEqual(keys[4], alunoCourseAccessKeys.homeEnrollments(alunoId));
  assert.deepEqual(keys[6], alunoCourseAccessKeys.libraryEnrollments(alunoId));
  assert.deepEqual(keys[8], alunoCourseAccessKeys.calendarEligibility(alunoId));
});

Deno.test('invalida somente chaves exatas e ativas do aluno afetado', () => {
  const calls: Array<Record<string, unknown>> = [];
  const queryClient = {
    invalidateQueries(options: Record<string, unknown>) {
      calls.push(options);
      return Promise.resolve();
    },
  };

  invalidateAlunoCourseAccessQueries(queryClient as any, 'student-1');

  assert.equal(calls.length, 9);
  assert.equal(calls.every((call) => call.exact === true), true);
  assert.equal(
    calls.every((call) => call.refetchType === 'active'),
    true,
  );
  assert.equal(
    calls.every((call) =>
      JSON.stringify(call.queryKey).includes('student-1')
    ),
    true,
  );
});
