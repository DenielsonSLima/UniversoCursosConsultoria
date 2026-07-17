import { PDFDocument, type PDFPage } from "npm:pdf-lib@1.17.1";
import {
  type BaneseBoletoDocumentInput,
  formatBaneseDocumentAmount,
  formatBaneseDocumentDate,
  formatBaneseDocumentId,
  normalizeBaneseBoletoDocument,
} from "../types.ts";
import {
  type BaneseDocumentBrandAssets,
  drawBaneseBankHeader as drawBrandHeader,
  drawBanesePixPanel as drawPixPanel,
  embedBanesePixQr as embedPixQr,
} from "../pdf/branding.ts";
import {
  BANESE_PDF_COLORS as COLORS,
  type BaneseDocumentBox as Box,
  type BaneseDocumentFonts as Fonts,
  drawBaneseBarcode as drawBarcode,
  drawBaneseBox as drawBox,
  drawBaneseImageContain as drawImageContain,
  drawBaneseText as drawText,
} from "../pdf/primitives.ts";
import { presentBaneseFinancialTerms } from "../pdf/financial-terms.ts";

export const drawBaneseCarnetSlip = async (
  page: PDFPage,
  pdf: PDFDocument,
  fonts: Fonts,
  rawInput: BaneseBoletoDocumentInput,
  box: Box,
  assets: BaneseDocumentBrandAssets,
) => {
  const input = normalizeBaneseBoletoDocument(rawInput);
  const stubWidth = Math.min(122, box.width * 0.23);
  const separation = 8;
  const bodyX = box.x + stubWidth + separation;
  const bodyWidth = box.width - stubWidth - separation;
  const headerHeight = 28;

  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: stubWidth,
    height: box.height,
    color: COLORS.lightBlue,
    borderColor: COLORS.navy,
    borderWidth: 0.7,
  });
  if (assets.companyLogo) {
    drawImageContain(page, assets.companyLogo, {
      x: box.x + 6,
      y: box.y + box.height - 34,
      width: stubWidth - 12,
      height: 28,
    });
  } else {
    drawText(page, fonts, "UNIVERSO", box.x + 8, box.y + box.height - 24, {
      size: 12,
      bold: true,
      color: COLORS.navy,
    });
  }
  drawText(
    page,
    fonts,
    "RECIBO DO PAGADOR",
    box.x + 7,
    box.y + box.height - 44,
    { size: 6, bold: true, color: COLORS.navy },
  );

  const stubField = (
    label: string,
    value: string,
    top: number,
    height: number,
    bold = false,
  ) => {
    drawBox(
      page,
      fonts,
      { x: box.x + 6, y: top - height, width: stubWidth - 12, height },
      label,
      value,
      { valueSize: 6.5, bold },
    );
    return top - height;
  };
  let stubTop = box.y + box.height - 49;
  stubTop = stubField(
    "Parcela / Documento",
    input.documentNumber,
    stubTop,
    28,
    true,
  );
  stubTop = stubField(
    "Vencimento",
    formatBaneseDocumentDate(input.dueDate),
    stubTop,
    28,
    true,
  );
  stubTop = stubField(
    "Valor do documento",
    `R$ ${formatBaneseDocumentAmount(input.amount)}`,
    stubTop,
    28,
    true,
  );
  stubTop = stubField("Nosso Número", input.ourNumber, stubTop, 27, true);
  stubTop = stubField(
    "Agência / Conta",
    `${input.beneficiary.agency} / ${input.beneficiary.account}`,
    stubTop,
    27,
  );
  if (stubTop - box.y > 51) {
    stubField(
      "Pagador",
      input.payer.name,
      stubTop,
      Math.min(38, stubTop - box.y - 25),
    );
  }
  if (input.environment === "sandbox") {
    page.drawRectangle({
      x: box.x + 5,
      y: box.y + 5,
      width: stubWidth - 10,
      height: 17,
      color: COLORS.white,
      borderColor: COLORS.sandbox,
      borderWidth: 0.8,
    });
    drawText(page, fonts, "HOMOLOGAÇÃO - SEM VALIDADE", box.x + 8, box.y + 14, {
      size: 5.4,
      bold: true,
      color: COLORS.sandbox,
    });
    drawText(page, fonts, "NÃO PAGAR", box.x + 8, box.y + 7, {
      size: 5.2,
      bold: true,
      color: COLORS.sandbox,
    });
  }

  page.drawLine({
    start: { x: box.x + stubWidth + separation / 2, y: box.y },
    end: {
      x: box.x + stubWidth + separation / 2,
      y: box.y + box.height,
    },
    thickness: 0.55,
    dashArray: [3, 3],
    color: COLORS.gray,
  });
  drawBrandHeader(page, fonts, input, {
    x: bodyX,
    y: box.y + box.height - headerHeight,
    width: bodyWidth,
    height: headerHeight,
  }, assets);
  const contentTop = box.y + box.height - headerHeight;
  const rowHeight = 29;
  const leftWidth = bodyWidth * 0.72;
  drawBox(
    page,
    fonts,
    {
      x: bodyX,
      y: contentTop - rowHeight,
      width: leftWidth,
      height: rowHeight,
    },
    "Beneficiário",
    `${input.beneficiary.name} - ${
      formatBaneseDocumentId(input.beneficiary.document)
    }`,
    { bold: true, valueSize: 7 },
  );
  drawBox(
    page,
    fonts,
    {
      x: bodyX + leftWidth,
      y: contentTop - rowHeight,
      width: bodyWidth - leftWidth,
      height: rowHeight,
    },
    "Vencimento",
    formatBaneseDocumentDate(input.dueDate),
    { bold: true, alignRight: true },
  );
  drawBox(
    page,
    fonts,
    {
      x: bodyX,
      y: contentTop - rowHeight * 2,
      width: leftWidth,
      height: rowHeight,
    },
    "Pagador",
    `${input.payer.name} - ${formatBaneseDocumentId(input.payer.document)}`,
    { valueSize: 7 },
  );
  drawBox(
    page,
    fonts,
    {
      x: bodyX + leftWidth,
      y: contentTop - rowHeight * 2,
      width: bodyWidth - leftWidth,
      height: rowHeight,
    },
    "Valor",
    formatBaneseDocumentAmount(input.amount),
    { bold: true, alignRight: true },
  );
  drawBox(
    page,
    fonts,
    {
      x: bodyX,
      y: contentTop - rowHeight * 3,
      width: bodyWidth * 0.36,
      height: rowHeight,
    },
    "Número do documento",
    input.documentNumber,
    { valueSize: 7 },
  );
  drawBox(
    page,
    fonts,
    {
      x: bodyX + bodyWidth * 0.36,
      y: contentTop - rowHeight * 3,
      width: bodyWidth * 0.36,
      height: rowHeight,
    },
    "Nosso Número",
    input.ourNumber,
    { bold: true, valueSize: 7 },
  );
  drawBox(
    page,
    fonts,
    {
      x: bodyX + bodyWidth * 0.72,
      y: contentTop - rowHeight * 3,
      width: bodyWidth * 0.28,
      height: rowHeight,
    },
    "Agência/Conta",
    `${input.beneficiary.agency}/${input.beneficiary.account}`,
    { alignRight: true, valueSize: 7 },
  );
  const bankAreaY = box.y + 4;
  const pixQr = await embedPixQr(pdf, input);
  const middleY = bankAreaY + 62;
  const middleTop = contentTop - rowHeight * 3;
  const middleHeight = Math.max(58, middleTop - middleY);
  const pixWidth = Math.min(118, Math.max(92, bodyWidth * 0.29));
  const termsWidth = bodyWidth - pixWidth;
  const termsHeight = 31;
  const termsY = middleY + middleHeight - termsHeight;
  const financial = presentBaneseFinancialTerms(
    input.financialTerms || {
      nominalAmount: input.amount,
      dueDate: input.dueDate,
    },
  );
  const termFields = [
    { ...financial.discount, width: termsWidth * 0.42 },
    { ...financial.penalty, width: termsWidth * 0.28 },
    { ...financial.interest, width: termsWidth * 0.3 },
  ];
  let termX = bodyX;
  termFields.forEach((field) => {
    drawBox(
      page,
      fonts,
      { x: termX, y: termsY, width: field.width, height: termsHeight },
      field.label,
      field.value,
      { valueSize: 6.1, bold: true },
    );
    termX += field.width;
  });
  page.drawRectangle({
    x: bodyX,
    y: middleY,
    width: termsWidth,
    height: middleHeight - termsHeight,
    borderColor: COLORS.black,
    borderWidth: 0.55,
  });
  drawText(page, fonts, "Instruções", bodyX + 4, termsY - 9, {
    size: 5.2,
    color: COLORS.gray,
  });
  const instructions = input.instructions?.length
    ? input.instructions
    : ["Nao receber apos a data limite indicada pelo banco."];
  instructions.slice(0, 3).forEach((instruction, index) => {
    drawText(
      page,
      fonts,
      instruction,
      bodyX + 7,
      termsY - 21 - index * 9,
      { size: 6, maxWidth: bodyWidth - pixWidth - 14 },
    );
  });
  drawPixPanel(page, fonts, input, pixQr, {
    x: bodyX + bodyWidth - pixWidth,
    y: middleY,
    width: pixWidth,
    height: middleHeight,
  });
  drawBarcode(page, input.barcode, {
    x: bodyX,
    y: bankAreaY + 21,
    width: bodyWidth,
    height: 39,
  });
  drawText(page, fonts, input.barcode, bodyX + 6, bankAreaY + 7, {
    size: 6,
    bold: true,
    maxWidth: bodyWidth - 12,
  });
};
