import type { DiarioPdfGradeSnapshot } from "./diario-pdf.contract.types.ts";
import {
  asRecord,
  assertExactKeys,
  assertIsoDate,
  assertNullableGrade,
  assertNumber,
  assertText,
  assertUuid,
  fail,
  nearlyEqual,
  RESULT_VALUES,
  sameKeys,
} from "./diario-pdf.contract.validation-core.ts";

const assertStudents = (snapshot: Record<string, unknown>) => {
  if (
    !Array.isArray(snapshot.students) || snapshot.students.length === 0 ||
    snapshot.students.length > 2000
  ) {
    fail("students", "lista deve conter de 1 a 2000 alunos");
  }
  const studentIds: string[] = [];
  const studentIdSet = new Set<string>();
  const students = snapshot.students as unknown[];
  students.forEach((candidate, index) => {
    const student = asRecord(candidate, `students[${index}]`);
    assertExactKeys(
      student,
      ["id", "nome", "matricula"],
      [],
      `students[${index}]`,
    );
    assertUuid(student.id, `students[${index}].id`);
    assertText(student.nome, `students[${index}].nome`, { max: 300 });
    assertText(student.matricula, `students[${index}].matricula`, { max: 100 });
    if (studentIdSet.has(student.id as string)) {
      fail(`students[${index}].id`, "aluno duplicado");
    }
    studentIdSet.add(student.id as string);
    studentIds.push(student.id as string);
  });
  return studentIds;
};

const assertLessons = (snapshot: Record<string, unknown>) => {
  if (
    !Array.isArray(snapshot.aulas) || snapshot.aulas.length === 0 ||
    snapshot.aulas.length > 1000
  ) {
    fail("aulas", "lista deve conter de 1 a 1000 encontros");
  }
  const lessonIds: string[] = [];
  const lessonIdSet = new Set<string>();
  const lessonDateSet = new Set<string>();
  const sessionIds: string[] = [];
  const sessionIdSet = new Set<string>();
  const sessionHours = new Map<string, number>();
  const lessons = snapshot.aulas as unknown[];
  lessons.forEach((candidate, lessonIndex) => {
    const lesson = asRecord(candidate, `aulas[${lessonIndex}]`);
    assertExactKeys(
      lesson,
      ["id", "titulo", "cargaHoraria", "dataSource", "sessoes"],
      [],
      `aulas[${lessonIndex}]`,
    );
    assertUuid(lesson.id, `aulas[${lessonIndex}].id`);
    assertText(lesson.titulo, `aulas[${lessonIndex}].titulo`, { max: 2000 });
    assertNumber(
      lesson.cargaHoraria,
      `aulas[${lessonIndex}].cargaHoraria`,
      0.01,
      1000,
    );
    assertIsoDate(lesson.dataSource, `aulas[${lessonIndex}].dataSource`);
    if (lessonIdSet.has(lesson.id as string)) {
      fail(`aulas[${lessonIndex}].id`, "encontro duplicado");
    }
    if (lessonDateSet.has(lesson.dataSource as string)) {
      fail(
        `aulas[${lessonIndex}].dataSource`,
        "encontro da mesma data não foi agrupado",
      );
    }
    lessonIdSet.add(lesson.id as string);
    lessonDateSet.add(lesson.dataSource as string);
    lessonIds.push(lesson.id as string);
    if (
      !Array.isArray(lesson.sessoes) || lesson.sessoes.length === 0 ||
      lesson.sessoes.length > 8
    ) {
      fail(`aulas[${lessonIndex}].sessoes`, "deve conter de 1 a 8 sessões");
    }
    let lessonHours = 0;
    const periods = new Set<string>();
    let previousPeriodOrder = 0;
    const periodOrder: Record<string, number> = { M: 1, T: 2, N: 3, U: 4 };
    const sessions = lesson.sessoes as unknown[];
    sessions.forEach((sessionCandidate, sessionIndex) => {
      const session = asRecord(
        sessionCandidate,
        `aulas[${lessonIndex}].sessoes[${sessionIndex}]`,
      );
      assertExactKeys(
        session,
        ["id", "periodo", "cargaHoraria"],
        [],
        `aulas[${lessonIndex}].sessoes[${sessionIndex}]`,
      );
      assertUuid(
        session.id,
        `aulas[${lessonIndex}].sessoes[${sessionIndex}].id`,
      );
      if (!["M", "T", "N", "U"].includes(String(session.periodo))) {
        fail(
          `aulas[${lessonIndex}].sessoes[${sessionIndex}].periodo`,
          "período inválido",
        );
      }
      assertNumber(
        session.cargaHoraria,
        `aulas[${lessonIndex}].sessoes[${sessionIndex}].cargaHoraria`,
        0.01,
        1000,
      );
      if (sessionIdSet.has(session.id as string)) {
        fail(
          `aulas[${lessonIndex}].sessoes[${sessionIndex}].id`,
          "sessão duplicada",
        );
      }
      if (periods.has(session.periodo as string)) {
        fail(
          `aulas[${lessonIndex}].sessoes[${sessionIndex}].periodo`,
          "período duplicado no encontro",
        );
      }
      if (sessions.length > 1 && session.periodo === "U") {
        fail(
          `aulas[${lessonIndex}].sessoes`,
          "período único não pode coexistir com outras sessões",
        );
      }
      const order = periodOrder[String(session.periodo)];
      if (order < previousPeriodOrder) {
        fail(
          `aulas[${lessonIndex}].sessoes`,
          "períodos fora da ordem canônica",
        );
      }
      previousPeriodOrder = order;
      periods.add(session.periodo as string);
      sessionIdSet.add(session.id as string);
      sessionIds.push(session.id as string);
      sessionHours.set(session.id as string, session.cargaHoraria as number);
      lessonHours += session.cargaHoraria as number;
    });
    if (!nearlyEqual(lessonHours, lesson.cargaHoraria as number, 0.001)) {
      fail(`aulas[${lessonIndex}].cargaHoraria`, "diverge da soma das sessões");
    }
  });
  for (let index = 1; index < lessons.length; index += 1) {
    const previousDate = String(
      asRecord(lessons[index - 1], `aulas[${index - 1}]`).dataSource,
    );
    const currentDate = String(
      asRecord(lessons[index], `aulas[${index}]`).dataSource,
    );
    if (previousDate > currentDate) {
      fail("aulas", "encontros fora da ordem cronológica canônica");
    }
  }
  if (sessionIds.length > 5000) {
    fail("aulas.sessoes", "limite de 5000 sessões excedido");
  }
  return { lessonIds, sessionIds, sessionHours };
};

