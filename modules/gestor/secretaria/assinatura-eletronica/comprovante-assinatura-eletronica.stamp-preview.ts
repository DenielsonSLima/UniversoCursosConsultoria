import type { jsPDF } from "jspdf";

import {
  type CanonicalPdfImage,
  drawCanonicalPdfText,
} from "../shared/canonical-document-vector-pdf.core.ts";
import { drawCanonicalInstitutionalHeader } from "../shared/canonical-institutional-header-pdf.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  type ElectronicSignatureStampEditor,
  type ElectronicSignatureStampPlacement,
  type ElectronicSignatureStampTemplateElement,
  type ElectronicSignatureStampTemplateFont,
  type ElectronicSignatureStampTemplateHiddenElementId,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  deriveAutomaticSignatureStampPlacements,
  getSignatureStampTemplateElementVisualBoundsForSurface,
} from "../../../shared/assinatura-eletronica/signature-stamp-template.ts";
import { formatDocumentValidationUrlForDisplay } from "../../../shared/document-validation/document-validation.url.ts";
import { createLocalQrCodeDataUrl } from "../../../shared/qrcode/local-qrcode.ts";
import { drawInstitutionalWatermark } from "./comprovante-assinatura-eletronica.receipt-decoration.ts";
import type {
  ElectronicSignatureReceiptPresentation,
  ElectronicSignatureTemplatePreviewPayload,
} from "./comprovante-assinatura-eletronica.types.ts";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_LEFT = 20;
const PAGE_RIGHT = 20;
type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

interface StampPreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const stampPreviewRectFromPlacement = (
  placement: ElectronicSignatureStampPlacement,
): StampPreviewRect => ({
  x: PAGE_WIDTH * placement.xBp / 100_000,
  y: PAGE_HEIGHT * placement.yBp / 100_000,
  width: PAGE_WIDTH * placement.widthBp / 100_000,
  height: PAGE_HEIGHT * placement.heightBp / 100_000,
});

const stampPreviewRectForElement = (
  stampRect: StampPreviewRect,
  element: ElectronicSignatureStampTemplateElement,
): StampPreviewRect => {
  const visualBounds = getSignatureStampTemplateElementVisualBoundsForSurface(
    element,
    stampRect.width,
    stampRect.height,
  );
  return {
    x: stampRect.x + stampRect.width * visualBounds.xBp / 100_000,
    y: stampRect.y + stampRect.height * visualBounds.yBp / 100_000,
    width: stampRect.width * visualBounds.widthBp / 100_000,
    height: stampRect.height * visualBounds.heightBp / 100_000,
  };
};

const stampTemplateColor = (value: string) =>
  [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ] as const;

const STAMP_PREVIEW_BINDING_VALUES = {
  SIGNER_ROLE: "Signatário",
  DISPLAY_TITLE: ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  SIGNER_NAME: "Maria S. Lima",
  SIGNED_AT: "20/08/2026, 15:42",
  SIGNER_CPF_MASKED: "12*.***.**9-01",
  SIGNATURE_HASH: "a91f…5e7c",
  VERIFICATION_CODE: "SIG-00000000-0000-4000-8000-000000000001",
  VERIFICATION_URL:
    "https://universocc.com.br/validador?code=SIG-00000000-0000-4000-8000-000000000001",
} as const;

/** Conteúdo demonstrativo; nunca corresponde a um evento de assinatura real. */
const STAMP_PREVIEW_QR_VALUE =
  "https://universocc.com.br/validador?code=SIG-00000000-0000-4000-8000-000000000001";

const drawStampTemplateQr = (
  pdf: jsPDF,
  rect: StampPreviewRect,
  color: readonly [number, number, number],
  dataUrl: string,
  sampleIndex: number,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.13);
  pdf.rect(rect.x, rect.y, rect.width, rect.height, "FD");
  pdf.addImage(
    dataUrl,
    "PNG",
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    `preview-carimbo-global-qr-${sampleIndex}`,
    "FAST",
  );
};

