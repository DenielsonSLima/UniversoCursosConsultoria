import { createCanonicalPdfQr, resolveCanonicalPdfPhoto } from '../shared/canonical-document-vector-pdf';
import type { CanonicalDocumentPdfBuildOptions, CanonicalDocumentPdfResult } from '../shared/canonical-document-pdf.types';
import type { ContratoAlunoPreparedDocument } from './types/contratos-aluno.types';
import { readContractVisualDocument, type PdfGStateConstructor } from './pdf/model';
import { drawContractPage } from './pdf/page';

export { resolveContractPresentationMode, type ContractPresentationMode } from './pdf/model';
export { getContractWatermarkGeometry } from './pdf/assets';

/**
 * Gera o arquivo oficial diretamente com jsPDF. O conteúdo e a paginação já
 * vieram prontos do RPC; o browser só desenha objetos PDF nativos.
 */
export const createContratosAlunoPdf = async (
  documents: readonly ContratoAlunoPreparedDocument[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> => {
  if (!documents.length) {
    throw new Error("Nenhum contrato foi preparado para gerar o PDF.");
  }

  const visuals = documents.map(readContractVisualDocument);
  const qrAssets = await Promise.all(documents.map(async (document, index) => {
    if (!visuals[index].qr.enabled) return null;
    if (!document.validationCode) {
      throw new Error(
        "O contrato exige código de validação para gerar o QR Code.",
      );
    }
    return createCanonicalPdfQr(document.validationCode);
  }));
  const [logoAssets, watermarkAssets] = await Promise.all([
    Promise.all(visuals.map((visual) => (
      resolveCanonicalPdfPhoto(visual.institution.logoUrl)
    ))),
    Promise.all(visuals.map((visual) => (
      resolveCanonicalPdfPhoto(visual.watermark.imageUrl)
    ))),
  ]);
  const { jsPDF, GState } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
    precision: 4,
  });
  pdf.setProperties({
    title: documents.length > 1
      ? "Contratos de aluno - lote"
      : documents[0].title,
    subject: "Contrato institucional emitido pela Secretaria",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });

  let pageIndex = 0;
  documents.forEach((document, documentIndex) => {
    const visual = visuals[documentIndex];
    visual.pages.forEach((page, visualPageIndex) => {
      if (pageIndex > 0) pdf.addPage("a4", "portrait");
      drawContractPage(
        pdf,
        GState as unknown as PdfGStateConstructor,
        page,
        visual,
        document,
        qrAssets[documentIndex],
        logoAssets[documentIndex],
        watermarkAssets[documentIndex],
        visualPageIndex === 0,
        visualPageIndex === visual.pages.length - 1,
        visualPageIndex + 1,
        visual.pages.length,
      );
      pageIndex += 1;
    });
    options.onProgress?.({
      current: documentIndex + 1,
      total: documents.length,
    });
  });

  return {
    blob: pdf.output("blob"),
    fileName: documents.length > 1
      ? `contratos-aluno-lote-${documents.length}.pdf`
      : `contrato-aluno-${documents[0].emissionId}.pdf`,
  };
};
