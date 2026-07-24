import { PDFDocument, type PDFPage } from "npm:pdf-lib@1.17.1";
import {
  type BaneseBoletoDocumentInput,
  formatBaneseDocumentAmount,
  formatBaneseDocumentDate,
  formatBaneseDocumentId,
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
  drawBaneseText as drawText,
  wrapBaneseText as wrapText,
} from "../pdf/primitives.ts";
import { presentBaneseFinancialTerms } from "../pdf/financial-terms.ts";

export const drawBaneseBoletoSlip = async (
  page: PDFPage,
  pdf: PDFDocument,
  fonts: Fonts,
  input: BaneseBoletoDocumentInput,
  box: Box,
  showBarcode: boolean,
  assets: BaneseDocumentBrandAssets,
) => {
  const headerHeight = 30;
  drawBrandHeader(page, fonts, input, {
    x: box.x,
    y: box.y + box.height - headerHeight,
    width: box.width,
    height: headerHeight,
  }, assets);

  let top = box.y + box.height - headerHeight;
  const dueWidth = 142;
  const mainWidth = box.width - dueWidth;
  const row = (height: number) => {
    top -= height;
    return top;
  };

  let y = row(25);
  drawBox(
    page,
    fonts,
    { x: box.x, y, width: mainWidth, height: 25 },
    "Local de pagamento",
    "Pagável preferencialmente na rede Banese",
  );
  drawBox(
    page,
    fonts,
    { x: box.x + mainWidth, y, width: dueWidth, height: 25 },
    "Vencimento",
    formatBaneseDocumentDate(input.dueDate),
    { bold: true, alignRight: true },
  );

  y = row(37);
  drawBox(
    page,
    fonts,
    { x: box.x, y, width: mainWidth, height: 37 },
    "Beneficiário",
    `${input.beneficiary.name} - CNPJ/CPF ${
      formatBaneseDocumentId(input.beneficiary.document)
    }\n${partyAddress(input.beneficiary)}`,
    { valueSize: 7 },
  );
  const beneficiaryCode = input.beneficiary.beneficiaryCode;
  drawBox(
    page,
    fonts,
    { x: box.x + mainWidth, y, width: dueWidth, height: 37 },
    "Agência/Código beneficiário",
    `${input.beneficiary.agency}/${beneficiaryCode}`,
    { bold: true, alignRight: true },
  );

  y = row(31);
  const widths = [82, 105, 70, 56, mainWidth - 313];
  const labels = [
    "Data do documento",
    "Número do documento",
    "Especie doc.",
    "Aceite",
    "Data processamento",
  ];
  const values = [
    formatBaneseDocumentDate(input.issueDate),
    input.documentNumber,
    `${input.speciesCode || ""} ${input.speciesLabel || ""}`.trim(),
    input.acceptance,
    formatBaneseDocumentDate(input.processingDate),
  ];
  let x = box.x;
  widths.forEach((width, index) => {
    drawBox(
      page,
      fonts,
      { x, y, width, height: 31 },
      labels[index],
      values[index],
    );
    x += width;
  });
  drawBox(
    page,
    fonts,
    { x: box.x + mainWidth, y, width: dueWidth, height: 31 },
    "Nosso Número",
    input.ourNumber,
    { bold: true, alignRight: true },
  );

  y = row(31);
  const financialWidths = [78, 67, 55, mainWidth - 200];
  const financialLabels = [
    "Uso do banco",
    "Carteira",
    "Moeda",
    "Quantidade / Valor",
  ];
  const financialValues = ["", input.beneficiary.wallet || "", "R$", ""];
  x = box.x;
  financialWidths.forEach((width, index) => {
    drawBox(
      page,
      fonts,
      { x, y, width, height: 31 },
      financialLabels[index],
      financialValues[index],
    );
    x += width;
  });
  drawBox(
    page,
    fonts,
    { x: box.x + mainWidth, y, width: dueWidth, height: 31 },
    "(=) Valor documento",
    formatBaneseDocumentAmount(input.amount),
    { bold: true, alignRight: true },
  );

  const payerHeight = 45;
  const barcodeBlockHeight = showBarcode ? 68 : 0;
  const detailsHeight = Math.max(
    64,
    top - box.y - payerHeight - barcodeBlockHeight,
  );
  y = row(detailsHeight);
  const rightWidth = 142;
  const leftAreaWidth = box.width - rightWidth;
  const pixWidth = Math.min(132, Math.max(106, leftAreaWidth * 0.34));
  const instructionsWidth = leftAreaWidth - pixWidth;
  const pixQr = await embedPixQr(pdf, input);
  page.drawRectangle({
    x: box.x,
    y,
    width: instructionsWidth,
    height: detailsHeight,
    borderColor: COLORS.black,
    borderWidth: 0.55,
  });
  drawText(
    page,
    fonts,
    "Instruções (responsabilidade do beneficiário)",
    box.x + 3,
    y + detailsHeight - 9,
    { size: 5.4, color: COLORS.gray },
  );
  const instructions = input.instructions?.length
    ? input.instructions
    : ["Nao receber apos a data limite indicada pelo banco."];
  instructions.slice(0, 5).forEach((instruction, index) => {
    const isCashierWarning = /CAIXA/i.test(instruction);
    drawText(
      page,
      fonts,
      instruction,
      box.x + 8,
      y + detailsHeight - 22 - index * 10,
      {
        size: 7,
        bold: isCashierWarning,
        color: isCashierWarning ? COLORS.sandbox : COLORS.black,
        maxWidth: instructionsWidth - 16,
      },
    );
  });
  if (
    showBarcode && input.environment === "production" &&
    input.pix?.copyAndPaste
  ) {
    const titleY = y + detailsHeight - 24 -
      instructions.slice(0, 5).length * 10;
    drawText(
      page,
      fonts,
      "Pix Copia e Cola oficial Banese:",
      box.x + 8,
      titleY,
      { size: 5, bold: true, color: COLORS.darkGreen },
    );
    const availableLines = Math.max(0, Math.floor((titleY - y - 7) / 5.5));
    wrapText(
      input.pix.copyAndPaste,
      fonts.regular,
      4.4,
      instructionsWidth - 16,
    ).slice(0, availableLines).forEach((line, index) => {
      drawText(page, fonts, line, box.x + 8, titleY - 7 - index * 5.5, {
        size: 4.4,
        color: COLORS.gray,
      });
    });
  }
  drawPixPanel(page, fonts, input, pixQr, {
    x: box.x + instructionsWidth,
    y,
    width: pixWidth,
    height: detailsHeight,
  });
  const financial = presentBaneseFinancialTerms(
    input.financialTerms || {
      nominalAmount: input.amount,
      dueDate: input.dueDate,
    },
  );
  const financialRows = [
    {
      label: `(-) ${financial.discount.label}`,
      value: financial.discount.value,
    },
    { label: `(+) ${financial.penalty.label}`, value: financial.penalty.value },
    {
      label: `(+) ${financial.interest.label}`,
      value: financial.interest.value,
    },
    { label: "(+) Outros acrescimos", value: "" },
    {
      label: "(=) Valor do documento",
      value: formatBaneseDocumentAmount(input.amount),
    },
  ];
  financialRows.forEach((field, index) => {
    const h = detailsHeight / financialRows.length;
    drawBox(
      page,
      fonts,
      {
        x: box.x + leftAreaWidth,
        y: y + detailsHeight - h * (index + 1),
        width: rightWidth,
        height: h,
      },
      field.label,
      field.value,
      {
        bold: index === financialRows.length - 1,
        alignRight: true,
        valueSize: 7,
      },
    );
  });

  y = row(payerHeight);
  page.drawRectangle({
    x: box.x,
    y,
    width: box.width,
    height: payerHeight,
    borderColor: COLORS.black,
    borderWidth: 0.7,
  });
  drawText(page, fonts, "Pagador", box.x + 3, y + payerHeight - 8, {
    size: 5.4,
    color: COLORS.gray,
  });
  drawText(
    page,
    fonts,
    `${input.payer.name} - CPF/CNPJ ${
      formatBaneseDocumentId(input.payer.document)
    }`,
    box.x + 45,
    y + payerHeight - 10,
    { size: 7.2, bold: true, maxWidth: box.width - 50 },
  );
  drawText(
    page,
    fonts,
    partyAddress(input.payer),
    box.x + 45,
    y + payerHeight - 22,
    { size: 7, maxWidth: box.width - 50 },
  );
  drawText(
    page,
    fonts,
    `Identificador: ${input.receivableId}`,
    box.x + 45,
    y + 7,
    { size: 5.8, maxWidth: box.width - 50, color: COLORS.gray },
  );

  if (showBarcode) {
    y = row(68);
    drawBarcode(page, input.barcode, {
      x: box.x,
      y: y + 17,
      width: box.width,
      height: 42,
    });
    drawText(page, fonts, input.barcode, box.x + 6, y + 5, {
      size: 6.4,
      bold: true,
      maxWidth: box.width - 12,
    });
  }
};
