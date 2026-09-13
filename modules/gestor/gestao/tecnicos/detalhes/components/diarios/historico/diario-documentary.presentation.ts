import type { AttendanceMap } from '../diario-classe.types.ts';
import type { DiarioHistorico, HistoricalField, HistoricalGradeRow } from './diario-historico.types.ts';

export interface DocumentaryAttendance {
  raw: string;
  canonical: string | null;
}

// Preserve literal documentary markers, including '-' and empty cells.
export const documentaryRawText = (field?: HistoricalField): string => {
  if (typeof field?.raw === 'string') return field.raw.trim();
  const value = field?.raw ?? field?.value;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return typeof value === 'string' ? value.trim() : '—';
};

export const documentaryGradeText = (rows?: HistoricalGradeRow[] | null): string => (
  rows?.map((row) => row.grades.map((grade) =>
    `${documentaryRawText(grade.category) || '—'}: ${documentaryRawText(grade.value) || '—'}`,
  ).join(' | ')).join('\n') || '—'
);

export const buildDocumentaryEvidence = (history: DiarioHistorico) => {
  const lessonIds = new Map(history.lessons.map((lesson) => [lesson.id, lesson.operationalLessonId]));
  const students = Object.fromEntries(history.students.map((student) => [student.id, student]));
  const attendance: Record<string, Record<string, DocumentaryAttendance>> = {};
  for (const student of history.students) {
    attendance[student.id] = {};
    for (const entry of student.attendance) {
      const lessonId = lessonIds.get(entry.lessonId);
      if (lessonId) attendance[student.id][lessonId] = {
        raw: documentaryRawText(entry.source), canonical: entry.status,
      };
    }
  }
  return { history, students, attendance };
};

// A later canonical edit is displayed normally; documentary source remains traceable.
export const documentaryAttendanceText = (
  source: DocumentaryAttendance | undefined, current: string | null,
): string | undefined => source && current === source.canonical ? source.raw : undefined;

export const buildDocumentaryAttendanceMap = (
  evidence: ReturnType<typeof buildDocumentaryEvidence>, current: AttendanceMap,
) => Object.fromEntries(Object.entries(evidence.attendance).map(([studentId, entries]) => [
  studentId, Object.fromEntries(Object.entries(entries).flatMap(([lessonId, source]) => {
    const value = documentaryAttendanceText(source, current[studentId]?.[lessonId] ?? null);
    return value === undefined ? [] : [[lessonId, value]];
  })),
]));
