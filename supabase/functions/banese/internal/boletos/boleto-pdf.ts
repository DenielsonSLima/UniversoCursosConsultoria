import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import {
  type BaneseBoletoDocumentInput,
  type BaneseDocumentBranding,
  normalizeBaneseBoletoDocument,
} from "../types.ts";
import {
  drawBaneseCompanyHeader,
  embedBaneseBrandAssets,
} from "../pdf/branding.ts";
import {
  BANESE_PDF_COLORS,
  BANESE_PDF_PAGE,
  baneseDocumentFonts,
  drawBaneseText,
} from "../pdf/primitives.ts";
import { drawBaneseBoletoSlip } from "./boleto-layout.ts";

export type BaneseBoletoPdfOptions = {
  branding?: BaneseDocumentBranding;
};

export const buildBaneseBoletoPdf = async (
  rawInput: BaneseBoletoDocumentInput,
  options: BaneseBoletoPdfOptions = {},
) => {
  const input = normalizeBaneseBoletoDocument(rawInput);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Boleto Banese ${input.documentNumber}`);
  pdf.setSubject("Cobrança bancária Banese");
  pdf.setCreator("Universo Cursos e Consultoria");
  const page = pdf.addPage([BANESE_PDF_PAGE.width, BANESE_PDF_PAGE.height]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: BANESE_PDF_PAGE.width,
    height: BANESE_PDF_PAGE.height,
    color: rgb(1, 1, 1),
  });
  const fonts = await baneseDocumentFonts(pdf);
  const assets = await embedBaneseBrandAssets(pdf, options.branding);
  const contentWidth = BANESE_PDF_PAGE.width - BANESE_PDF_PAGE.margin * 2;

  drawBaneseCompanyHeader(page, fonts, input, {
    x: BANESE_PDF_PAGE.margin,
    y: 807,
    width: contentWidth,
    height: 28,
  }, assets);

  if (input.environment === "sandbox") {
    page.drawRectangle({
      x: 200,
      y: 813,
      width: 178,
      height: 16,
      color: rgb(0.99, 0.93, 0.93),
      borderColor: BANESE_PDF_COLORS.sandbox,
      borderWidth: 0.5,
    });
    drawBaneseText(
      page,
      fonts,
      "HOMOLOGAÇÃO - SEM VALIDADE",
      214,
      818,
      {
        size: 7,
        bold: true,
        color: BANESE_PDF_COLORS.sandbox,
      },
    );
  }

  await drawBaneseBoletoSlip(
    page,
    pdf,
    fonts,
    input,
    {
      x: BANESE_PDF_PAGE.margin,
      y: 485,
      width: contentWidth,
      height: 315,
    },
    false,
    assets,
  );

  page.drawLine({
    start: { x: BANESE_PDF_PAGE.margin, y: 472 },
    end: { x: BANESE_PDF_PAGE.width - BANESE_PDF_PAGE.margin, y: 472 },
    thickness: 0.65,
    dashArray: [4, 3],
    color: BANESE_PDF_COLORS.gray,
  });
  drawBaneseText(
    page,
    fonts,
    "Recibo do pagador / Ficha de compensacao",
    380,
    476,
    { size: 5.5, color: BANESE_PDF_COLORS.gray },
  );

  await drawBaneseBoletoSlip(
    page,
    pdf,
    fonts,
    input,
    {
      x: BANESE_PDF_PAGE.margin,
      y: 65,
      width: contentWidth,
      height: 395,
    },
    true,
    assets,
  );

  drawBaneseText(page, fonts, "Autenticação mecânica", 438, 52, {
    size: 6,
    color: BANESE_PDF_COLORS.gray,
  });
  return pdf.save();
};
