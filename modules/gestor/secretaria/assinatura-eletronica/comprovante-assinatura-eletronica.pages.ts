import type { jsPDF } from "jspdf";

import { drawCanonicalInstitutionalHeader } from "../shared/canonical-institutional-header-pdf.ts";
import type {
  ElectronicSignatureReceiptPresentation,
  ElectronicSignatureTemplatePreviewPayload,
  PreparedElectronicSignatureReceipt,
} from "./comprovante-assinatura-eletronica.types.ts";
import {
  drawFooter,
  drawInstitutionalWatermark,
  drawLegalSections,
} from "./comprovante-assinatura-eletronica.receipt-decoration.ts";
import {
  drawConfirmationCard,
  drawEventTimeline,
  drawParticipantGrid,
  drawPreviewStatusCard,
  drawReferenceCard,
  drawSectionHeading,
  drawStatusCard,
  drawValidationCard,
} from "./comprovante-assinatura-eletronica.receipt-sections.ts";
import {
  drawPreviewFooter,
  drawPreviewReferenceCard,
  drawPreviewReservedArea,
  drawPreviewSeal,
  drawPreviewValidationCard,
} from "./comprovante-assinatura-eletronica.preview-sections.ts";
import { statusLabels } from "./comprovante-assinatura-eletronica.validation-helpers.ts";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

export const drawReceipt = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  GState: PdfGStateConstructor,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    prepared.payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    prepared.payload.institution,
    prepared.payload.logo,
    {
      orientation: "portrait",
      alias: "comprovante-assinatura-logo-institucional",
      meta: {
        eyebrow: "RELATÓRIO DE EVIDÊNCIAS",
        title: prepared.payload.presentation.receiptTitle,
        label: "STATUS",
        value: statusLabels[prepared.payload.status],
      },
    },
  );
  const statusTop = header.contentTop + 1.5;
  drawStatusCard(
    pdf,
    prepared.payload.status,
    prepared.payload.presentation.receiptMessage,
    statusTop,
  );
  const referenceTop = statusTop + 18;
  drawReferenceCard(pdf, prepared.payload.document, referenceTop);
  const participantsHeading = referenceTop + 45.5;
  drawSectionHeading(pdf, "Participantes e papéis", participantsHeading);
  const participantBottom = drawParticipantGrid(
    pdf,
    prepared.payload.participants,
    participantsHeading + 6.5,
  );
  const eventsHeading = participantBottom + 3.7;
  drawSectionHeading(pdf, "Linha do tempo de evidências", eventsHeading);
  const eventsBottom = drawEventTimeline(pdf, prepared, eventsHeading + 6.5);
  const validationTop = Math.max(eventsBottom + 6, 210);
  if (validationTop + 31 > 276) {
    throw new Error(
      "Os eventos autorizados excedem a area segura do comprovante vetorial.",
    );
  }
  drawValidationCard(pdf, prepared, validationTop);
  drawFooter(pdf, 1);
};

export const drawPresentationPage = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  GState: PdfGStateConstructor,
) => {
  pdf.addPage("a4", "portrait");
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    prepared.payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    prepared.payload.institution,
    prepared.payload.logo,
    {
      orientation: "portrait",
      alias: "comprovante-assinatura-logo-institucional-pagina-2",
      meta: {
        eyebrow: "POLÍTICA DO COMPROVANTE",
        title: prepared.payload.presentation.policyName,
        label: "VERSÃO",
        value: prepared.payload.presentation.policyVersionLabel,
      },
    },
  );
  const confirmationBottom = drawConfirmationCard(
    pdf,
    prepared.payload.presentation.confirmationMessage,
    header.contentTop + 1.5,
  );
  const sectionsBottom = drawLegalSections(
    pdf,
    prepared.payload.presentation.editor.pages[1].sections,
    confirmationBottom + 5,
    232,
  );
  const validationTop = Math.max(sectionsBottom + 5, 232);
  if (validationTop + 31 > 276) {
    throw new Error(
      "A política configurada excede a área segura da segunda página do comprovante.",
    );
  }
  drawValidationCard(pdf, prepared, validationTop);
  drawFooter(pdf, 2);
};

export const drawTemplatePreviewPageOne = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: ElectronicSignatureTemplatePreviewPayload,
  presentation: ElectronicSignatureReceiptPresentation,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    payload.institution,
    payload.logo,
    {
      orientation: "portrait",
      alias: "preview-assinatura-logo-institucional-pagina-1",
      meta: {
        eyebrow: "MODELO DO COMPROVANTE",
        title: presentation.receiptTitle,
        label: "PÁGINA",
        value: "1 DE 2",
      },
    },
  );
  const sealBottom = drawPreviewSeal(pdf, header.contentTop + 1.5);
  const statusTop = sealBottom + 4;
  drawPreviewStatusCard(pdf, presentation.receiptMessage, statusTop);
  const referenceTop = statusTop + 18;
  drawPreviewReferenceCard(pdf, referenceTop);
  const participantHeading = referenceTop + 28;
  drawSectionHeading(pdf, "Participantes e papéis", participantHeading);
  drawPreviewReservedArea(
    pdf,
    "Participantes autorizados",
    "Nomes, papéis e ordem são inseridos a partir do envelope congelado pelo serviço.",
    participantHeading + 6.5,
    23,
  );
  const eventHeading = participantHeading + 34.5;
  drawSectionHeading(pdf, "Linha do tempo de evidências", eventHeading);
  drawPreviewReservedArea(
    pdf,
    "Eventos do processo",
    "Datas, métodos e evidências são apresentados somente quando houver registro canônico concluído ou encerrado.",
    eventHeading + 6.5,
    34,
  );
  drawPreviewValidationCard(pdf, 239);
  drawPreviewFooter(pdf, 1);
};

export const drawTemplatePreviewPageTwo = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: ElectronicSignatureTemplatePreviewPayload,
  presentation: ElectronicSignatureReceiptPresentation,
) => {
  pdf.addPage("a4", "portrait");
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(
    pdf,
    GState,
    payload.institutionalWatermark,
  );
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    payload.institution,
    payload.logo,
    {
      orientation: "portrait",
      alias: "preview-assinatura-logo-institucional-pagina-2",
      meta: {
        eyebrow: "POLÍTICA DO COMPROVANTE",
        title: presentation.policyName,
        label: "VERSÃO",
        value: presentation.policyVersionLabel,
      },
    },
  );
  const sealBottom = drawPreviewSeal(pdf, header.contentTop + 1.5);
  const confirmationBottom = drawConfirmationCard(
    pdf,
    presentation.confirmationMessage,
    sealBottom + 4,
  );
  const sectionsBottom = drawLegalSections(
    pdf,
    presentation.editor.pages[1].sections,
    confirmationBottom + 5,
    232,
  );
  const validationTop = Math.max(sectionsBottom + 5, 244);
  if (validationTop + 27 > 276) {
    throw new Error(
      "Os textos configurados excedem a area segura da previa da segunda pagina.",
    );
  }
  drawPreviewValidationCard(pdf, validationTop);
  drawPreviewFooter(pdf, 2);
};

