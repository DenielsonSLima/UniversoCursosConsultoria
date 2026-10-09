import { buildStudentCardPdf } from '../../shared/pdf/student-card';
import { downloadPdfBlob } from '../../shared/pdf/download-pdf-blob';

const source = (containerId: string) => {
  const root = document.getElementById(containerId);
  if (!root) throw new Error('Prévia da carteirinha não encontrada.');
  return root;
};

/** Compatibility adapter; the portal retains each returned Blob before showing actions. */
export const createStudentCardPrintPdfBlob = (containerId: string) =>
  buildStudentCardPdf(source(containerId), 'a4');

export const createStudentCardPdfBlob = (containerId: string) =>
  buildStudentCardPdf(source(containerId), 'digital');

export const downloadStudentCardPdf = async (containerId: string, studentName?: string | null) => {
  const name = String(studentName || 'aluno').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  downloadPdfBlob(await createStudentCardPdfBlob(containerId), `carteirinha-estudantil-${name}.pdf`);
};
