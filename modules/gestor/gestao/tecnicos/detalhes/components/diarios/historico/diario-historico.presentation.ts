import type { DiarioHistorico, HistoricalField } from './diario-historico.types';
import { academicLifecycleKeys } from '../../../academic-lifecycle.keys';

export const historicalDiaryCardsKey = (
  turmaId: string, actorId: string, contextId: string, poloId: string,
) => [...academicLifecycleKeys.diarios(turmaId), 'canonical-cards-historical-v5',
  'GESTOR', actorId, contextId, poloId] as const;

export const historicalDiaryKey = (
  turmaId: string, disciplinaId: string, accessMode: string, contextId: string, poloId: string,
) => ['diario-historico-importado', turmaId, disciplinaId, accessMode, contextId, poloId] as const;

export const historicalNumber = (value: unknown): string => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    : '—'
);

export const historicalDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

export const historicalFieldNeedsReview = (field?: HistoricalField, state?: string): boolean => (
  state === 'EM_CONFERENCIA' || state === 'REVIEW'
    || field?.review?.state === 'EM_CONFERENCIA' || field?.review?.state === 'REVIEW'
);

export const historicalFieldText = (field?: HistoricalField): string => {
  const raw = field?.raw;
  if (typeof raw === 'string' && raw.trim() && !/^[-–—]+$/.test(raw.trim())) return raw.trim();
  if (typeof raw === 'number') return historicalNumber(raw);
  if (typeof field?.value === 'number') return historicalNumber(field.value);
  if (typeof field?.value === 'string' && field.value.trim()) return field.value.trim();
  return '—';
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const validSources = (value: unknown): boolean => value == null || (
  Array.isArray(value) && value.every((source) => isRecord(source)
    && (source.locator == null || typeof source.locator === 'string')
    && (source.part == null || typeof source.part === 'string'))
);
const validField = (value: unknown): boolean => value == null || (
  isRecord(value) && validSources(value.sourceRefs)
);
const validResults = (value: unknown): boolean => value === null || (
  isRecord(value) && Object.values(value).every(validField)
);
const validGrades = (value: unknown): boolean => Array.isArray(value)
  && value.every((grade) => isRecord(grade) && validField(grade.category) && validField(grade.value));

// A malformed response is an error, never evidence that no history exists.
export const parseDiarioHistorico = (value: unknown): DiarioHistorico | null => {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Histórico do diário indisponível.');
  }
  const result = value as Partial<DiarioHistorico>;
  if (result.readOnly !== true || typeof result.id !== 'string'
    || !Array.isArray(result.lessons) || !Array.isArray(result.students)
    || !Array.isArray(result.unresolvedStudents) || !Array.isArray(result.issues)) {
    throw new Error('A consulta retornou um histórico incompleto.');
  }
  if (!result.lessons.every((lesson) => lesson && typeof lesson.id === 'string')
    || !result.students.every((student) => student && typeof student.name === 'string'
      && typeof student.matriculaId === 'string' && (student.grades === null || validGrades(student.grades))
      && Array.isArray(student.attendance) && student.attendance.every((entry) => entry
        && typeof entry.lessonId === 'string' && (entry.status == null || typeof entry.status === 'string')
        && validField(entry.source))
      && validResults(student.reportedResults)
      && (student.reportedAttendanceTotals == null || (Array.isArray(student.reportedAttendanceTotals)
        && student.reportedAttendanceTotals.every(validField)))
      && (student.gradeRows == null || (Array.isArray(student.gradeRows)
        && student.gradeRows.every((row) => row && validGrades(row.grades)
          && (row.reportedResults == null || validResults(row.reportedResults))))))
    || !result.unresolvedStudents.every((student) => student && Array.isArray(student.sourceNames)
      && student.sourceNames.every(validField))
    || !result.issues.every((issue) => isRecord(issue) && validSources(issue.sourceRefs)
      && (issue.message == null || typeof issue.message === 'string')
      && (issue.code == null || typeof issue.code === 'string'))
    || !result.lessons.every((lesson) => [lesson.dateField, lesson.hoursField, lesson.contentField,
      lesson.practiceField].every(validField)
      && (lesson.content == null || typeof lesson.content === 'string')
      && (lesson.practice == null || typeof lesson.practice === 'string'))
    || (result.metadata != null && (!isRecord(result.metadata)
      || !['closure', 'submission', 'assessmentLegend', 'observations'].every((key) => {
        const fields = result.metadata?.[key as keyof NonNullable<DiarioHistorico['metadata']>];
        return fields == null || (Array.isArray(fields) && fields.every(validField));
      })))
    || !['studentsCount', 'unresolvedCount', 'lessonsCount', 'attendanceCount', 'gradesConfirmed']
      .every((key) => typeof result[key as keyof DiarioHistorico] === 'number'
        && Number.isFinite(result[key as keyof DiarioHistorico]))) {
    throw new Error('A consulta retornou registros históricos incompletos.');
  }
  return result as DiarioHistorico;
};
