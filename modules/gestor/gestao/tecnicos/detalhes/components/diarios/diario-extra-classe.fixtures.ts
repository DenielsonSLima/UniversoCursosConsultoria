import { createSnapshot, IDS } from './diario-pdf-server-boundary.fixtures.ts';

export const EXTRA_IDS = {
  activity: '00000000-0000-4000-8000-000000000101',
  excludedStudent: '00000000-0000-4000-8000-000000000102',
  afternoon: '00000000-0000-4000-8000-000000000103',
} as const;

/** 4/8 horas de aula + 8 extras = 12/16 = 75%; vínculo excluído fica 4/8 = 50%. */
export const createExtraClassSnapshot = () => {
  const snapshot = createSnapshot();
  snapshot.disciplina.cargaHoraria = 16;
  snapshot.closure.hoursCompleted = 16;
  snapshot.closure.requiredHours = 16;
  snapshot.aulas[0].cargaHoraria = 8;
  snapshot.aulas[0].sessoes = [
    { id: IDS.session, periodo: 'M', cargaHoraria: 4 },
    { id: EXTRA_IDS.afternoon, periodo: 'T', cargaHoraria: 4 },
  ];
  snapshot.students.push({
    id: EXTRA_IDS.excludedStudent, nome: 'Aluno sintético sem crédito extra', matricula: 'QA-EX-002',
  });
  snapshot.extraClassCredit = {
    schemaVersion: 1,
    activities: [{
      id: EXTRA_IDS.activity, titulo: 'Atividade domiciliar sintética',
      cargaHoraria: 8, dataSource: '2026-08-19',
    }],
    eligibleActivityIdsByStudent: {
      [IDS.student]: [EXTRA_IDS.activity],
      [EXTRA_IDS.excludedStudent]: [],
    },
  };
  snapshot.students.forEach((student) => {
    snapshot.attendanceMap[student.id] = { [IDS.session]: 'F', [EXTRA_IDS.afternoon]: 'P' };
    snapshot.gradesMap[student.id] = {
      ...snapshot.gradesMap[IDS.student], total_aulas: 2, total_faltas: 1,
      frequencia_percent: student.id === IDS.student ? 75 : 50,
      resultado_final: student.id === IDS.student ? 'APROVADO' : 'REPROVADO_FREQUENCIA',
    };
  });
  return snapshot;
};

export const createLinkedExtraClassSnapshot = () => {
  const snapshot = createExtraClassSnapshot();
  const secondLesson = '00000000-0000-4000-8000-000000000104';
  const secondSession = '00000000-0000-4000-8000-000000000105';
  snapshot.aulas[0].titulo = 'Primeira aula sintética';
  snapshot.aulas.push({ id: secondLesson, titulo: 'Segunda aula sintética', dataSource: '2026-08-20',
    cargaHoraria: 4, sessoes: [{ id: secondSession, periodo: 'U', cargaHoraria: 4 }],
  });
  snapshot.extraClassCredit!.activities[0].aulaOrigemId = EXTRA_IDS.afternoon;
  snapshot.extraClassCredit!.contentOrder = [
    { tipo: 'AULA', id: IDS.session },
    { tipo: 'EXTRA_CLASSE', id: EXTRA_IDS.activity },
    { tipo: 'AULA', id: secondSession },
  ];
  snapshot.praticasMap[secondLesson] = 'Prática da segunda aula';
  snapshot.generatedAt = snapshot.closure.snapshotAt = '2026-08-21T12:00:00Z';
  snapshot.disciplina.cargaHoraria = snapshot.closure.hoursCompleted = snapshot.closure.requiredHours = 20;
  snapshot.students.forEach((student) => {
    snapshot.attendanceMap[student.id][secondSession] = 'P';
    snapshot.gradesMap[student.id].total_aulas = 3;
    snapshot.gradesMap[student.id].frequencia_percent = student.id === IDS.student ? 80 : 66.67;
  });
  return snapshot;
};
