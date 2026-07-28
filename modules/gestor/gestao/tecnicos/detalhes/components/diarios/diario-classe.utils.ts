import { DiarioAula, DiarioStudent } from './diario-classe.service';
import { AttendanceMap, DiarioGradeResult, DiarioStudentStats, GradesMap } from './diario-classe.types';

const emptyGrade = (totalAulas: number): DiarioGradeResult => ({
  p: null,
  ti: null,
  tg: null,
  s: null,
  cq: null,
  o: null,
  rec: null,
  total_aulas: totalAulas,
  total_faltas: 0,
  frequencia_percent: null,
  media_parcial: null,
  media_final: null,
  resultado_final: 'SEM_LANCAMENTO',
});

export const buildAttendanceMap = (
  students: DiarioStudent[],
  aulas: DiarioAula[],
  dbAttendance: any[],
): AttendanceMap => {
  const map: AttendanceMap = {};
  students.forEach((student) => {
    map[student.id] = {};
    aulas.forEach((aula) => {
      aula.sessoes.forEach((sessao) => {
        map[student.id][sessao.id] = null;
      });
    });
  });
  dbAttendance.forEach((frequency) => {
    if (map[frequency.aluno_id]) {
      map[frequency.aluno_id][frequency.aula_id] = frequency.status as 'P' | 'F' | 'J';
    }
  });
  return map;
};

export const buildGradesMap = (
  students: DiarioStudent[],
  aulas: DiarioAula[],
  dbGrades: any[],
): GradesMap => {
  const map: GradesMap = {};
  const totalSessoes = aulas.reduce((total, aula) => total + aula.sessoes.length, 0);
  students.forEach((student) => {
    map[student.id] = emptyGrade(totalSessoes);
  });
  dbGrades.forEach((grade) => {
    if (!map[grade.aluno_id]) return;
    map[grade.aluno_id] = {
      p: grade.nota_p === null ? null : parseFloat(grade.nota_p),
      ti: grade.nota_ti === null ? null : parseFloat(grade.nota_ti),
      tg: grade.nota_tg === null ? null : parseFloat(grade.nota_tg),
      s: grade.nota_s === null ? null : parseFloat(grade.nota_s),
      cq: grade.nota_cq === null ? null : parseFloat(grade.nota_cq),
      o: grade.nota_o === null ? null : parseFloat(grade.nota_o),
      rec: grade.nota_rec !== null ? parseFloat(grade.nota_rec) : null,
      total_aulas: parseInt(grade.total_aulas || 0),
      total_faltas: parseInt(grade.total_faltas || 0),
      frequencia_percent: grade.frequencia_percent === null ? null : parseFloat(grade.frequencia_percent),
      media_parcial: grade.media_parcial === null ? null : parseFloat(grade.media_parcial),
      media_final: grade.media_final === null ? null : parseFloat(grade.media_final),
      resultado_final: grade.resultado_final || 'SEM_LANCAMENTO',
    };
  });
  return map;
};

export const buildPraticasMap = (aulas: DiarioAula[], dbPraticas: any[]): Record<string, string> => {
  const map: Record<string, string> = {};
  const encontroPorSessao = new Map<string, string>();
  aulas.forEach((aula) => {
    map[aula.id] = 'Aula expositiva / Prática padrão';
    aula.sessoes.forEach((sessao) => encontroPorSessao.set(sessao.id, aula.id));
  });
  dbPraticas.forEach((practice) => {
    const encontroId = encontroPorSessao.get(practice.aula_id);
    if (encontroId) map[encontroId] = practice.pratica_pedagogica;
  });
  return map;
};

export const getStudentStats = (
  gradesMap: GradesMap,
  studentId: string,
): DiarioStudentStats => {
  const grade = gradesMap[studentId] || emptyGrade(0);

  return {
    faltas: grade.total_faltas,
    frequencia: grade.frequencia_percent,
    mediaParcial: grade.media_parcial,
    mediaFinal: grade.media_final,
    resultado: grade.resultado_final || 'SEM_LANCAMENTO',
  };
};

export const getDiarioFileName = (turma: any, disciplina: any) =>
  `diario-${turma.codigo || turma.nome || 'turma'}-${disciplina.nome}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .toLowerCase();