export const assertAcademicCollections = (
  snapshot: Record<string, unknown>,
  instruments: Record<string, unknown>,
  instrumentKeys: readonly ["p", "ti", "tg", "s", "cq", "o"],
) => {
  const studentIds = assertStudents(snapshot);
  const { lessonIds, sessionIds, sessionHours } = assertLessons(snapshot);
  const attendanceMap = asRecord(snapshot.attendanceMap, "attendanceMap");
  const gradesMap = asRecord(snapshot.gradesMap, "gradesMap");
  const practicesMap = asRecord(snapshot.praticasMap, "praticasMap");
  sameKeys(attendanceMap, studentIds, "attendanceMap");
  sameKeys(gradesMap, studentIds, "gradesMap");
  sameKeys(practicesMap, lessonIds, "praticasMap");
  lessonIds.forEach((lessonId) =>
    assertText(practicesMap[lessonId], `praticasMap.${lessonId}`, {
      allowEmpty: true,
      max: 10000,
    })
  );

  const gradeKeys = [
    "p",
    "ti",
    "tg",
    "s",
    "cq",
    "o",
    "rec",
    "total_aulas",
    "total_faltas",
    "frequencia_percent",
    "media_parcial",
    "media_final",
    "resultado_final",
  ] as const;
  const totalHours = [...sessionHours.values()].reduce(
    (sum, hours) => sum + hours,
    0,
  );
  studentIds.forEach((studentId) => {
    const attendance = asRecord(
      attendanceMap[studentId],
      `attendanceMap.${studentId}`,
    );
    sameKeys(attendance, sessionIds, `attendanceMap.${studentId}`);
    let absences = 0;
    let absentHours = 0;
    sessionIds.forEach((sessionId) => {
      const status = attendance[sessionId];
      if (!["P", "F", "J"].includes(String(status))) {
        fail(
          `attendanceMap.${studentId}.${sessionId}`,
          "presença fechada P, F ou J obrigatória",
        );
      }
      if (status === "F") {
        const hours = sessionHours.get(sessionId);
        if (hours === undefined) {
          fail(
            `attendanceMap.${studentId}.${sessionId}`,
            "sessão sem carga horária congelada",
          );
        }
        absences += 1;
        absentHours += hours;
      }
    });

    const grade = asRecord(gradesMap[studentId], `gradesMap.${studentId}`);
    assertExactKeys(grade, gradeKeys, [], `gradesMap.${studentId}`);
    [...instrumentKeys, "rec", "media_parcial", "media_final"].forEach((
      key,
    ) => assertNullableGrade(grade[key], `gradesMap.${studentId}.${key}`));
    assertNumber(
      grade.total_aulas,
      `gradesMap.${studentId}.total_aulas`,
      0,
      5000,
      true,
    );
    assertNumber(
      grade.total_faltas,
      `gradesMap.${studentId}.total_faltas`,
      0,
      5000,
      true,
    );
    assertNumber(
      grade.frequencia_percent,
      `gradesMap.${studentId}.frequencia_percent`,
      0,
      100,
    );
    if (grade.total_aulas !== sessionIds.length) {
      fail(
        `gradesMap.${studentId}.total_aulas`,
        "diverge das sessões congeladas",
      );
    }
    if (grade.total_faltas !== absences) {
      fail(
        `gradesMap.${studentId}.total_faltas`,
        "diverge das faltas congeladas",
      );
    }
    const expectedFrequency =
      Math.round(((totalHours - absentHours) / totalHours) * 10_000) / 100;
    if (!nearlyEqual(grade.frequencia_percent as number, expectedFrequency)) {
      fail(
        `gradesMap.${studentId}.frequencia_percent`,
        "diverge da frequência congelada",
      );
    }
    if (
      typeof grade.resultado_final !== "string" ||
      !RESULT_VALUES.has(
        grade.resultado_final as DiarioPdfGradeSnapshot["resultado_final"],
      )
    ) {
      fail(
        `gradesMap.${studentId}.resultado_final`,
        "resultado acadêmico desconhecido",
      );
    }
    assertGradeValues(studentId, grade, instruments, instrumentKeys);
  });

  return totalHours;
};

