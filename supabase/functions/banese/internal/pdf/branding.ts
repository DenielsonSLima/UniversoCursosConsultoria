import { PDFDocument, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";
import {
  type BaneseBoletoDocumentInput,
  type BaneseDocumentBranding,
  formatBaneseDigitableLine,
} from "../types.ts";
import { OFFICIAL_UNIVERSO_LOGO_BASE64 } from "../assets/universo-logo.ts";
import {
  BANESE_PDF_COLORS,
  type BaneseDocumentBox,
  type BaneseDocumentFonts,
  drawBaneseImageContain,
  drawBaneseText,
  fitBaneseFontSize,
  wrapBaneseWords,
} from "./primitives.ts";

export type BaneseDocumentBrandAssets = {
  bankLogo: PDFImage | null;
  companyLogo: PDFImage | null;
};

export const drawBaneseBankHeader = (
  page: PDFPage,
  fonts: BaneseDocumentFonts,
  input: BaneseBoletoDocumentInput,
  box: BaneseDocumentBox,
  assets: BaneseDocumentBrandAssets,
) => {
  const brandWidth = 116;
  const bankWidth = 58;
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: brandWidth,
    height: box.height,
    color: assets.bankLogo
      ? BANESE_PDF_COLORS.darkGreen
      : BANESE_PDF_COLORS.white,
    borderColor: BANESE_PDF_COLORS.black,
    borderWidth: 1,
  });
  if (assets.bankLogo) {
    drawBaneseImageContain(page, assets.bankLogo, {
      x: box.x + 5,
      y: box.y + 3,
      width: brandWidth - 10,
      height: box.height - 6,
    });
  } else {
    page.drawRectangle({
      x: box.x + 5,
      y: box.y + 5,
      width: 20,
      height: box.height - 10,
      color: BANESE_PDF_COLORS.green,
    });
    drawBaneseText(page, fonts, "Banese", box.x + 30, box.y + 8, {
      size: 15,
      bold: true,
      color: BANESE_PDF_COLORS.green,
    });
  }
  page.drawRectangle({
    x: box.x + brandWidth,
    y: box.y,
    width: bankWidth,
    height: box.height,
    borderColor: BANESE_PDF_COLORS.black,
    borderWidth: 1,
  });
  drawBaneseText(page, fonts, "047-7", box.x + brandWidth + 8, box.y + 9, {
    size: 13,
    bold: true,
  });
  page.drawRectangle({
    x: box.x + brandWidth + bankWidth,
    y: box.y,
    width: box.width - brandWidth - bankWidth,
    height: box.height,
    borderColor: BANESE_PDF_COLORS.black,
    borderWidth: 1,
  });
  const formattedLine = formatBaneseDigitableLine(input.digitableLine);
  const lineWidth = box.width - brandWidth - bankWidth - 14;
  const lineSize = fitBaneseFontSize(
    formattedLine,
    fonts.bold,
    10.4,
    5.8,
    lineWidth,
  );
  drawBaneseText(
    page,
    fonts,
    formattedLine,
    box.x + brandWidth + bankWidth + 7,
    box.y + 10,
    { size: lineSize, bold: true },
  );
};

export const drawBaneseDocumentTitle = (
  page: PDFPage,
  fonts: BaneseDocumentFonts,
  box: BaneseDocumentBox,
) => {
  page.drawRectangle({
    ...box,
    color: BANESE_PDF_COLORS.white,
    borderColor: BANESE_PDF_COLORS.lightGray,
    borderWidth: 0.5,
  });
  const title = "COBRANÇA EDUCACIONAL";
  const titleSize = 8;
  const titleWidth = fonts.bold.widthOfTextAtSize(title, titleSize);
  drawBaneseText(
    page,
    fonts,
    title,
    box.x + (box.width - titleWidth) / 2,
    box.y + 10,
    { size: titleSize, bold: true, color: BANESE_PDF_COLORS.navy },
  );
};

