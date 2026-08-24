import type { jsPDF } from "jspdf";

import { moduloNumero } from "./diario-print.utils.ts";
import { fitText } from "./diario-pdf-table.ts";
import type { PdfImage } from "./diario-pdf-image.core.ts";
import type {
  DiarioPdfResolvedAssets,
  DiarioPdfTrustedQrAsset,
} from "./diario-pdf-assets.ts";
import {
  drawContainedImage,
  drawPageWatermark,
} from "./diario-pdf-assets.ts";
import { drawConfiguredBackCoverFields } from "./diario-pdf-back-cover-fields.ts";
import {
  addPage,
  hexToRgb,
  NAVY,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  setFillColor,
  setTextColor,
  type DiarioPrintDocumentProps,
} from "./diario-pdf-layout.ts";

const coverFieldValue = (props: DiarioPrintDocumentProps, id: string) => {
  if (id === "curso") return props.turma.cursoNome;
  if (id === "modulo") return moduloNumero(props.moduloNome);
  if (id === "areaTematica") {
    return props.moduloNome.replace(/^M[ÓO]DULO\s+[IVXLC]+\s*[-–—]?\s*/i, "");
  }
  if (id === "disciplina") return props.disciplina.nome;
  if (id === "turma") return props.turma.nome || props.turma.codigo;
  if (id === "professor") return props.disciplina.professor;
  return "";
};

const drawCoverDecor = (pdf: jsPDF) => {
  setFillColor(pdf, "#ffffff");
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  setFillColor(pdf, "#0879d8");
  pdf.rect(0, 0, 24, PAGE_HEIGHT, "F");
  pdf.setDrawColor(...hexToRgb("#29a7ef"));
  pdf.setLineWidth(0.25);
  for (let y = -8; y < PAGE_HEIGHT; y += 9) {
    pdf.line(0, Math.max(0, y), 24, Math.min(PAGE_HEIGHT, y + 13));
  }
  setFillColor(pdf, "#ffffff");
  pdf.rect(24, 0, 2.2, PAGE_HEIGHT, "F");
  setFillColor(pdf, "#e30613");
  pdf.rect(26.2, 0, 5, PAGE_HEIGHT, "F");

  pdf.setLineWidth(0.35);
  pdf.setDrawColor(...hexToRgb("#665ba7"));
  pdf.lines([[-4, -15, -15, -36, -34, -54]], PAGE_WIDTH, PAGE_HEIGHT);
  pdf.setDrawColor(...hexToRgb("#21a9e0"));
  pdf.lines([[-8, -10, -26, -26, -46, -38]], PAGE_WIDTH, PAGE_HEIGHT);
};

const drawCoverSlogan = (pdf: jsPDF) => {
  const segments = [
    "EDUCAÇÃO QUE TRANSFORMA",
    "CONHECIMENTO QUE CONECTA",
    "FUTURO QUE CONSTRUÍMOS",
  ];
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  const bullet = "•";
  const gap = 3;
  const bulletWidth = pdf.getTextWidth(bullet);
  const widths = segments.map((segment) => pdf.getTextWidth(segment));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) +
    2 * (bulletWidth + gap * 2);
  let x = (PAGE_WIDTH - totalWidth) / 2 + 10;
  segments.forEach((segment, index) => {
    setTextColor(pdf, "#071a73");
    pdf.text(segment, x, 194);
    x += widths[index];
    if (index < segments.length - 1) {
      x += gap;
      pdf.setFont("helvetica", "bold");
      setTextColor(pdf, "#e30613");
      pdf.text(bullet, x, 194);
      pdf.setFont("helvetica", "normal");
      x += bulletWidth + gap;
    }
  });

  pdf.setDrawColor(...hexToRgb("#64748b"));
  pdf.setLineWidth(0.25);
  pdf.line(64, 201, 145, 201);
  pdf.line(176, 201, 257, 201);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  setTextColor(pdf, "#52525b");
  pdf.text("DESDE 2011", PAGE_WIDTH / 2 + 12, 203, { align: "center" });
};