const assertGradeValues = (
  studentId: string,
  grade: Record<string, unknown>,
  instruments: Record<string, unknown>,
  instrumentKeys: readonly ["p", "ti", "tg", "s", "cq", "o"],
) => {
  if (grade.resultado_final !== "APROVEITADO") {
    instrumentKeys.forEach((key) => {
      if (instruments[key] === true && grade[key] === null) {
        fail(
          `gradesMap.${studentId}.${key}`,
          "nota ativa ausente no snapshot fechado",
        );
      }
      if (instruments[key] === false && grade[key] !== null) {
        fail(
          `gradesMap.${studentId}.${key}`,
          "nota inativa presente no snapshot fechado",
        );
      }
    });
    const expectedPartial = Math.min(
      10,
      Math.round(
        instrumentKeys.reduce(
          (sum, key) =>
            sum + (instruments[key] === true ? Number(grade[key]) : 0),
          0,
        ) * 10,
      ) / 10,
    );
    if (
      typeof grade.media_parcial !== "number" ||
      !nearlyEqual(grade.media_parcial, expectedPartial, 0.001)
    ) {
      fail(
        `gradesMap.${studentId}.media_parcial`,
        "diverge das notas ativas congeladas",
      );
    }
    const expectedFinal =
      typeof grade.rec === "number" && grade.rec > expectedPartial
        ? grade.rec
        : expectedPartial;
    if (
      typeof grade.media_final !== "number" ||
      !nearlyEqual(grade.media_final, expectedFinal, 0.001)
    ) {
      fail(
        `gradesMap.${studentId}.media_final`,
        "diverge da média parcial e recuperação",
      );
    }
    if (
      ["SEM_LANCAMENTO", "FREQUENCIA_PENDENTE"].includes(
        String(grade.resultado_final),
      )
    ) {
      fail(
        `gradesMap.${studentId}.resultado_final`,
        "estado pendente incompatível com snapshot fechado",
      );
    }
    if (grade.resultado_final === "EM_RECUPERACAO" && grade.rec !== null) {
      fail(
        `gradesMap.${studentId}.resultado_final`,
        "recuperação já lançada não pode permanecer pendente",
      );
    }
    if (grade.resultado_final === "REPROVADO" && grade.rec === null) {
      fail(
        `gradesMap.${studentId}.resultado_final`,
        "reprovação por nota exige recuperação lançada",
      );
    }
    return;
  }

  const partial = grade.media_parcial;
  const final = grade.media_final;
  if (typeof partial !== "number" || typeof final !== "number") {
    fail(
      `gradesMap.${studentId}`,
      "aproveitamento exige médias acadêmicas congeladas",
    );
  }
  const expectedFinal = typeof grade.rec === "number" && grade.rec > partial
    ? grade.rec
    : partial;
  if (!nearlyEqual(final, expectedFinal, 0.001)) {
    fail(
      `gradesMap.${studentId}.media_final`,
      "diverge do aproveitamento congelado",
    );
  }
};
