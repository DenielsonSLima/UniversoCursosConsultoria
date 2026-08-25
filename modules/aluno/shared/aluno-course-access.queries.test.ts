import assert from "node:assert/strict";
import {
  alunoCourseAccessKeys,
  alunoCourseAccessQueryKeys,
  invalidateAlunoCourseAccessQueries,
} from "./aluno-course-access.queries.ts";

declare const Deno: {
  test(name: string, testFunction: () => void | Promise<void>): void;
};

Deno.test("centraliza todas as consultas afetadas pela liberação de curso", () => {
  const alunoId = "student-1";
  const keys = alunoCourseAccessQueryKeys(alunoId);

  assert.equal(keys.length, 9);
  assert.deepEqual(keys[0], alunoCourseAccessKeys.catalog(alunoId));
  assert.deepEqual(keys[2], alunoCourseAccessKeys.enrollments(alunoId));
  assert.deepEqual(keys[4], alunoCourseAccessKeys.homeEnrollments(alunoId));
  assert.deepEqual(keys[6], alunoCourseAccessKeys.libraryEnrollments(alunoId));
  assert.deepEqual(keys[8], alunoCourseAccessKeys.calendarEligibility(alunoId));
});

Deno.test("invalida chaves exatas e raízes acadêmicas ativas do aluno", () => {
  const calls: Array<Record<string, unknown>> = [];
  const queryClient = {
    invalidateQueries(options: Record<string, unknown>) {
      calls.push(options);
      return Promise.resolve();
    },
  };

  invalidateAlunoCourseAccessQueries(queryClient as any, "student-1");

  assert.equal(calls.length, 13);
  assert.equal(calls.filter((call) => call.exact === true).length, 8);
  assert.equal(calls.filter((call) => call.exact === false).length, 5);
  assert.equal(
    calls.every((call) => call.refetchType === "active"),
    true,
  );
  assert.equal(
    calls.every((call) => JSON.stringify(call.queryKey).includes("student-1")),
    true,
  );
  assert.deepEqual(
    calls.filter((call) => call.exact === false).map((call) => call.queryKey),
    [
      alunoCourseAccessKeys.finance("student-1"),
      alunoCourseAccessKeys.eadProgressRoot("student-1"),
      alunoCourseAccessKeys.technicalAcademicRoot("student-1"),
      alunoCourseAccessKeys.bulletinModulesRoot("student-1"),
      alunoCourseAccessKeys.bulletinResultsRoot("student-1"),
    ],
  );
});
