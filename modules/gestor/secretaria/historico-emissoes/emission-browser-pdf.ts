import { createEmissionDocumentsPdf } from './emission-document.pdf';
import { createDeclarationDocumentsPdf, isDeclarationPdf } from './declaration-document.pdf';
import type { CanonicalDocumentPdfBuildOptions, CanonicalDocumentPdfResult } from '../shared/canonical-document-pdf.types';
import type { EmissionPdfSource } from './emission-pdf-core';

/** Browser orchestration keeps DOM measurement separate from the pure native compositor. */
export async function createBrowserEmissionDocumentsPdf(
  sources: readonly EmissionPdfSource[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> {
  if (!sources.length) throw new Error('Nenhuma emissão foi selecionada para gerar o PDF.');
  if (sources.every(source => isDeclarationPdf(source.emission.documento))) {
    return createDeclarationDocumentsPdf(sources, options);
  }
  if (!sources.some(source => isDeclarationPdf(source.emission.documento))) {
    return createEmissionDocumentsPdf(sources, options);
  }
  const { PDFDocument } = await import('pdf-lib');
  const combined = await PDFDocument.create();
  for (const [index, source] of sources.entries()) {
    const result = await createBrowserEmissionDocumentsPdf([source]);
    const document = await PDFDocument.load(await result.blob.arrayBuffer());
    const pages = await combined.copyPages(document, document.getPageIndices());
    pages.forEach(page => combined.addPage(page));
    options.onProgress?.({ current: index + 1, total: sources.length });
  }
  return { blob: new Blob([new Uint8Array(await combined.save()).buffer], { type: 'application/pdf' }),
    fileName: `documentos-secretaria-lote-${sources.length}.pdf` };
}
