import { formatMatricula } from '../../../../lib/academicUtils';
import type { AcademicosConfigData } from '../../configuracoes/academicos/academicos.service';

type EnrollmentPolo = { polo_id?: string | null };

export interface AcademicEnrollmentIdentity {
  id: string;
  status?: string | null;
  data_matricula?: string | null;
  dataMatricula?: string | null;
  polo_id?: string | null;
  poloId?: string | null;
  turmas?: EnrollmentPolo | EnrollmentPolo[] | null;
}

const enrollmentDate = (enrollment: AcademicEnrollmentIdentity) =>
  enrollment.data_matricula || enrollment.dataMatricula || '';

const enrollmentTimestamp = (enrollment: AcademicEnrollmentIdentity) => {
  const timestamp = Date.parse(enrollmentDate(enrollment));
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const comparePrimaryEnrollments = (
  left: AcademicEnrollmentIdentity,
  right: AcademicEnrollmentIdentity,
) => {
  const priority = (row: AcademicEnrollmentIdentity) =>
    String(row.status || '').toUpperCase() === 'ATIVO' ? 0 : 1;
  const statusDifference = priority(left) - priority(right);
  if (statusDifference !== 0) return statusDifference;
  const leftTimestamp = enrollmentTimestamp(left);
  const rightTimestamp = enrollmentTimestamp(right);
  if (leftTimestamp === null && rightTimestamp !== null) return 1;
  if (rightTimestamp === null && leftTimestamp !== null) return -1;
  return (rightTimestamp ?? 0) - (leftTimestamp ?? 0) || left.id.localeCompare(right.id);
};

export const selectPrimaryEnrollment = <T extends AcademicEnrollmentIdentity>(
  enrollments: readonly T[],
): T | null => [...enrollments]
  .filter((enrollment) => Boolean(enrollment.id))
  .sort(comparePrimaryEnrollments)[0] || null;

export const formatAcademicEnrollment = (
  enrollment: AcademicEnrollmentIdentity | null | undefined,
  config: AcademicosConfigData,
): string | null => {
  if (!enrollment?.id) return null;
  const turma = Array.isArray(enrollment.turmas) ? enrollment.turmas[0] : enrollment.turmas;
  return formatMatricula(
    enrollment.id,
    enrollmentDate(enrollment) || undefined,
    turma?.polo_id || enrollment.polo_id || enrollment.poloId || undefined,
    config,
  );
};
