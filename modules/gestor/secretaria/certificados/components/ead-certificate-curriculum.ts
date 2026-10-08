import type { CertificadoAcademico, EadCertificateCurriculum, EadCertificateCurriculumTable } from '../certificados.types';

export const MISSING_EAD_CURRICULUM = 'Conteúdo programático indisponível para este certificado.';
export const MISSING_EAD_CURRICULUM_TABLE = 'Tabela do conteúdo programático indisponível para este certificado.';

export const getEadCertificateCurriculumTable = (
  certificate: CertificadoAcademico | null | undefined,
  emissionSnapshot?: unknown,
): EadCertificateCurriculumTable | null => {
  if (certificate?.modalidade !== 'EAD') return null;
  const value = (emissionSnapshot === undefined
    ? certificate.metadados?.eadCurriculumTable : emissionSnapshot) as EadCertificateCurriculumTable | null;
  if (!value || value.version !== 2) return null;
  const validRows = (rows: unknown): boolean => Array.isArray(rows) && rows.length > 0
    && rows.every(row => row && typeof row.nome === 'string' && row.nome.trim()
      && typeof row.carga === 'string' && typeof row.status === 'string');
  if (!validRows(value.rows) || !Array.isArray(value.pages) || !value.pages.length
    || value.pages.some((page, index) => !page || page.number !== index + 1 || !validRows(page.rows))) return null;
  return value;
};

// Validate the server contract without rebuilding titles, ordering, hours or pagination.
export const getEadCertificateCurriculum = (
  certificate: CertificadoAcademico | null | undefined,
  emissionSnapshot?: unknown,
): EadCertificateCurriculum | null => {
  if (certificate?.modalidade !== 'EAD') return null;
  const snapshot = emissionSnapshot === undefined
    ? certificate.metadados?.eadCurriculum
    : emissionSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const value = snapshot as EadCertificateCurriculum;
  if (value.version !== 1 || !['cronograma', 'conteudos'].includes(value.source)) return null;
  if (!Array.isArray(value.items) || !value.items.length
    || value.items.some(item => !item || typeof item.title !== 'string' || !item.title.trim())) return null;
  if (value.totalHours !== null && (typeof value.totalHours !== 'number'
    || !Number.isFinite(value.totalHours) || value.totalHours <= 0)) return null;
  if (!Array.isArray(value.pages) || !value.pages.length
    || value.pages.some((page, index) => !page || page.number !== index + 1
      || !Array.isArray(page.lines) || !page.lines.length
      || page.lines.some(line => typeof line !== 'string' || !line.trim()))) return null;
  return value;
};

export const getCertificateCurriculumText = (
  certificate: CertificadoAcademico,
  legacyText?: string,
  emissionSnapshot?: unknown,
): string => {
  if (certificate.modalidade !== 'EAD') {
    return legacyText || 'Grade curricular conforme histórico acadêmico do aluno.';
  }
  const curriculum = getEadCertificateCurriculum(certificate, emissionSnapshot);
  return curriculum?.pages.flatMap(page => page.lines).join('\n') || MISSING_EAD_CURRICULUM;
};

export const escapeCurriculumHtml = (text: string): string => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export const curriculumTextToHtml = (text: string): string =>
  escapeCurriculumHtml(text).replace(/\n/g, '<br />');