const base64Bytes = (value: string) => {
  const raw = value.replace(/^data:image\/(?:png|jpeg|jpg);base64,/i, "");
  const binary = atob(raw);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const embedImage = async (pdf: PDFDocument, value?: string | null) => {
  if (!value) return null;
  const bytes = base64Bytes(value);
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      throw new Error("Logo do documento Banese deve ser PNG ou JPEG valido.");
    }
  }
};

export const embedBaneseBrandAssets = async (
  pdf: PDFDocument,
  branding: BaneseDocumentBranding = {},
): Promise<BaneseDocumentBrandAssets> => ({
  bankLogo: await embedImage(pdf, branding.bankLogoBase64),
  companyLogo: await embedImage(
    pdf,
    branding.companyLogoBase64 || OFFICIAL_UNIVERSO_LOGO_BASE64,
  ),
});

export const embedBanesePixQr = async (
  pdf: PDFDocument,
  input: BaneseBoletoDocumentInput,
) => {
  if (input.environment !== "production" || !input.pix?.qrCodeBase64) {
    return null;
  }
  try {
    return await embedImage(pdf, input.pix.qrCodeBase64);
  } catch {
    throw new Error(
      "Imagem QR Pix retornada pelo Banese nao e PNG/JPEG valida.",
    );
  }
};

export const drawBanesePixPanel = (
  page: PDFPage,
  fonts: BaneseDocumentFonts,
  input: BaneseBoletoDocumentInput,
  pixQr: PDFImage | null,
  box: BaneseDocumentBox,
) => {
  const hasOfficialPix = input.environment === "production" &&
    Boolean(input.pix && pixQr);
  page.drawRectangle({
    ...box,
    color: hasOfficialPix
      ? BANESE_PDF_COLORS.lightGreen
      : BANESE_PDF_COLORS.lightBlue,
    borderColor: hasOfficialPix
      ? BANESE_PDF_COLORS.green
      : BANESE_PDF_COLORS.lightGray,
    borderWidth: 0.8,
  });
  drawBaneseText(
    page,
    fonts,
    "PAGUE COM PIX BANESE",
    box.x + 6,
    box.y + box.height - 12,
    {
      size: 6.3,
      bold: true,
      color: hasOfficialPix
        ? BANESE_PDF_COLORS.darkGreen
        : BANESE_PDF_COLORS.navy,
      maxWidth: box.width - 12,
    },
  );
  if (hasOfficialPix && input.pix && pixQr) {
    const qrSize = Math.min(110, box.width - 8, box.height - 22);
    page.drawImage(pixQr, {
      x: box.x + (box.width - qrSize) / 2,
      y: box.y + 4,
      width: qrSize,
      height: qrSize,
    });
    return;
  }

  const message = input.environment === "sandbox"
    ? "PIX INDISPONÍVEL NESTA HOMOLOGAÇÃO"
    : "AGUARDANDO PAYLOAD PIX OFICIAL DO BANESE";
  page.drawRectangle({
    x: box.x + 12,
    y: box.y + 24,
    width: box.width - 24,
    height: Math.max(28, box.height - 50),
    borderColor: BANESE_PDF_COLORS.lightGray,
    borderWidth: 0.7,
    borderDashArray: [3, 3],
  });
  const lines = wrapBaneseWords(message, fonts.bold, 6, box.width - 34).slice(
    0,
    4,
  );
  lines.forEach((line, index) => {
    const width = fonts.bold.widthOfTextAtSize(line, 6);
    drawBaneseText(
      page,
      fonts,
      line,
      box.x + (box.width - width) / 2,
      box.y + box.height / 2 + 5 - index * 8,
      { size: 6, bold: true, color: BANESE_PDF_COLORS.gray },
    );
  });
  drawBaneseText(
    page,
    fonts,
    "Nenhum QR fictício será gerado",
    box.x + 7,
    box.y + 7,
    {
      size: 4.8,
      color: BANESE_PDF_COLORS.gray,
      maxWidth: box.width - 14,
    },
  );
};
