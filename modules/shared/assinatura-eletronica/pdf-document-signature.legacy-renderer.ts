import {
  concatTransformationMatrix,
  type PDFFont,
  type PDFDocument,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
} from "pdf-lib";
import {
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  type ElectronicSignatureStampContentLayout,
  type ElectronicSignatureStampLayout,
} from "./assinatura-eletronica.contract.ts";
import { formatDocumentValidationUrlForDisplay } from "../document-validation/document-validation.url.ts";
import {
  signatureStampPlacementToVisibleBottomLeftRect,
  signatureStampVisibleSpaceToPdfMatrix,
} from "./signature-stamp-placement.ts";
import type {
  InspectedPdfPage,
  PreparedSignatureStamp,
} from "./pdf-document-signature.types.ts";
import {
  drawFittedText,
  drawLabeledStampLine,
  drawRoundedRectangle,
  resolveFittedTextSize,
  STAMP_BLUE,
  STAMP_MUTED,
  STAMP_NAVY,
  STAMP_RULE,
  STAMP_TEXT,
  STAMP_WHITE,
} from "./pdf-document-signature.drawing.ts";
import { stampRoleChip, stampRoleLabel } from "./pdf-document-signature.roles.ts";
import { toPlacementContract } from "./pdf-document-signature.validation.ts";

