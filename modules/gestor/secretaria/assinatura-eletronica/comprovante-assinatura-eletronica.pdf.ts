import type { CanonicalDocumentPdfResult } from "../shared/canonical-document-pdf.types.ts";
import { preparePresentation } from "./comprovante-assinatura-eletronica.editor.ts";
import {
  drawPresentationPage,
  drawReceipt,
  drawTemplatePreviewPageOne,
  drawTemplatePreviewPageTwo,
} from "./comprovante-assinatura-eletronica.pages.ts";
import { prepareReceipt } from "./comprovante-assinatura-eletronica.receipt-validation.ts";
import { drawSignatureStampPlacementPreview } from "./comprovante-assinatura-eletronica.stamp-preview.ts";
import type {
  ElectronicSignatureReceiptPayload,
  ElectronicSignatureTemplatePreviewPayload,
} from "./comprovante-assinatura-eletronica.types.ts";

export {
  ELECTRONIC_SIGNATURE_RECEIPT_EVENT_TYPES,
  ELECTRONIC_SIGNATURE_RECEIPT_METHODS,
  ELECTRONIC_SIGNATURE_RECEIPT_STATUSES,
  toElectronicSignatureReceiptPresentation,
} from "./comprovante-assinatura-eletronica.types.ts";
export type {
  ElectronicSignatureInstitutionalWatermark,
  ElectronicSignatureReceiptEvent,
  ElectronicSignatureReceiptEventType,
  ElectronicSignatureReceiptHash,
  ElectronicSignatureReceiptHashAlgorithm,
  ElectronicSignatureReceiptMethod,
  ElectronicSignatureReceiptParticipant,
  ElectronicSignatureReceiptPayload,
  ElectronicSignatureReceiptPresentation,
  ElectronicSignatureReceiptStatus,
  ElectronicSignatureStampAssets,
  ElectronicSignatureTemplatePreviewPayload,
} from "./comprovante-assinatura-eletronica.types.ts";

type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

const toSafeFileSegment = (value: string) =>
  value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60) || "documento";

/**
 * Gera a prévia real do mesmo compositor vetorial sem fabricar evidências. O
 * contrato não possui campos para status, pessoas, eventos, hash ou QR Code.
 */
export const createElectronicSignatureTemplatePreviewPdf = async (
  payload: ElectronicSignatureTemplatePreviewPayload,
): Promise<CanonicalDocumentPdfResult> => {
  const presentation = preparePresentation(payload.presentation);
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
    title: "Prévia do Modelo de Comprovante de Assinatura Eletrônica",
    subject: "Prévia sem validade do modelo de duas páginas",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });
  const gState = GState as unknown as PdfGStateConstructor;
  drawTemplatePreviewPageOne(pdf, gState, payload, presentation);
  drawTemplatePreviewPageTwo(pdf, gState, payload, presentation);
  return {
    blob: pdf.output("blob"),
    fileName: "previa-modelo-comprovante-assinatura.pdf",
  };
};

/** Gera uma única folha demonstrativa para posicionar o carimbo no PDF original. */
export const createElectronicSignatureStampTemplatePreviewPdf = async (
  payload: ElectronicSignatureTemplatePreviewPayload,
): Promise<CanonicalDocumentPdfResult> => {
  const presentation = preparePresentation(payload.presentation);
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
    title: "Prévia de Posicionamento do Carimbo de Assinatura",
    subject: "Última página demonstrativa do documento original - sem validade",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });
  await drawSignatureStampPlacementPreview(
    pdf,
    GState as unknown as PdfGStateConstructor,
    payload,
    presentation,
  );
  return {
    blob: pdf.output("blob"),
    fileName: "previa-posicionamento-carimbo-assinatura.pdf",
  };
};

/**
 * Gera somente a representacao vetorial de um payload previamente autorizado.
 * Este compositor nao consulta banco, nao resolve dados de pessoas e nao aceita
 * campos tecnicos sensiveis no PDF.
 */
export const createElectronicSignatureReceiptPdf = async (
  payload: ElectronicSignatureReceiptPayload,
  options: { canonicalValidationUrl?: string } = {},
): Promise<CanonicalDocumentPdfResult> => {
  const prepared = await prepareReceipt(
    payload,
    options.canonicalValidationUrl,
  );
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
    title: "Comprovante de Assinatura Eletrônica",
    subject: "Relatório de evidências de assinatura eletrônica",
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });
  pdf.setFileId(
    prepared.payload.document.hash.value.slice(0, 32).toUpperCase(),
  );
  pdf.setCreationDate(
    new Date(prepared.payload.events.at(-1)?.occurredAt || 0),
  );
  const gState = GState as unknown as PdfGStateConstructor;
  drawReceipt(pdf, prepared, gState);
  drawPresentationPage(pdf, prepared, gState);
  return {
    blob: pdf.output("blob"),
    fileName: `comprovante-assinatura-${
      toSafeFileSegment(prepared.payload.document.reference)
    }.pdf`,
  };
};

