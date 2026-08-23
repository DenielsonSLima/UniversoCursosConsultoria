import {
  concatTransformationMatrix,
  type PDFFont,
  type PDFDocument,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";
import { ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE } from "./assinatura-eletronica.contract.ts";
import { formatDocumentValidationUrlForDisplay } from "../document-validation/document-validation.url.ts";
import {
  signatureStampPlacementToVisibleBottomLeftRect,
  signatureStampVisibleSpaceToPdfMatrix,
  type SignatureStampPdfBox,
} from "./signature-stamp-placement.ts";
import {
  getSignatureStampTemplateElementVisualBoundsForSurface,
} from "./signature-stamp-template.ts";
import type {
  ElectronicSignatureStampTemplateElement,
  ElectronicSignatureStampTemplateHiddenElementId,
  ElectronicSignatureStampTemplateTextElement,
  ElectronicSignatureStampTemplateV1,
  InspectedPdfPage,
  PreparedSignatureStamp,
} from "./pdf-document-signature.types.ts";
import {
  assertFontCanEncode,
  drawRoundedRectangle,
  STAMP_BLUE,
  STAMP_NAVY,
  STAMP_WHITE,
} from "./pdf-document-signature.drawing.ts";
import { stampRoleChip, stampRoleLabel } from "./pdf-document-signature.roles.ts";
import { toPlacementContract } from "./pdf-document-signature.validation.ts";

const STAMP_TEMPLATE_COORDINATE_SCALE = 100_000;
const STAMP_TEMPLATE_COLOR_PATTERN = /^#[0-9A-F]{6}$/u;

interface TemplateStampFonts {
  HELVETICA: PDFFont;
  HELVETICA_BOLD: PDFFont;
  HELVETICA_OBLIQUE: PDFFont;
  HELVETICA_BOLD_OBLIQUE: PDFFont;
  COURIER: PDFFont;
  COURIER_BOLD: PDFFont;
  COURIER_OBLIQUE: PDFFont;
  COURIER_BOLD_OBLIQUE: PDFFont;
}

interface TemplateStampRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const templateHexColorToRgb = (value: string) => {
  if (!STAMP_TEMPLATE_COLOR_PATTERN.test(value)) {
    throw new Error("A cor do elemento do template global é inválida.");
  }
  return rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );
};

const templateElementToVisibleRect = (
  stampRect: SignatureStampPdfBox,
  element: ElectronicSignatureStampTemplateElement,
): TemplateStampRect => {
  const visualBounds = getSignatureStampTemplateElementVisualBoundsForSurface(
    element,
    stampRect.width,
    stampRect.height,
  );
  const x = stampRect.x +
    stampRect.width * visualBounds.xBp / STAMP_TEMPLATE_COORDINATE_SCALE;
  const top = stampRect.y + stampRect.height -
    stampRect.height * visualBounds.yBp / STAMP_TEMPLATE_COORDINATE_SCALE;
  const width = stampRect.width * visualBounds.widthBp /
    STAMP_TEMPLATE_COORDINATE_SCALE;
  const height = stampRect.height * visualBounds.heightBp /
    STAMP_TEMPLATE_COORDINATE_SCALE;
  return { x, y: top - height, width, height };
};

const templateTextLines = (
  element: ElectronicSignatureStampTemplateTextElement,
  stamp: PreparedSignatureStamp,
) => {
  const label = element.style.label;
  switch (element.binding) {
    case "SIGNER_ROLE":
      return [stampRoleChip(stamp.role)];
    case "DISPLAY_TITLE":
      return [ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE];
    case "SIGNER_NAME":
      return [stamp.signerName];
    case "SIGNED_AT": {
      const visibleSignedAt = stamp.formattedSignedAt.replace(
        /\s+\([^)]*\)$/u,
        "",
      );
      return [`${label}${visibleSignedAt}`];
    }
    case "SIGNER_CPF_MASKED":
      return [`${label}${stamp.signerCpfMasked}`];
    case "SIGNATURE_HASH":
      return [
        `${label}${stamp.signatureHash.slice(0, 32)}`,
        stamp.signatureHash.slice(32),
      ];
    case "VERIFICATION_CODE":
      if (element.widthBp >= 40_000 && element.heightBp <= 10_000) {
        return [stamp.verificationCode];
      }
      return [
        "CÓD. VALIDAÇÃO",
        stamp.verificationCode.slice(0, 20),
        stamp.verificationCode.slice(20),
      ];
    case "VERIFICATION_URL": {
      const displayBaseUrl = formatDocumentValidationUrlForDisplay(
        stamp.verificationUrl,
      );
      if (element.widthBp >= 40_000 && element.heightBp <= 16_000) {
        return [`${label}${displayBaseUrl}`];
      }
      return [
        label.trim(),
        displayBaseUrl,
      ];
    }
  }
};

