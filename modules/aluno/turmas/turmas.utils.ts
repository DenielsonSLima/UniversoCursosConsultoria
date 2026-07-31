import type {
  DisciplinaResumoAluno,
  MatriculaAluno,
  ResultadoDiarioAluno,
  TurmaDisciplinaAluno,
} from './turmas.types';

export const ACCESS_STATUS = new Set(['ATIVO', 'CONCLUIDO']);
export const MODALITY_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'EAD', label: 'EAD' },
  { id: 'TECNICO', label: 'Técnicos' },
  { id: 'LIVRE', label: 'Livres' },
  { id: 'ESPECIALIZACAO', label: 'Especializações' },
];
export const MODALITY_ORDER = ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS'];
export const MODALITY_LABELS: Record<string, string> = {
  EAD: 'Cursos EAD',
  TECNICO: 'Cursos Técnicos',
  LIVRE: 'Cursos Livres',
  ESPECIALIZACAO: 'Especializações',
  OUTROS: 'Outros cursos',
};

export const formatDate = (value?: string | null) => {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleDateString('pt-BR');
};

export const formatNumeric = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '--';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '--';
  return parsed.toFixed(2).replace('.00', '');
};

export const getFormattedDuration = (min?: number) => {
  if (!min) return '';
  if (min % 60 === 0) return `${min / 60}h`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return hrs > 0 ? `${hrs}h ${rem}min` : `${rem}min`;
};

export const normalizePercent = (value: unknown) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

export const getProgressPercent = (progress?: Record<string, any> | null) =>
  normalizePercent(progress?.summary?.progressPercent ?? progress?.progressPercent ?? 0);

export const getQuizScore = (progress?: Record<string, any> | null) => {
  const score = progress?.summary?.quizScore ?? progress?.quizScore;
  return score === null || score === undefined ? null : Number(score);
};

export const getEadConteudos = (curso?: Record<string, any> | null) => {
  const conteudos = curso?.ead_config?.conteudos;
  return Array.isArray(conteudos) ? conteudos : [];
};

export const isEadMatricula = (matricula?: MatriculaAluno | null) =>
  String(matricula?.turmas?.cursos?.modalidade || '').toUpperCase() === 'EAD';

export const hasEadAccess = (matricula?: MatriculaAluno | null) =>
  ACCESS_STATUS.has(String(matricula?.status || '').toUpperCase());

export const normalizeText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const sanitizeCourseId = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
  return normalized;
};

export const getMatriculaModalidade = (matricula?: MatriculaAluno | null) => {
  const modalidade = String(matricula?.turmas?.cursos?.modalidade || '').toUpperCase();
  if (modalidade === 'EAD') return 'EAD';
  if (modalidade === 'TECNICO' || modalidade === 'TÉCNICO') return 'TECNICO';
  if (modalidade === 'LIVRE') return 'LIVRE';
  if (modalidade === 'ESPECIALIZACAO' || modalidade === 'ESPECIALIZAÇÃO') return 'ESPECIALIZACAO';
  return 'OUTROS';
};

export const isPortalEnrollmentVisible = (matricula?: MatriculaAluno | null) => {
  const status = String(matricula?.status || '').toUpperCase();
  return ACCESS_STATUS.has(status)
    || (
      getMatriculaModalidade(matricula) === 'TECNICO'
      && (status === 'REPROVADO' || status === 'EM_DEPENDENCIA')
    );
};

export const hasTechnicalAcademicAccess = (matricula?: MatriculaAluno | null) => {
  if (getMatriculaModalidade(matricula) !== 'TECNICO') return true;
  const enrollmentStatus = String(matricula?.status || '').toUpperCase();
  const classStatus = String(matricula?.turmas?.status || '').toUpperCase();
  return (classStatus === 'EM_ANDAMENTO' && enrollmentStatus === 'ATIVO')
    || (
      classStatus === 'FINALIZADA'
      && (
        enrollmentStatus === 'CONCLUIDO'
        || enrollmentStatus === 'REPROVADO'
        || enrollmentStatus === 'EM_DEPENDENCIA'
      )
    );
};

export const asNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isResultadoConcluido = (resultado?: ResultadoDiarioAluno | null) => {
  const status = String(resultado?.resultado_final || '').toUpperCase();
  return status === 'APROVADO'
    || status === 'APROVADO_DEPENDENCIA'
    || status === 'APROVEITADO';
};

export const calculateAcademicProgress = (
  disciplines: TurmaDisciplinaAluno[],
  resultsByDiscipline: Map<string, ResultadoDiarioAluno>,
) => {
  if (disciplines.length === 0) return 0;

  let totalWeight = 0;
  let completedWeight = 0;

  disciplines.forEach((item) => {
    const disciplinaId = item.disciplinas?.id || item.disciplina_id;
    const workload = Math.max(0, Number(item.disciplinas?.carga_horaria || 0));
    const weight = workload > 0 ? workload : 1;
    totalWeight += weight;

    const result = disciplinaId ? resultsByDiscipline.get(disciplinaId) : null;
    if (isResultadoConcluido(result)) completedWeight += weight;
  });

  return totalWeight > 0 ? normalizePercent((completedWeight / totalWeight) * 100) : 0;
};

export const buildDisciplineSummaries = (
  disciplines: TurmaDisciplinaAluno[],
  resultsByDiscipline: Map<string, ResultadoDiarioAluno>,
  attendanceByDiscipline: Map<string, { presentes: number; faltas: number; total: number }>,
): DisciplinaResumoAluno[] => disciplines.flatMap((disciplina) => {
  const id = disciplina.disciplinas?.id || disciplina.disciplina_id;
  if (!id) return [];
  const result = resultsByDiscipline.get(id) || null;
  const attendance = attendanceByDiscipline.get(id) || { presentes: 0, faltas: 0, total: 0 };
  const rpcFrequency = asNullableNumber(result?.frequencia_percent);
  const calculatedFrequency = attendance.total > 0
    ? Math.round((attendance.presentes / attendance.total) * 100)
    : null;

  return [{
    id,
    nome: disciplina.disciplinas?.nome || 'Disciplina',
    cargaHoraria: Number(disciplina.disciplinas?.carga_horaria || 0),
    professor: disciplina.professor_nome || 'A definir',
    concluida: isResultadoConcluido(result),
    notas: result,
    attendance,
    frequency: rpcFrequency ?? calculatedFrequency,
  }];
});