const stampTemplateJsPdfFont = (
  font: ElectronicSignatureStampTemplateFont,
): readonly [family: "helvetica" | "courier", style: string] => {
  switch (font) {
    case "HELVETICA":
      return ["helvetica", "normal"];
    case "HELVETICA_BOLD":
      return ["helvetica", "bold"];
    case "HELVETICA_OBLIQUE":
      return ["helvetica", "italic"];
    case "HELVETICA_BOLD_OBLIQUE":
      return ["helvetica", "bolditalic"];
    case "COURIER":
      return ["courier", "normal"];
    case "COURIER_BOLD":
      return ["courier", "bold"];
    case "COURIER_OBLIQUE":
      return ["courier", "italic"];
    case "COURIER_BOLD_OBLIQUE":
      return ["courier", "bolditalic"];
  }
};

const stampTemplatePreviewTextLines = (
  element: Extract<ElectronicSignatureStampTemplateElement, { kind: "TEXT" }>,
  value: string,
) => {
  if (element.binding === "VERIFICATION_CODE") {
    return [
      "CÓD. VALIDAÇÃO",
      value.slice(0, 20),
      value.slice(20),
    ];
  }
  if (element.binding === "VERIFICATION_URL") {
    const displayUrl = formatDocumentValidationUrlForDisplay(value);
    return element.widthBp >= 40_000 && element.heightBp <= 16_000
      ? [`${element.style.label}${displayUrl}`]
      : [element.style.label.trim(), displayUrl];
  }
  if (element.binding === "SIGNER_NAME") return [value];
  return [`${element.style.label}${value}`];
};

const resolveStampTemplateJsPdfTextSize = (
  pdf: jsPDF,
  lines: readonly string[],
  rect: StampPreviewRect,
  configuredSize: number,
) => {
  const minimumSize = 3.2;
  let size = Math.max(minimumSize, configuredSize);
  const fits = (candidate: number) => {
    pdf.setFontSize(candidate);
    const lineHeightMm = candidate * 25.4 / 72 * 1.14;
    return lines.length * lineHeightMm <= rect.height + 0.001 &&
      lines.every((line) => pdf.getTextWidth(line) <= rect.width + 0.001);
  };
  while (size > minimumSize && !fits(size)) {
    size = Math.max(minimumSize, size - 0.1);
  }
  if (!fits(size)) {
    throw new Error(
      "O texto do template não cabe integralmente na área configurada.",
    );
  }
  return size;
};

const drawGlobalSignatureStamp = (
  pdf: jsPDF,
  stamp: ElectronicSignatureStampEditor,
  placement: ElectronicSignatureStampPlacement,
  asset: CanonicalPdfImage | null,
  sampleIndex: number,
  qrDataUrl: string,
) => {
  const stampRect = stampPreviewRectFromPlacement(placement);
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(
    stampRect.x,
    stampRect.y,
    stampRect.width,
    stampRect.height,
    0.9,
    0.9,
    "S",
  );

  stamp.template.elements.forEach((element) => {
    if (
      stamp.template.hiddenElementIds?.includes(
        element.id as ElectronicSignatureStampTemplateHiddenElementId,
      )
    ) {
      return;
    }
    const rect = stampPreviewRectForElement(stampRect, element);
    if (element.kind === "LINE") {
      const color = stampTemplateColor(element.style.color);
      pdf.setDrawColor(...color);
      pdf.setLineWidth(
        Math.max(0.1, stampRect.height * element.style.widthBp / 100_000),
      );
      pdf.line(
        rect.x,
        rect.y + rect.height / 2,
        rect.x + rect.width,
        rect.y + rect.height / 2,
      );
      return;
    }
    if (element.kind === "QR") {
      drawStampTemplateQr(pdf, rect, [7, 26, 51], qrDataUrl, sampleIndex);
      return;
    }
    if (element.kind === "IMAGE") {
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.13);
      pdf.roundedRect(rect.x, rect.y, rect.width, rect.height, 0.6, 0.6, "FD");
      if (asset) {
        const properties = pdf.getImageProperties(asset.dataUrl);
        const scale = Math.min(
          rect.width / properties.width,
          rect.height / properties.height,
        );
        const width = properties.width * scale;
        const height = properties.height * scale;
        pdf.addImage(
          asset.dataUrl,
          asset.format,
          rect.x + (rect.width - width) / 2,
          rect.y + (rect.height - height) / 2,
          width,
          height,
          `preview-carimbo-global-${
            stamp.assetId || "sem-ativo"
          }-${sampleIndex}`,
          "FAST",
        );
      } else {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(Math.max(2.4, Math.min(4.2, rect.width * 0.4)));
        pdf.text("IMAGEM", rect.x + rect.width / 2, rect.y + rect.height / 2, {
          align: "center",
          baseline: "middle",
        });
      }
      return;
    }

    const color = stampTemplateColor(element.style.color);
    const [fontFamily, fontStyle] = stampTemplateJsPdfFont(element.style.font);
    pdf.setFont(fontFamily, fontStyle);
    pdf.setTextColor(...color);
    const value = STAMP_PREVIEW_BINDING_VALUES[element.binding];
    const lines = stampTemplatePreviewTextLines(element, value);
    const configuredSize = stampRect.height * 72 / 25.4 *
      element.style.fontSizeBp / 100_000;
    const fontSize = resolveStampTemplateJsPdfTextSize(
      pdf,
      lines,
      rect,
      configuredSize,
    );
    pdf.setFontSize(fontSize);
    pdf.text(
      lines,
      element.style.align === "CENTER"
        ? rect.x + rect.width / 2
        : element.style.align === "RIGHT"
        ? rect.x + rect.width
        : rect.x,
      rect.y,
      {
        align: element.style.align.toLowerCase() as "left" | "center" | "right",
        baseline: "top",
        lineHeightFactor: 1.14,
      },
    );
  });

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(Math.max(2.1, Math.min(3.2, stampRect.height * 0.2)));
  pdf.text(
    `MODELO GLOBAL · SEM VALIDADE · ${sampleIndex + 1}`,
    stampRect.x + stampRect.width - 0.9,
    stampRect.y + stampRect.height - 1.2,
    { align: "right", baseline: "top" },
  );
};

