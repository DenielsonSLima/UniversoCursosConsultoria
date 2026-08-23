import type { jsPDF } from "jspdf";

import { drawCanonicalPdfText } from "../shared/canonical-document-vector-pdf.core.ts";
import { formatDocumentValidationUrlForDisplay } from "../../../shared/document-validation/document-validation.url.ts";
import type {
  ElectronicSignatureReceiptParticipant,
  ElectronicSignatureReceiptPayload,
  ElectronicSignatureReceiptStatus,
  PreparedElectronicSignatureReceipt,
} from "./comprovante-assinatura-eletronica.types.ts";
import {
  assertString,
  eventLabels,
  formatOccurredAt,
  methodLabels,
  statusColors,
  statusLabels,
} from "./comprovante-assinatura-eletronica.validation-helpers.ts";

const PAGE_WIDTH = 210;
const PAGE_LEFT = 20;
const PAGE_RIGHT = 20;

export const drawSectionHeading = (pdf: jsPDF, label: string, y: number) => {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.4);
  pdf.setTextColor(71, 85, 105);
  pdf.text(label.toUpperCase(), PAGE_LEFT, y, { baseline: "top" });
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_LEFT, y + 4.5, PAGE_WIDTH - PAGE_RIGHT, y + 4.5);
};

const drawStatusMessageCard = (
  pdf: jsPDF,
  badgeLabel: string,
  badgeColor: readonly [number, number, number],
  heading: string,
  receiptMessage: string,
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 14, 2, 2, "FD");
  pdf.setFillColor(...badgeColor);
  pdf.roundedRect(PAGE_LEFT + 3, top + 3, 27, 8, 1.6, 1.6, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(5.5);
  pdf.text(badgeLabel, PAGE_LEFT + 16.5, top + 5.4, {
    align: "center",
    baseline: "top",
  });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(7.2);
  pdf.text(heading, PAGE_LEFT + 34, top + 3.2, {
    baseline: "top",
  });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.55);
  drawCanonicalPdfText(pdf, receiptMessage, PAGE_LEFT + 34, top + 7.7, {
    maxWidth: width - 38,
    maxLines: 2,
    lineHeight: 1.12,
  });
};

export const drawStatusCard = (
  pdf: jsPDF,
  status: ElectronicSignatureReceiptStatus,
  receiptMessage: string,
  top: number,
) =>
  drawStatusMessageCard(
    pdf,
    statusLabels[status],
    statusColors[status],
    "Estado do documento no momento da emissão deste comprovante",
    receiptMessage,
    top,
  );

export const drawPreviewStatusCard = (
  pdf: jsPDF,
  receiptMessage: string,
  top: number,
) =>
  drawStatusMessageCard(
    pdf,
    "MODELO",
    [71, 85, 105],
    "Mensagem de apoio configurada para o comprovante",
    receiptMessage,
    top,
  );

export const drawReferenceCard = (
  pdf: jsPDF,
  document: ElectronicSignatureReceiptPayload["document"],
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 40, 2, 2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text("DOCUMENTO", PAGE_LEFT + 4, top + 3, { baseline: "top" });
  pdf.text("VERSÃO", PAGE_LEFT + 117, top + 3, { baseline: "top" });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(6.4);
  drawCanonicalPdfText(
    pdf,
    `${document.type} - ${document.reference}`,
    PAGE_LEFT + 4,
    top + 7.1,
    { maxWidth: 108, maxLines: 2, lineHeight: 1.08 },
  );
  pdf.setFont("courier", "bold");
  pdf.setFontSize(6.4);
  drawCanonicalPdfText(
    pdf,
    document.version,
    PAGE_LEFT + 117,
    top + 7.1,
    { maxWidth: width - 121, maxLines: 2, lineHeight: 1.08 },
  );

  pdf.setDrawColor(241, 245, 249);
  pdf.line(PAGE_LEFT + 4, top + 13, PAGE_LEFT + width - 4, top + 13);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text(
    `HASH DO DOCUMENTO ORIGINAL - ${document.originalHash.algorithm}`,
    PAGE_LEFT + 4,
    top + 16.3,
    {
      baseline: "top",
    },
  );
  pdf.setFont("courier", "normal");
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(document.originalHash.algorithm === "SHA-512" ? 3.55 : 4.5);
  const originalHashLines = document.originalHash.algorithm === "SHA-512"
    ? [
      document.originalHash.value.slice(0, 64),
      document.originalHash.value.slice(64),
    ]
    : [document.originalHash.value];
  pdf.text(originalHashLines, PAGE_LEFT + 4, top + 19.7, {
    baseline: "top",
    lineHeightFactor: 1.16,
  });

  const finalHashLabelTop = document.originalHash.algorithm === "SHA-512"
    ? 27.1
    : 24.6;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text(
    `HASH DO CORPO ASSINADO - ${document.hash.algorithm}`,
    PAGE_LEFT + 4,
    top + finalHashLabelTop,
    {
      baseline: "top",
    },
  );
  pdf.setFont("courier", "normal");
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(document.hash.algorithm === "SHA-512" ? 3.55 : 4.5);
  const finalHashLines = document.hash.algorithm === "SHA-512"
    ? [document.hash.value.slice(0, 64), document.hash.value.slice(64)]
    : [document.hash.value];
  pdf.text(finalHashLines, PAGE_LEFT + 4, top + finalHashLabelTop + 3.4, {
    baseline: "top",
    lineHeightFactor: 1.16,
  });
};

