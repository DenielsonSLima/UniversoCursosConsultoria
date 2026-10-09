import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { assertPdfBlobReady, printPdfBlob } from '../shared/pdf-blob-print';

/** A página A4 já montada é a fonte; não se recalculam dados nem paginação. */
export const createCarteirinhasPdf = async (
  container: HTMLElement,
  signal?: AbortSignal,
): Promise<Blob> => {
  const { buildStudentCardSheetPdf } = await import('../../../shared/pdf/student-card');
  const blob = await buildStudentCardSheetPdf(container, { signal });
  assertPdfBlobReady(blob, 'O PDF das carteirinhas');
  return blob;
};

export const downloadCarteirinhasPdf = (blob: Blob, layoutType: 'dobra' | 'espelhado') => {
  assertPdfBlobReady(blob, 'O PDF das carteirinhas');
  downloadPdfBlob(blob, `carteirinhas-${layoutType}.pdf`);
};

export const printCarteirinhas = (blob: Blob) => printPdfBlob(blob, {
  title: 'Carteirinhas de estudante',
});
