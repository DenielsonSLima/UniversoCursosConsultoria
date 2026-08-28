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
  banesePartyAddress as partyAddress,
  drawBaneseBarcode as drawBarcode,
  drawBaneseBox as drawBox,
  drawBaneseCompanyLogo as drawCompanyLogo,
  drawBaneseText as drawText,
} from "../pdf/primitives.ts";
import { presentBaneseFinancialTerms } from "../pdf/financial-terms.ts";

export const BANESE_CARNET_FIXED_LAYOUT_V1 = Object.freeze({
  itemsPerPage: 3 as const,
  pageMargin: 14,
  pageGap: 9,
  slotVerticalInset: 4,
});

export const baneseCarnetPartyDetails = (
  party: BaneseBoletoDocumentInput["payer"],
) =>
  `${party.name} - ${formatBaneseDocumentId(party.document)}\n${
    partyAddress(party)
  }`;

export const baneseCarnetReceiptPartyDetails = (
  party: BaneseBoletoDocumentInput["payer"],
  documentLabel: "CPF" | "CNPJ",
) =>
  `${party.name}\n${documentLabel}: ${formatBaneseDocumentId(party.document)}`;

const splitBaneseCarnetReceiptName = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return [name.trim()];
  let splitAt = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ").length;
    const right = words.slice(index).join(" ").length;
    const difference = Math.abs(left - right);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      splitAt = index;
    }
  }
  return [
    words.slice(0, splitAt).join(" "),
    words.slice(splitAt).join(" "),
  ];
};

export const baneseCarnetReceiptInstitutionDetails = (
  party: BaneseBoletoDocumentInput["beneficiary"],
) =>
  [
    ...splitBaneseCarnetReceiptName(party.name),
    `CNPJ: ${formatBaneseDocumentId(party.document)}`,
  ].join("\n");

export const baneseCarnetInstallmentDocument = (
  documentNumber: string,
  installment: BaneseBoletoDocumentInput["installment"],
) =>
  installment
    ? `${documentNumber}   ${installment.current}/${installment.total}`
    : documentNumber;

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
    color: COLORS.white,
    borderColor: COLORS.navy,
    borderWidth: 0.7,
  });
  if (assets.companyLogo) {
    drawCompanyLogo(page, assets.companyLogo, {
      x: box.x + 3,
      y: box.y + box.height - 35,
      width: stubWidth - 6,
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
    valueSize = 6.5,
  ) => {
    drawBox(
      page,
      fonts,
      { x: box.x + 6, y: top - height, width: stubWidth - 12, height },
      label,
      value,
      { valueSize, bold },
    );
    return top - height;
  };
  let stubTop = box.y + box.height - 49;
  const innerX = box.x + 6;
  const innerWidth = stubWidth - 12;
  const halfStubWidth = innerWidth * 0.48;
  const dueWidth = halfStubWidth;

  // Separação em cards lado a lado: Parcela e Documento
  drawBox(
    page,
    fonts,
    { x: innerX, y: stubTop - 24, width: halfStubWidth, height: 24 },
    "Parcela",
    input.installment
      ? `${input.installment.current}/${input.installment.total}`
      : "1/1",
    { valueSize: 6.5, bold: true },
  );
  drawBox(
    page,
    fonts,
    {
      x: innerX + halfStubWidth,
      y: stubTop - 24,
      width: innerWidth - halfStubWidth,
      height: 24,
    },
    "Nº Documento",
    input.documentNumber,
    { valueSize: 6, bold: true },
  );
  stubTop -= 24;

  const dueValueHeight = 28;
  drawBox(
    page,
    fonts,
    {
      x: innerX,
      y: stubTop - dueValueHeight,
      width: halfStubWidth,
      height: dueValueHeight,
    },
    "Vencimento",
    formatBaneseDocumentDate(input.dueDate),
    { valueSize: 5.8, bold: true },
  );
  drawBox(
    page,
    fonts,
    {
      x: innerX + dueWidth,
      y: stubTop - dueValueHeight,
      width: innerWidth - dueWidth,
      height: dueValueHeight,
    },
    "Valor",
    `R$ ${formatBaneseDocumentAmount(input.amount)}`,
    { valueSize: 5.8, bold: true },
  );
  stubTop -= dueValueHeight;
  stubTop = stubField("Nosso Número", input.ourNumber, stubTop, 23, true);
  stubTop = stubField(
    "Pagador / CPF",
    baneseCarnetReceiptPartyDetails(input.payer, "CPF"),
    stubTop,
    31,
    false,
    5.7,
  );
  stubTop = stubField(
    "Instituição / CNPJ",
    baneseCarnetReceiptInstitutionDetails(input.beneficiary),
    stubTop,
    38,
    false,
    4.9,
  );
  const receiptBottom = input.environment === "sandbox"
    ? box.y + 22
    : box.y + 5;
  const receiptHeight = stubTop - receiptBottom;
  drawBox(
    page,
    fonts,
    {
      x: innerX,
      y: receiptBottom,
      width: innerWidth,
      height: receiptHeight,
    },
    "Recebido em caixa",
    "",
  );
  page.drawLine({
    start: { x: innerX + 10, y: receiptBottom + 13 },
    end: { x: innerX + innerWidth - 10, y: receiptBottom + 13 },
    thickness: 0.35,
    color: COLORS.gray,
  });
  drawText(
    page,
    fonts,
    "Assinatura e carimbo",
    innerX + 17,
    receiptBottom + 5,
    { size: 4.8, color: COLORS.gray },
  );
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
  const rowHeight = 34;
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
    baneseCarnetPartyDetails(input.beneficiary),
    { bold: true, valueSize: 6.2 },
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
    baneseCarnetPartyDetails(input.payer),
    { valueSize: 6.2 },
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
    baneseCarnetInstallmentDocument(input.documentNumber, input.installment),
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
  const middleY = bankAreaY + 47;
  const middleTop = contentTop - rowHeight * 3;
  const middleHeight = Math.max(58, middleTop - middleY);
  const pixWidth = bodyWidth * 0.28;
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
  instructions.slice(0, 4).forEach((instruction, index) => {
    const isCashierWarning = /CAIXA/i.test(instruction);
    drawText(
      page,
      fonts,
      instruction,
      bodyX + 7,
      termsY - 17 - index * 7,
      {
        size: isCashierWarning ? 5.6 : 5.2,
        bold: isCashierWarning,
        color: isCashierWarning ? COLORS.sandbox : COLORS.black,
        maxWidth: bodyWidth - pixWidth - 14,
      },
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
    y: bankAreaY + 6,
    width: bodyWidth,
    height: 39,
  });
};
