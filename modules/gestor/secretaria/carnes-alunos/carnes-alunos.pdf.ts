import type { BaneseDocumentGroup } from './carnes-alunos.types';

const safeFilePart = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase()
  .slice(0, 48);

export const buildBaneseDocumentFileName = (groups: BaneseDocumentGroup[]) => {
  if (groups.length === 1) {
    const group = groups[0];
    const kind = group.documentType === 'carnet' ? 'carne' : 'boletos';
    const student = safeFilePart(group.studentName) || 'aluno';
    const enrollment = safeFilePart(group.enrollmentCode) || group.enrollmentId.slice(0, 8);
    return `${kind}-banese-${student}-${enrollment}.pdf`;
  }
  return `documentos-banese-lote-${groups.length}.pdf`;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const failure = new Error('A preparação do PDF foi cancelada.');
  failure.name = 'AbortError';
  throw failure;
};

export const combineVectorPdfBlobs = async (
  documents: Blob[],
  signal?: AbortSignal,
): Promise<Blob> => {
  throwIfAborted(signal);
  if (!documents.length) {
    throw new Error('Nenhum PDF Banese foi retornado para a prévia.');
  }
  documents.forEach((document) => {
    if (!document.size || !document.type.toLowerCase().includes('application/pdf')) {
      throw new Error('Uma das respostas Banese não contém um PDF válido.');
    }
  });
  if (documents.length === 1) return documents[0];

  const { PDFDocument } = await import('pdf-lib');
  throwIfAborted(signal);
  const merged = await PDFDocument.create({ updateMetadata: false });
  for (const document of documents) {
    throwIfAborted(signal);
    const source = await PDFDocument.load(await document.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  throwIfAborted(signal);
  const bytes = await merged.save();
  throwIfAborted(signal);
  return new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' });
};