export const drawSignatureStampPlacementPreview = async (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: ElectronicSignatureTemplatePreviewPayload,
  presentation: ElectronicSignatureReceiptPresentation,
) => {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  drawInstitutionalWatermark(pdf, GState, payload.institutionalWatermark);
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    payload.institution,
    payload.logo,
    {
      orientation: "portrait",
      alias: "preview-posicionamento-carimbo-logo-institucional",
      meta: {
        eyebrow: "DOCUMENTO ORIGINAL",
        title: "Prévia de posicionamento do carimbo",
        label: "ALVO",
        value: "ÚLTIMA PÁGINA",
      },
    },
  );
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11);
  pdf.text(
    "CONTEÚDO DEMONSTRATIVO DO DOCUMENTO",
    PAGE_WIDTH / 2,
    header.contentTop + 9,
    {
      align: "center",
      baseline: "top",
    },
  );
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(6.2);
  drawCanonicalPdfText(
    pdf,
    "Esta folha A4 representa somente a última página do PDF original. O mesmo template global será aplicado automaticamente, na ordem autorizada, a cada signatário do envelope congelado.",
    PAGE_LEFT,
    header.contentTop + 18,
    {
      maxWidth: PAGE_WIDTH - PAGE_LEFT - PAGE_RIGHT,
      maxLines: 3,
      lineHeight: 1.25,
    },
  );
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.25);
  [118, 132, 146, 160, 174].forEach((y) =>
    pdf.line(PAGE_LEFT, y, PAGE_WIDTH - PAGE_RIGHT, y)
  );

  const stamp = presentation.editor.signatureStamp;
  const asset = stamp.assetId
    ? payload.signatureStampAssets[stamp.assetId] ?? null
    : null;
  if (stamp.assetId && !asset) {
    throw new Error(
      "A imagem própria do carimbo não foi resolvida para a prévia.",
    );
  }
  const qrDataUrl = await createLocalQrCodeDataUrl(STAMP_PREVIEW_QR_VALUE, {
    size: 512,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  const sampleSignerCount = Math.min(3, stamp.autoLayout.maxSigners);
  const placements = deriveAutomaticSignatureStampPlacements(
    stamp.autoLayout,
    sampleSignerCount,
  );
  placements.forEach((placement, index) => {
    drawGlobalSignatureStamp(pdf, stamp, placement, asset, index, qrDataUrl);
  });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(148, 163, 184);
  pdf.setFontSize(4.8);
  pdf.text("PRÉVIA GLOBAL - SEM VALIDADE", PAGE_LEFT, 184, {
    baseline: "top",
  });
  pdf.text(
    "3 exemplos neutros de N signatários",
    PAGE_WIDTH - PAGE_RIGHT,
    184,
    {
      align: "right",
      baseline: "top",
    },
  );
};


