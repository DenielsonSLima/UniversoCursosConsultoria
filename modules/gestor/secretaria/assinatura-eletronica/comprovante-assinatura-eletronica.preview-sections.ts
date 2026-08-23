import type { jsPDF } from "jspdf";

import { drawCanonicalPdfText } from "../shared/canonical-document-vector-pdf.core.ts";

const PAGE_WIDTH = 210;
const PAGE_LEFT = 20;
const PAGE_RIGHT = 20;

export const drawPreviewSeal = (pdf: jsPDF, top: number) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(239, 246, 255);
  pdf.setDrawColor(147, 197, 253);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(PAGE_LEFT, top, width, 10, 1.8, 1.8, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(29, 78, 216);
  pdf.setFontSize(6.4);
  pdf.text("PRÉVIA DO MODELO — SEM VALIDADE", PAGE_WIDTH / 2, top + 3, {
    align: "center",
    baseline: "top",
  });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(4.8);
  pdf.text(
    "Dados, evidências e validação serão inseridos somente pelo serviço autorizado.",
    PAGE_WIDTH / 2,
    top + 6.3,
    {
      align: "center",
      baseline: "top",
    },
  );
  return top + 10;
};

export const drawPreviewReferenceCard = (pdf: jsPDF, top: number) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  const columns = [
    ["DOCUMENTO", "Gerado no fechamento"],
    ["REVISÃO", "Congelada pelo serviço"],
    ["INTEGRIDADE", "Hash calculado no fechamento"],
  ] as const;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(PAGE_LEFT, top, width, 23, 2, 2, "FD");
  columns.forEach(([label, value], index) => {
    const columnWidth = width / columns.length;
    const x = PAGE_LEFT + index * columnWidth + 4;
    if (index > 0) {
      pdf.setDrawColor(241, 245, 249);
      pdf.line(
        PAGE_LEFT + index * columnWidth,
        top + 4,
        PAGE_LEFT + index * columnWidth,
        top + 19,
      );
    }
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(5);
    pdf.text(label, x, top + 5, { baseline: "top" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(5.5);
    drawCanonicalPdfText(pdf, value, x, top + 10, {
      maxWidth: columnWidth - 8,
      maxLines: 2,
    });
  });
};

export const drawPreviewReservedArea = (
  pdf: jsPDF,
  label: string,
  description: string,
  top: number,
  height: number,
) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineDashPattern([1.2, 1.2], 0);
  pdf.roundedRect(PAGE_LEFT, top, width, height, 2, 2, "FD");
  pdf.setLineDashPattern([], 0);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.4);
  pdf.text(label.toUpperCase(), PAGE_LEFT + 4, top + 4, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  drawCanonicalPdfText(pdf, description, PAGE_LEFT + 4, top + 9, {
    maxWidth: width - 8,
    maxLines: 3,
  });
};

export const drawPreviewValidationCard = (pdf: jsPDF, top: number) => {
  const width = PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(PAGE_LEFT, top, width, 27, 2, 2, "FD");
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.45);
  pdf.roundedRect(PAGE_LEFT + 5, top + 4, 19, 19, 1.5, 1.5, "S");
  pdf.line(PAGE_LEFT + 9, top + 8, PAGE_LEFT + 20, top + 19);
  pdf.line(PAGE_LEFT + 20, top + 8, PAGE_LEFT + 9, top + 19);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(6.2);
  pdf.text("VALIDAÇÃO PÚBLICA", PAGE_LEFT + 30, top + 5, { baseline: "top" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(5.3);
  pdf.text(
    "QR Code, código e URL ficam disponíveis somente após a conclusão autorizada.",
    PAGE_LEFT + 30,
    top + 10,
    {
      baseline: "top",
      maxWidth: width - 36,
    },
  );
  pdf.setFont("courier", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(5.2);
  pdf.text("ÁREA RESERVADA PELO SERVIÇO", PAGE_LEFT + 30, top + 17, {
    baseline: "top",
  });
};

export const drawPreviewFooter = (pdf: jsPDF, page: 1 | 2) => {
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE_LEFT, 278, PAGE_WIDTH - PAGE_RIGHT, 278);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(148, 163, 184);
  pdf.setFontSize(4.8);
  pdf.text("PRÉVIA DO MODELO — SEM VALIDADE", PAGE_LEFT, 281, {
    baseline: "top",
  });
  pdf.text(`Página ${page} de 2`, PAGE_WIDTH - PAGE_RIGHT, 281, {
    align: "right",
    baseline: "top",
  });
};