export const drawStamp = ({
  page,
  geometry,
  stamp,
  layout,
  contentLayout,
  regularFont,
  boldFont,
  monoFont,
  image,
  qrImage,
}: {
  page: PDFPage;
  geometry: InspectedPdfPage;
  stamp: PreparedSignatureStamp;
  layout: ElectronicSignatureStampLayout;
  contentLayout: ElectronicSignatureStampContentLayout;
  regularFont: PDFFont;
  boldFont: PDFFont;
  monoFont: PDFFont;
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  qrImage: Awaited<ReturnType<PDFDocument["embedPng"]>>;
}) => {
  const placement = toPlacementContract(stamp);
  const rect = signatureStampPlacementToVisibleBottomLeftRect(
    placement,
    geometry,
  );
  const matrix = signatureStampVisibleSpaceToPdfMatrix(geometry);
  const compact = layout === "COMPACT";
  const narrow = rect.width < 220;
  const padding = Math.max(
    narrow ? 2.8 : 3.4,
    Math.min(5.5, rect.height * 0.055, rect.width * 0.014),
  );
  const borderRadius = Math.max(3.5, Math.min(6, rect.height * 0.07));
  const innerBorderInset = Math.max(1.6, Math.min(2.4, rect.height * 0.025));
  const roleChipHeight = Math.max(
    narrow ? 6 : 7.2,
    Math.min(narrow ? 7.2 : 8.8, rect.height * 0.105),
  );
  const sealBaseSize = Math.min(
    rect.height * (narrow ? 0.5 : compact ? 0.56 : 0.57),
    rect.width * (narrow ? 0.12 : compact ? 0.145 : 0.15),
  );
  const sealSize = sealBaseSize * contentLayout.sealScalePercent / 100;
  const sealMaximum = rect.height - padding * 2 - roleChipHeight - 2;
  if (sealSize < (narrow ? 14 : 20) || sealSize > sealMaximum) {
    throw new Error(
      `O selo do carimbo de ${
        stampRoleLabel(stamp.role)
      } excede a área segura.`,
    );
  }
  const qrBaseSize = Math.min(
    rect.height * (narrow ? 0.45 : compact ? 0.54 : 0.57),
    rect.width * (narrow ? 0.12 : compact ? 0.14 : 0.15),
  );
  const qrSize = qrBaseSize * contentLayout.qrScalePercent / 100;
  const qrCaptionHeight = Math.max(6.4, Math.min(7.5, rect.height * 0.085));
  const qrMaximum = rect.height - padding * 2 - qrCaptionHeight;
  if (qrSize < (narrow ? 17 : 20) || qrSize > qrMaximum) {
    throw new Error(
      `O QR individual do carimbo de ${
        stampRoleLabel(stamp.role)
      } excede a área segura.`,
    );
  }

  const roleChipText = stampRoleChip(stamp.role);
  const roleChipTextSize = Math.max(
    narrow ? 3 : 3.8,
    Math.min(narrow ? 3.7 : 4.5, roleChipHeight * 0.5),
  );
  const roleChipWidth = Math.max(
    narrow ? 26 : 37,
    boldFont.widthOfTextAtSize(roleChipText, roleChipTextSize) +
      (narrow ? 4 : 8),
  );
  const sealColumnWidth = Math.max(sealSize, roleChipWidth);
  const sealX = rect.x + padding + (sealColumnWidth - sealSize) / 2;
  const sealAreaBottom = rect.y + padding + roleChipHeight + 2;
  const sealAreaHeight = rect.height - padding * 2 - roleChipHeight - 2;
  const sealY = sealAreaBottom + (sealAreaHeight - sealSize) / 2;
  const roleChipX = rect.x + padding + (sealColumnWidth - roleChipWidth) / 2;
  const roleChipY = rect.y + padding;

  const qrX = rect.x + rect.width - padding - qrSize;
  const qrY = rect.y + padding + qrCaptionHeight;
  const dividerX = qrX - padding * 0.8;
  const iconX = rect.x + padding + sealColumnWidth + padding;
  const iconSize = Math.max(
    narrow ? 4.5 : 5.8,
    Math.min(narrow ? 5.2 : 7.2, rect.height * 0.082),
  );
  const textX = iconX + iconSize + (narrow ? 1.6 : 2.4);
  const textRight = dividerX - padding * 0.8;
  const textWidth = textRight - textX;
  const titleWidth = textRight - iconX;
  if (textWidth < (narrow ? 88 : 105) || titleWidth < (narrow ? 94 : 115)) {
    throw new Error(
      `O carimbo de ${
        stampRoleLabel(stamp.role)
      } não possui largura segura para os dados e o QR individual.`,
    );
  }
  const titleSize = resolveFittedTextSize(
    boldFont,
    ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
    {
      maxWidth: titleWidth,
      maximumSize: narrow
        ? Math.max(5.6, Math.min(6.4, rect.height * 0.08))
        : Math.max(7.4, Math.min(9, rect.height * 0.105)),
      minimumSize: narrow ? 4.8 : 5.8,
      label: "O título visual do carimbo",
    },
  );
  const titleX = iconX + (
        titleWidth - boldFont.widthOfTextAtSize(
          ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
          titleSize,
        )
      ) / 2;
  const titleY = rect.y + rect.height - padding - titleSize;
  const titleRuleY = titleY - Math.max(3, titleSize * 0.42);
  const firstLineY = titleRuleY - Math.max(7.1, rect.height * 0.085);
  const minimumTextBottom = rect.y + padding + 1.5;
  const lineSpacingBase = Math.min(
    7.3,
    (firstLineY - minimumTextBottom) / (5.5 * 1.05),
  );
  const lineStep = lineSpacingBase * contentLayout.lineSpacingPercent / 100;
  const lastLineY = firstLineY - lineStep * 5.5;
  const minimumLineStep = narrow || rect.height < 65 ? 4.8 : 5.6;
  if (lineStep < minimumLineStep || lastLineY < minimumTextBottom) {
    throw new Error(
      `O espaçamento das linhas do carimbo de ${
        stampRoleLabel(stamp.role)
      } não é legível.`,
    );
  }

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
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    radius: borderRadius,
    color: STAMP_WHITE,
    borderColor: STAMP_NAVY,
    borderWidth: 1.05,
  });
  drawRoundedRectangle(page, {
    x: rect.x + innerBorderInset,
    y: rect.y + innerBorderInset,
    width: rect.width - innerBorderInset * 2,
    height: rect.height - innerBorderInset * 2,
    radius: Math.max(2, borderRadius - innerBorderInset),
    borderColor: STAMP_BLUE,
    borderWidth: 0.35,
  });

  const sealCenterX = sealX + sealSize / 2;
  const sealCenterY = sealY + sealSize / 2;
  page.drawCircle({
    x: sealCenterX,
    y: sealCenterY,
    size: sealSize / 2,
    color: STAMP_WHITE,
    borderColor: STAMP_NAVY,
    borderWidth: Math.max(0.7, sealSize * 0.018),
  });
  page.drawCircle({
    x: sealCenterX,
    y: sealCenterY,
    size: sealSize * 0.43,
    borderColor: STAMP_BLUE,
    borderWidth: Math.max(0.35, sealSize * 0.009),
  });
  const sealImageSize = sealSize * 0.7;
  page.drawImage(image, {
    x: sealCenterX - sealImageSize / 2,
    y: sealCenterY - sealImageSize / 2,
    width: sealImageSize,
    height: sealImageSize,
  });
  drawRoundedRectangle(page, {
    x: roleChipX,
    y: roleChipY,
    width: roleChipWidth,
    height: roleChipHeight,
    radius: roleChipHeight / 2,
    color: STAMP_NAVY,
  });
  page.drawText(roleChipText, {
    x: roleChipX + (
          roleChipWidth - boldFont.widthOfTextAtSize(
            roleChipText,
            roleChipTextSize,
          )
        ) / 2,
    y: roleChipY + (roleChipHeight - roleChipTextSize) / 2 + 0.6,
    size: roleChipTextSize,
    font: boldFont,
    color: STAMP_WHITE,
  });

  page.drawLine({
    start: { x: dividerX, y: rect.y + padding },
    end: {
      x: dividerX,
      y: rect.y + rect.height - padding,
    },
    thickness: 0.45,
    color: STAMP_RULE,
  });
  page.drawRectangle({
    x: qrX - 0.8,
    y: qrY - 0.8,
    width: qrSize + 1.6,
    height: qrSize + 1.6,
    color: STAMP_WHITE,
  });
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });
  const stackedQrCaption = qrSize < 36;
  const qrCaptionLines = stackedQrCaption
    ? ["VALIDAÇÃO", "INDIVIDUAL"]
    : ["VALIDAÇÃO INDIVIDUAL"];
  const qrCaptionSize = Math.min(
    ...qrCaptionLines.map((line) =>
      resolveFittedTextSize(boldFont, line, {
        maxWidth: qrSize + padding,
        maximumSize: stackedQrCaption ? 2.9 : 3.7,
        minimumSize: stackedQrCaption ? 2.4 : 3.1,
        label: "A legenda do QR individual",
      })
    ),
  );
  qrCaptionLines.forEach((line, index) => {
    page.drawText(line, {
      x: qrX + (
            qrSize - boldFont.widthOfTextAtSize(line, qrCaptionSize)
          ) / 2,
      y: rect.y + padding + (qrCaptionLines.length - index - 1) *
          (qrCaptionSize + 0.2) +
        0.5,
      size: qrCaptionSize,
      font: boldFont,
      color: STAMP_NAVY,
    });
  });

  page.drawText(ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE, {
    x: titleX,
    y: titleY,
    size: titleSize,
    font: boldFont,
    color: STAMP_NAVY,
  });
  const titleRuleCenter = iconX + titleWidth / 2;
  page.drawLine({
    start: { x: iconX, y: titleRuleY },
    end: { x: titleRuleCenter - 3, y: titleRuleY },
    thickness: 0.45,
    color: STAMP_NAVY,
  });
  page.drawCircle({
    x: titleRuleCenter,
    y: titleRuleY,
    size: 1.05,
    color: STAMP_BLUE,
  });
  page.drawLine({
    start: { x: titleRuleCenter + 3, y: titleRuleY },
    end: { x: textRight, y: titleRuleY },
    thickness: 0.45,
    color: STAMP_NAVY,
  });

  drawLabeledStampLine(page, {
    icon: "PERSON",
    iconX,
    y: firstLineY,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "",
    value: stamp.signerName,
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(6.8, lineStep * 0.9),
    minimumSize: narrow ? 3.8 : 4.8,
    color: STAMP_TEXT,
    errorLabel: "O nome do signatário",
  });
  drawLabeledStampLine(page, {
    icon: "IDENTITY",
    iconX,
    y: firstLineY - lineStep * 0.95,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "CPF:",
    value: stamp.signerCpfMasked,
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(5.7, lineStep * 0.78),
    minimumSize: narrow ? 3.6 : 4.5,
    color: STAMP_MUTED,
    errorLabel: "O CPF mascarado do signatário",
  });
  const visibleSignedAt = stamp.formattedSignedAt.replace(
    /\s+\([^)]*\)$/u,
    "",
  );
  drawLabeledStampLine(page, {
    icon: "CALENDAR",
    iconX,
    y: firstLineY - lineStep * 1.9,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "Data:",
    value: visibleSignedAt,
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(5.35, lineStep * 0.74),
    minimumSize: narrow ? 3.6 : 4.5,
    color: STAMP_MUTED,
    errorLabel: "A data da assinatura",
  });
  drawLabeledStampLine(page, {
    icon: "HASH",
    iconX,
    y: firstLineY - lineStep * 2.95,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "SHA-256:",
    value: stamp.signatureHash.slice(0, 32),
    labelFont: boldFont,
    valueFont: monoFont,
    maximumSize: Math.min(4.8, lineStep * 0.66),
    minimumSize: narrow ? 3.4 : 4.5,
    color: STAMP_TEXT,
    errorLabel: "O hash individual da assinatura",
  });
  const minimumTechnicalSize = narrow ? 3.4 : 4.5;
  const hashLabelWidth = boldFont.widthOfTextAtSize(
    "SHA-256:",
    minimumTechnicalSize,
  ) + 1.8;
  drawFittedText(page, monoFont, stamp.signatureHash.slice(32), {
    x: textX + hashLabelWidth,
    y: firstLineY - lineStep * 3.57,
    maxWidth: textWidth - hashLabelWidth,
    maximumSize: Math.min(4.8, lineStep * 0.66),
    minimumSize: minimumTechnicalSize,
    color: STAMP_TEXT,
    label: "A continuação do hash individual da assinatura",
  });
  drawLabeledStampLine(page, {
    icon: "SHIELD",
    iconX,
    y: firstLineY - lineStep * 4.55,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "SIG:",
    value: stamp.verificationCode,
    labelFont: boldFont,
    valueFont: monoFont,
    maximumSize: Math.min(4.7, lineStep * 0.65),
    minimumSize: narrow ? 3.3 : 4.5,
    color: STAMP_BLUE,
    errorLabel: "O código individual de verificação",
  });
  drawLabeledStampLine(page, {
    icon: "GLOBE",
    iconX,
    y: firstLineY - lineStep * 5.5,
    iconSize,
    textX,
    maxWidth: textWidth,
    label: "Verifique em:",
    value: formatDocumentValidationUrlForDisplay(stamp.verificationUrl),
    labelFont: boldFont,
    valueFont: regularFont,
    maximumSize: Math.min(4.7, lineStep * 0.65),
    minimumSize: narrow ? 3.4 : 4.3,
    color: STAMP_BLUE,
    errorLabel: "A URL individual de verificação",
  });
  page.pushOperators(popGraphicsState());
};
