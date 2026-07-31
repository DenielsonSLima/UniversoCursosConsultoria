import assert from "node:assert/strict";
import {
  hasTechnicalAcademicAccess,
  isPortalEnrollmentVisible,
  isResultadoConcluido,
} from "./turmas.utils.ts";
import { buildAlunoSecretariaEligibility } from "../secretaria/secretaria-aluno.rules.ts";

declare const Deno: {
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const dependencyEnrollment = {
  id: "enrollment-1",
  aluno_id: "student-1",
  turma_id: "class-1",
  status: "EM_DEPENDENCIA",
  turmas: {
    id: "class-1",
    status: "FINALIZADA",
    cursos: {
      id: "course-1",
      modalidade: "TECNICO",
    },
  },
};

Deno.test("matrícula em dependência continua visível pela turma original", () => {
  assert.equal(isPortalEnrollmentVisible(dependencyEnrollment), true);
  assert.equal(hasTechnicalAcademicAccess(dependencyEnrollment), true);
});

Deno.test("dependência não transforma turma ainda ativa em histórico liberado", () => {
  const invalidContext = {
    ...dependencyEnrollment,
    turmas: {
      ...dependencyEnrollment.turmas,
      status: "EM_ANDAMENTO",
    },
  };

  assert.equal(hasTechnicalAcademicAccess(invalidContext), false);
});

Deno.test("Secretaria mantém boletim da matrícula original em dependência", () => {
  const eligibility = buildAlunoSecretariaEligibility(
    [dependencyEnrollment] as any,
    [],
  );

  assert.equal(eligibility.canEmitBulletin, true);
  assert.equal(eligibility.bulletinEnrollment?.id, dependencyEnrollment.id);
  assert.equal(eligibility.canEmitStudentCard, false);
  assert.equal(eligibility.canRequestTransfer, false);
});

Deno.test("aprovação em dependência continua concluindo o progresso", () => {
  assert.equal(
    isResultadoConcluido({ resultado_final: "APROVADO_DEPENDENCIA" }),
    true,
  );
});
