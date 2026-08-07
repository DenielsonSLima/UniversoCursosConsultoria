import assert from "node:assert/strict";
import {
  buildDisciplineSummaries,
  hasTechnicalAcademicAccess,
  isPortalEnrollmentVisible,
  isResultadoConcluido,
  sortCurriculumDisciplines,
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

Deno.test("matrícula técnica pendente aparece sem liberar conteúdo acadêmico", () => {
  const pendingEnrollment = {
    ...dependencyEnrollment,
    status: "PENDENTE",
    turmas: {
      ...dependencyEnrollment.turmas,
      status: "EM_ANDAMENTO",
    },
  };

  assert.equal(isPortalEnrollmentVisible(pendingEnrollment), true);
  assert.equal(hasTechnicalAcademicAccess(pendingEnrollment), false);
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

Deno.test("disciplinas seguem módulo e ordem oficial da grade", () => {
  const ordered = sortCurriculumDisciplines([
    { id: "3", disciplinas: { id: "d3", nome: "Terceira", ordem: 2, modulo: { id: "m2", ordem: 2 } }, periodo_letivo: { ordem: 1 } },
    { id: "2", disciplinas: { id: "d2", nome: "Segunda", ordem: 2, modulo: { id: "m1", ordem: 1 } }, periodo_letivo: { ordem: 2 } },
    { id: "1", disciplinas: { id: "d1", nome: "Primeira", ordem: 1, modulo: { id: "m1", ordem: 1 } }, periodo_letivo: { ordem: 2 } },
  ]);

  assert.deepEqual(ordered.map((item) => item.id), ["1", "2", "3"]);
});

Deno.test("falta justificada não reduz a frequência calculada", () => {
  const summaries = buildDisciplineSummaries(
    [{ id: "offer-1", disciplinas: { id: "discipline-1", nome: "Disciplina" } }],
    new Map(),
    new Map([["discipline-1", { presentes: 1, faltas: 0, total: 2 }]]),
  );

  assert.equal(summaries[0]?.frequency, 100);
});
