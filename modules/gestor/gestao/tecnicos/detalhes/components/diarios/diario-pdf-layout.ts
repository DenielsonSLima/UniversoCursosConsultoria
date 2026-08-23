import type { jsPDF } from "jspdf";

import type { DiarioPdfRenderableData } from "./diario-pdf.contract.ts";
import { fitText } from "./diario-pdf-table.ts";
import type { PdfImage } from "./diario-pdf-image.core.ts";
import {
  drawCanonicalInstitutionalHeader,
  type CanonicalInstitutionalHeader,
} from "../../../../../secretaria/shared/canonical-institutional-header-pdf.ts";
import {
  drawPageWatermark,
  toCanonicalPdfImage,
} from "./diario-pdf-assets.ts";

export const PAGE_WIDTH = 297;
export const PAGE_HEIGHT = 210;
export const CONTENT_LEFT = 14;
export const CONTENT_RIGHT = 11;
export const CONTENT_WIDTH = PAGE_WIDTH - CONTENT_LEFT - CONTENT_RIGHT;
export const NAVY = "#071a33";
export const STANDARD_CONTENT_TOP = 82;
export const STANDARD_CONTENT_BOTTOM = 198;

export type DiarioPrintDocumentProps = DiarioPdfRenderableData;

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [7, 26, 51];
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

export const setTextColor = (pdf: jsPDF, color = NAVY) => {
  const [red, green, blue] = hexToRgb(color);
  pdf.setTextColor(red, green, blue);
};

export const setFillColor = (pdf: jsPDF, color: string) => {
  const [red, green, blue] = hexToRgb(color);
  pdf.setFillColor(red, green, blue);
};

export const addPage = (pdf: jsPDF) => {
  if (pdf.getNumberOfPages() > 0) pdf.addPage("a4", "landscape");
};

const normalizeWidths = (widths: number[]) => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width / total) * CONTENT_WIDTH);
};

export const drawLabelValue = (
  pdf: jsPDF,
  label: string,
  value: unknown,
  x: number,
  y: number,
  maxWidth: number,
  fontSize = 7,
) => {
  pdf.setFontSize(fontSize);
  pdf.setFont("helvetica", "bold");
  pdf.text(label, x, y);
  const labelWidth = pdf.getTextWidth(label);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    fitText(pdf, value, Math.max(1, maxWidth - labelWidth)),
    x + labelWidth,
    y,
  );
};

export const drawStandardPage = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  title: string,
  pageLabel: string,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
) => {
  addPage(pdf);
  drawPageWatermark(pdf, props, watermark);
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    institution,
    toCanonicalPdfImage(logo),
    {
      orientation: "landscape",
      alias: "diario-institutional-logo",
      meta: {
        eyebrow: "DIÁRIO DE CLASSE",
        title,
        label: "PÁGINA",
        value: pageLabel,
      },
    },
  );

  const metaY = header.contentTop + 1;
  const metaHeight = 13;
  const columnWidths = normalizeWidths([1.1, 1, 1.4]);
  const meta = [
    ["Curso: ", props.turma.cursoNome],
    ["Turma: ", props.turma.nome],
    ["Professor(a): ", props.disciplina.professor],
    ["Módulo: ", props.moduloNome],
    ["Unidade educacional: ", props.disciplina.nome],
    ["Carga horária: ", `${props.disciplina.cargaHoraria}h`],
  ];
  pdf.setDrawColor(...hexToRgb("#172033"));
  pdf.setLineWidth(0.25);
  meta.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = CONTENT_LEFT +
      columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0);
    const y = metaY + row * (metaHeight / 2);
    pdf.rect(x, y, columnWidths[column], metaHeight / 2);
    drawLabelValue(
      pdf,
      label,
      value,
      x + 1.5,
      y + 4.2,
      columnWidths[column] - 3,
      6.8,
    );
  });

  pdf.setDrawColor(...hexToRgb("#94a3b8"));
  pdf.line(CONTENT_LEFT, 202, PAGE_WIDTH - CONTENT_RIGHT, 202);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.2);
  setTextColor(pdf, "#64748b");
  pdf.text(props.template.rodape, CONTENT_LEFT, 205);
  pdf.text(pageLabel, PAGE_WIDTH - CONTENT_RIGHT, 205, { align: "right" });
  if (props.exportMode === "EM_BRANCO") {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    setTextColor(pdf, "#b45309");
    pdf.text(
      "MODELO PARA PREENCHIMENTO MANUAL - SEM REGISTROS ACADÊMICOS",
      PAGE_WIDTH / 2,
      205,
      { align: "center" },
    );
  }
};