export const drawCover = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  logo: PdfImage,
  watermark: PdfImage | null,
  coverBackground: PdfImage | null,
) => {
  if (coverBackground) {
    pdf.addImage(
      coverBackground.bytes,
      coverBackground.format,
      0,
      0,
      PAGE_WIDTH,
      PAGE_HEIGHT,
      "diario-cover-decorative-background",
      "FAST",
    );
  } else {
    drawCoverDecor(pdf);
    drawPageWatermark(pdf, props, watermark);
    drawContainedImage(
      pdf,
      logo,
      { x: 94, y: 10, width: 122, height: 32 },
      "diario-cover-logo",
    );

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(34);
    setTextColor(pdf, "#071a73");
    pdf.text("DIÁRIO DE CLASSE", PAGE_WIDTH / 2 + 10, 70, {
      align: "center",
    });
  }

  props.template.capaCampos.filter((field) => field.visible).forEach((field) => {
    const x = (field.x / 100) * PAGE_WIDTH;
    const y = (field.y / 100) * PAGE_HEIGHT;
    const width = (field.width / 100) * PAGE_WIDTH;
    const baseline = y + (field.fontSize || 10) * 0.3528;
    setTextColor(pdf, field.color || NAVY);
    pdf.setFontSize(field.fontSize || 10);
    pdf.setFont("helvetica", field.bold ? "bold" : "normal");
    const hasBorderTop = Boolean(field.borderTop);
    if (hasBorderTop) {
      pdf.setDrawColor(...hexToRgb(field.color || NAVY));
      pdf.line(x, y, x + width, y);
    }
    const text = fitText(
      pdf,
      `${field.label}${coverFieldValue(props, field.id)}`,
      width,
    );
    const align = field.align || "left";
    pdf.text(
      text,
      align === "center" ? x + width / 2 : align === "right" ? x + width : x,
      baseline,
      { align },
    );
  });

  if (!coverBackground) drawCoverSlogan(pdf);
  if (props.exportMode === "EM_BRANCO" && !coverBackground) {
    const badgeWidth = 104;
    const badgeX = PAGE_WIDTH - badgeWidth - 13;
    setFillColor(pdf, "#fff7ed");
    pdf.setDrawColor(...hexToRgb("#f59e0b"));
    pdf.roundedRect(badgeX, 8, badgeWidth, 9, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    setTextColor(pdf, "#9a3412");
    pdf.text(
      "MODELO MANUAL - NOTAS E FREQUÊNCIA EM BRANCO",
      badgeX + badgeWidth / 2,
      13.5,
      { align: "center" },
    );
  }
};

export const drawBackCover = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  watermark: PdfImage | null,
  backCoverBackground: PdfImage | null,
  backCoverImages: DiarioPdfResolvedAssets["backCoverImages"],
  qrCode: DiarioPdfTrustedQrAsset | null,
  validationUrl: string | null,
) => {
  addPage(pdf);
  if (backCoverBackground) {
    pdf.addImage(
      backCoverBackground.bytes,
      backCoverBackground.format,
      0,
      0,
      PAGE_WIDTH,
      PAGE_HEIGHT,
      "diario-back-cover-background",
      "FAST",
    );
  }
  drawPageWatermark(pdf, props, watermark);
  if (!props.template.imprimirValidacaoContracapa) {
    return pdf.getNumberOfPages() - 1;
  }
  const validationCode = props.validationCode?.trim();
  if (!validationCode) {
    throw new Error(
      "O código canônico do Diário não foi confirmado. Nenhum PDF foi gerado.",
    );
  }
  drawConfiguredBackCoverFields(
    pdf,
    props,
    backCoverImages,
    qrCode,
    validationUrl,
  );
  return pdf.getNumberOfPages() - 1;
};