export const drawParticipantGrid = (
  pdf: jsPDF,
  participants: readonly ElectronicSignatureReceiptParticipant[],
  top: number,
) => {
  const columnGap = 5;
  const availableWidth = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const columnWidth = (availableWidth - columnGap) / 2;
  const rows = Math.ceil(participants.length / 2);
  participants.forEach((participant, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE_LEFT + column * (columnWidth + columnGap);
    const y = top + row * 8.3;
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, columnWidth, 6.8, 1.3, 1.3, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(5.7);
    drawCanonicalPdfText(
      pdf,
      participant.name,
      x + 2,
      y + 1.35,
      { maxWidth: columnWidth - 4, maxLines: 1 },
    );
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(4.9);
    drawCanonicalPdfText(
      pdf,
      participant.role,
      x + 2,
      y + 4.05,
      { maxWidth: columnWidth - 4, maxLines: 1 },
    );
  });
  return top + rows * 8.3;
};

export const drawEventTimeline = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  top: number,
) => {
  const labelX = PAGE_LEFT + 27;
  const lineX = PAGE_LEFT + 21;
  const descriptionWidth = PAGE_WIDTH - PAGE_RIGHT - labelX;
  const eventHeight = 7.25;
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.3);
  pdf.line(
    lineX,
    top + 2,
    lineX,
    top + (prepared.payload.events.length - 1) * eventHeight + 2,
  );
  prepared.payload.events.forEach((event, index) => {
    const y = top + index * eventHeight;
    const participant = event.participantId
      ? prepared.participantsById.get(event.participantId) || null
      : null;
    const details = [
      participant
        ? `${participant.name} - ${participant.role}`
        : "Sistema institucional",
      event.method ? methodLabels[event.method] : "",
      event.reason
        ? `Motivo: ${assertString(event.reason, "O motivo do evento", 120)}`
        : "",
    ].filter(Boolean).join(" | ");
    pdf.setFillColor(37, 99, 235);
    pdf.circle(lineX, y + 2, 1.3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(4.2);
    const [eventDate, eventTime] = formatOccurredAt(event.occurredAt);
    pdf.text(eventDate, PAGE_LEFT, y - 0.2, {
      baseline: "top",
      maxWidth: 17.5,
    });
    pdf.text(eventTime, PAGE_LEFT, y + 2.1, {
      baseline: "top",
      maxWidth: 19.5,
    });
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(5.7);
    drawCanonicalPdfText(
      pdf,
      eventLabels[event.type],
      labelX,
      y - 0.1,
      { maxWidth: descriptionWidth, maxLines: 1 },
    );
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(4.65);
    drawCanonicalPdfText(
      pdf,
      details,
      labelX,
      y + 2.8,
      { maxWidth: descriptionWidth, maxLines: 1 },
    );
  });
  return top + prepared.payload.events.length * eventHeight;
};

export const drawValidationCard = (
  pdf: jsPDF,
  prepared: PreparedElectronicSignatureReceipt,
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const qrSize = 25;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 31, 2, 2, "FD");
  pdf.addImage(
    prepared.qr.dataUrl,
    prepared.qr.format,
    PAGE_LEFT + 4,
    top + 3,
    qrSize,
    qrSize,
    `comprovante-assinatura-qr-${prepared.validationCode}`,
    "FAST",
  );
  const contentX = PAGE_LEFT + qrSize + 8;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(6.6);
  pdf.text("VALIDAÇÃO PÚBLICA", contentX, top + 4, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.5);
  pdf.text(
    "Confira o estado e a integridade deste comprovante pelo QR Code ou pela URL.",
    contentX,
    top + 8.1,
    {
      baseline: "top",
      maxWidth: width - qrSize - 15,
    },
  );
  pdf.setFont("courier", "bold");
  pdf.setTextColor(29, 78, 216);
  pdf.setFontSize(6.1);
  pdf.text(prepared.validationCode, contentX, top + 13.2, { baseline: "top" });
  pdf.setFont("courier", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(4.45);
  pdf.text(
    formatDocumentValidationUrlForDisplay(prepared.validationUrl),
    contentX,
    top + 17.2,
    {
      baseline: "top",
      maxWidth: width - qrSize - 15,
    },
  );
};

export const drawConfirmationCard = (
  pdf: jsPDF,
  confirmationMessage: string,
  top: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const textX = PAGE_LEFT + 4;
  const textWidth = width - 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.8);
  const lines = pdf.splitTextToSize(confirmationMessage, textWidth) as string[];
  if (lines.length > 18) {
    throw new Error(
      "A mensagem de confirmação excede a área segura do comprovante.",
    );
  }
  const height = Math.max(24, 10 + lines.length * 2.45);
  if (top + height > 188) {
    throw new Error(
      "A mensagem de confirmação excede a primeira área segura da segunda página.",
    );
  }
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, height, 2, 2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.2);
  pdf.text("DECLARAÇÃO DE CONFIRMAÇÃO", textX, top + 3.5, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(30, 41, 59);
  pdf.setFontSize(5.8);
  pdf.text(lines, textX, top + 8.3, {
    baseline: "top",
    lineHeightFactor: 1.18,
  });
  return top + height;
};

