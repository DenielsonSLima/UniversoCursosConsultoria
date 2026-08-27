import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
  StandardFonts,
} from "npm:pdf-lib@1.17.1";
import { buildBaneseInterleaved2of5 } from "../barcode.ts";
import type { BaneseBoletoDocumentInput } from "../types.ts";

export const BANESE_PDF_PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 34,
} as const;

export type BaneseDocumentFonts = { regular: PDFFont; bold: PDFFont };
export type BaneseDocumentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const BANESE_PDF_COLORS = {
  black: rgb(0.04, 0.06, 0.08),
  gray: rgb(0.32, 0.36, 0.4),
  lightGray: rgb(0.78, 0.8, 0.82),
  green: rgb(0.04, 0.48, 0.25),
  darkGreen: rgb(0.01, 0.31, 0.2),
  navy: rgb(0.03, 0.06, 0.38),
  lightGreen: rgb(0.93, 0.97, 0.94),
  lightBlue: rgb(0.95, 0.96, 0.99),
  sandbox: rgb(0.75, 0.08, 0.08),
  white: rgb(1, 1, 1),
};

export const fitBaneseText = (
  textValue: unknown,
  font: PDFFont,
  size: number,
  maxWidth: number,
) => {
  const text = String(textValue || "").replace(/\s+/g, " ").trim();
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let output = text;
  while (
    output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth
  ) {
    output = output.slice(0, -1);
  }
  return `${output.trim()}...`;
};

export const fitBaneseFontSize = (
  text: string,
  font: PDFFont,
  preferredSize: number,
  minimumSize: number,
  maxWidth: number,
  errorMessage = "Linha digitavel Banese nao cabe integralmente no documento.",
) => {
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.2;
  }
  if (font.widthOfTextAtSize(text, size) > maxWidth) {
    throw new Error(errorMessage);
  }
  return size;
};

export const drawBaneseText = (
  page: PDFPage,
  fonts: BaneseDocumentFonts,
  textValue: unknown,
  x: number,
  y: number,
  options: {
    size?: number;
    bold?: boolean;
    maxWidth?: number;
    color?: ReturnType<typeof rgb>;
  } = {},
) => {
  const size = options.size || 8;
  const font = options.bold ? fonts.bold : fonts.regular;
  const text = options.maxWidth
    ? fitBaneseText(textValue, font, size, options.maxWidth)
    : String(textValue || "");
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: options.color || BANESE_PDF_COLORS.black,
  });
};

export const drawBaneseBox = (
  page: PDFPage,
  fonts: BaneseDocumentFonts,
  box: BaneseDocumentBox,
  label: string,
  value: unknown,
  options: { bold?: boolean; alignRight?: boolean; valueSize?: number } = {},
) => {
  page.drawRectangle({
    ...box,
    borderColor: BANESE_PDF_COLORS.black,
    borderWidth: 0.55,
  });
  drawBaneseText(page, fonts, label, box.x + 3, box.y + box.height - 8, {
    size: 5.4,
    color: BANESE_PDF_COLORS.gray,
    maxWidth: box.width - 6,
  });
  const size = options.valueSize || 8;
  const font = options.bold ? fonts.bold : fonts.regular;
  const valueLines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, Math.floor((box.height - 12) / (size + 2))));
  const baseY = box.y + 5 + Math.max(0, valueLines.length - 1) * (size + 2);
  valueLines.forEach((line, index) => {
    const fitted = fitBaneseText(line, font, size, box.width - 7);
    const textWidth = font.widthOfTextAtSize(fitted, size);
    drawBaneseText(
      page,
      fonts,
      fitted,
      options.alignRight ? box.x + box.width - textWidth - 3 : box.x + 3,
      baseY - index * (size + 2),
      { size, bold: options.bold },
    );
  });
};

export const banesePartyAddress = (
  party: BaneseBoletoDocumentInput["payer"],
) => {
  const address = party.address;
  const cep = address.postalCode.replace(/(\d{5})(\d{3})/, "$1-$2");
  return `${address.street} - ${address.district} - ${address.city}/${address.state} - CEP ${cep}`;
};

export const drawBaneseImageContain = (
  page: PDFPage,
  image: PDFImage,
  box: BaneseDocumentBox,
  padding = 0,
) => {
  const availableWidth = Math.max(1, box.width - padding * 2);
  const availableHeight = Math.max(1, box.height - padding * 2);
  const scale = Math.min(
    availableWidth / image.width,
    availableHeight / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  });
};

export const drawBaneseBarcode = (
  page: PDFPage,
  barcodeValue: string,
  box: BaneseDocumentBox,
) => {
  const barcode = buildBaneseInterleaved2of5(barcodeValue);
  const totalWidth = barcode.width + barcode.quietZone * 2;
  if (totalWidth > box.width) {
    throw new Error(
      "Area fisica insuficiente para o codigo de barras Banese em modulo de 0,3 mm.",
    );
  }
  const startX = box.x + (box.width - barcode.width) / 2;
  for (const bar of barcode.bars) {
    page.drawRectangle({
      x: startX + bar.x,
      y: box.y,
      width: bar.width,
      height: box.height,
      color: BANESE_PDF_COLORS.black,
    });
  }
};

export const wrapBaneseText = (
  textValue: unknown,
  font: PDFFont,
  size: number,
  maxWidth: number,
) => {
  const text = String(textValue || "").trim();
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    const candidate = `${current}${character}`;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
};

export const wrapBaneseWords = (
  textValue: unknown,
  font: PDFFont,
  size: number,
  maxWidth: number,
) => {
  const lines: string[] = [];
  let current = "";
  for (const word of String(textValue || "").trim().split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.flatMap((line) =>
    font.widthOfTextAtSize(line, size) <= maxWidth
      ? [line]
      : wrapBaneseText(line, font, size, maxWidth)
  );
};

export const baneseDocumentFonts = async (
  pdf: PDFDocument,
): Promise<BaneseDocumentFonts> => ({
  regular: await pdf.embedFont(StandardFonts.Helvetica),
  bold: await pdf.embedFont(StandardFonts.HelveticaBold),
});