const resolveTemplateTextSize = (
  font: PDFFont,
  lines: readonly string[],
  elementRect: TemplateStampRect,
  configuredSize: number,
  label: string,
) => {
  const minimumSize = 3.2;
  if (configuredSize < minimumSize) {
    throw new Error(`${label} ficou menor que o limite físico de leitura.`);
  }
  lines.forEach((line) => assertFontCanEncode(font, line, label));
  let size = configuredSize;
  const fits = (candidate: number) => {
    const lineHeight = candidate * 1.14;
    return lines.length * lineHeight <= elementRect.height + 0.001 &&
      lines.every((line) =>
        font.widthOfTextAtSize(line, candidate) <= elementRect.width + 0.001
      );
  };
  while (size > minimumSize && !fits(size)) {
    size = Math.max(minimumSize, size - 0.1);
  }
  if (!fits(size)) {
    throw new Error(
      `${label} não cabe integralmente no elemento configurado do carimbo.`,
    );
  }
  return size;
};

const drawTemplateText = (
  page: PDFPage,
  stampRect: SignatureStampPdfBox,
  element: ElectronicSignatureStampTemplateTextElement,
  stamp: PreparedSignatureStamp,
  fonts: TemplateStampFonts,
) => {
  const rect = templateElementToVisibleRect(stampRect, element);
  const font = fonts[element.style.font];
  const lines = templateTextLines(element, stamp);
  const configuredSize = stampRect.height * element.style.fontSizeBp /
    STAMP_TEMPLATE_COORDINATE_SCALE;
  const size = resolveTemplateTextSize(
    font,
    lines,
    rect,
    configuredSize,
    `O texto ${element.id}`,
  );
  const lineHeight = size * 1.14;
  const firstBaseline = rect.y + rect.height - size;
  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    const x = element.style.align === "CENTER"
      ? rect.x + (rect.width - lineWidth) / 2
      : element.style.align === "RIGHT"
      ? rect.x + rect.width - lineWidth
      : rect.x;
    page.drawText(line, {
      x,
      y: firstBaseline - lineHeight * index,
      size,
      font,
      color: templateHexColorToRgb(element.style.color),
    });
  });
};

export const drawTemplateStamp = ({
  page,
  geometry,
  stamp,
  template,
  fonts,
  image,
  qrImage,
}: {
  page: PDFPage;
  geometry: InspectedPdfPage;
  stamp: PreparedSignatureStamp;
  template: ElectronicSignatureStampTemplateV1;
  fonts: TemplateStampFonts;
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  qrImage: Awaited<ReturnType<PDFDocument["embedPng"]>>;
}) => {
  const stampRect = signatureStampPlacementToVisibleBottomLeftRect(
    toPlacementContract(stamp),
    geometry,
  );
  const matrix = signatureStampVisibleSpaceToPdfMatrix(geometry);
  const radius = Math.max(3, Math.min(7, stampRect.height * 0.065));
  const inset = Math.max(1.2, Math.min(2.4, stampRect.height * 0.022));

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      matrix.a,
      matrix.b,
      matrix.c,
      matrix.d,
      matrix.e,
      matrix.f,
    ),
  );
  drawRoundedRectangle(page, {
    ...stampRect,
    radius,
    color: STAMP_WHITE,
    borderColor: STAMP_NAVY,
    borderWidth: 1.05,
  });
  drawRoundedRectangle(page, {
    x: stampRect.x + inset,
    y: stampRect.y + inset,
    width: stampRect.width - inset * 2,
    height: stampRect.height - inset * 2,
    radius: Math.max(1.5, radius - inset),
    borderColor: STAMP_BLUE,
    borderWidth: 0.35,
  });

  template.elements.forEach((element) => {
    if (
      template.hiddenElementIds?.includes(
        element.id as ElectronicSignatureStampTemplateHiddenElementId,
      )
    ) {
      return;
    }
    const rect = templateElementToVisibleRect(stampRect, element);
    if (element.kind === "TEXT") {
      drawTemplateText(page, stampRect, element, stamp, fonts);
      return;
    }
    if (element.kind === "IMAGE") {
      const scale = Math.min(
        rect.width / image.width,
        rect.height / image.height,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      if (width < 1 || height < 1) {
        throw new Error(
          "A imagem livre do carimbo ficou menor que o limite físico.",
        );
      }
      page.drawImage(image, {
        x: rect.x + (rect.width - width) / 2,
        y: rect.y + (rect.height - height) / 2,
        width,
        height,
        opacity: element.style.opacityBp / STAMP_TEMPLATE_COORDINATE_SCALE,
      });
      return;
    }
    if (element.kind === "QR") {
      const size = Math.min(rect.width, rect.height);
      if (size < 24) {
        throw new Error(
          `O QR individual do carimbo de ${
            stampRoleLabel(stamp.role)
          } ficou menor que 24 pt.`,
        );
      }
      page.drawRectangle({
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
        color: STAMP_WHITE,
      });
      page.drawImage(qrImage, {
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
      });
      return;
    }
    const thickness = stampRect.height * element.style.widthBp /
      STAMP_TEMPLATE_COORDINATE_SCALE;
    if (thickness < 0.1) {
      throw new Error("A linha do template ficou menor que o limite físico.");
    }
    const color = templateHexColorToRgb(element.style.color);
    if (rect.height > rect.width) {
      page.drawLine({
        start: { x: rect.x + rect.width / 2, y: rect.y },
        end: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
        thickness,
        color,
      });
    } else {
      page.drawLine({
        start: { x: rect.x, y: rect.y + rect.height / 2 },
        end: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        thickness,
        color,
      });
    }
  });
  page.pushOperators(popGraphicsState());
};

