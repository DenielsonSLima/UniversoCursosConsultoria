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
  drawBaneseCompanyLogo as drawCompanyLogo,
  drawBaneseImageContain as drawImageContain,
  drawBaneseText as drawText,
  fitBaneseFontSize as fitFontSize,
  wrapBaneseText as wrapText,
  wrapBaneseWords as wrapWords,
} from "../pdf/primitives.ts";
import { presentBaneseFinancialTerms } from "../pdf/financial-terms.ts";

const instructionProfiles = [
  { size: 7, lineHeight: 8.4, blockGap: 2 },
  { size: 6.4, lineHeight: 7.4, blockGap: 1.5 },
] as const;

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

  const beneficiaryHeight = 37;
  y = row(beneficiaryHeight);
  const beneficiaryLogoWidth = assets.companyLogo ? 116 : 0;
  page.drawRectangle({
    x: box.x,
    y,
    width: mainWidth,
    height: beneficiaryHeight,
    borderColor: COLORS.black,
    borderWidth: 0.55,
  });
  if (assets.companyLogo) {
    page.drawLine({
      start: { x: box.x + beneficiaryLogoWidth, y },
      end: { x: box.x + beneficiaryLogoWidth, y: y + beneficiaryHeight },
      thickness: 0.55,
      color: COLORS.black,
    });
    drawCompanyLogo(page, assets.companyLogo, {
      x: box.x,
      y,
      width: beneficiaryLogoWidth,
      height: beneficiaryHeight,
    });
  }
  const beneficiaryTextX = box.x + beneficiaryLogoWidth + 4;
  const beneficiaryTextWidth = mainWidth - beneficiaryLogoWidth - 8;
  drawText(
    page,
    fonts,
    "Beneficiário",
    beneficiaryTextX,
    y + beneficiaryHeight - 8,
    { size: 5.4, color: COLORS.gray },
  );
  const beneficiaryName = `${input.beneficiary.name} - CNPJ/CPF ${
    formatBaneseDocumentId(input.beneficiary.document)
  }`;
  const beneficiaryAddress = partyAddress(input.beneficiary);
  const beneficiaryNameSize = fitFontSize(
    beneficiaryName,
    fonts.regular,
    7,
    5.5,
    beneficiaryTextWidth,
    "Nome e documento do beneficiário não cabem integralmente no boleto Banese.",
  );
  const beneficiaryAddressSize = fitFontSize(
    beneficiaryAddress,
    fonts.regular,
    7,
    5.5,
    beneficiaryTextWidth,
    "Endereço do beneficiário não cabe integralmente no boleto Banese.",
  );
  drawText(
    page,
    fonts,
    beneficiaryName,
    beneficiaryTextX,
    y + 14,
    { size: beneficiaryNameSize },
  );
  drawText(
    page,
    fonts,
    beneficiaryAddress,
    beneficiaryTextX,
    y + 5,
    { size: beneficiaryAddressSize },
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
  const widths = [90, 100, 65, 52, mainWidth - 307];
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
  const financialWidths = [90, 100, 65, mainWidth - 255];
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

  const payerHeight = 34;
  const barcodeBlockHeight = showBarcode ? 56 : 0;
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
  const hasPixCopyAndPaste = showBarcode &&
    input.environment === "production" &&
    Boolean(input.pix?.copyAndPaste);
  const pixCopyLines = hasPixCopyAndPaste
    ? wrapText(
      input.pix!.copyAndPaste,
      fonts.regular,
      4.4,
      instructionsWidth - 16,
    )
    : [];
  const pixCopyHeight = hasPixCopyAndPaste
    ? 3 + 7 + pixCopyLines.length * 5.5
    : 0;
  const instructionTop = y + detailsHeight - 22;
  const instructionBottom = y + 7 + pixCopyHeight;
  const preparedInstructions = instructionProfiles.map((profile) => {
    const blocks = instructions.map((instruction) => {
      const isCashierWarning = /CAIXA/i.test(instruction);
      const font = isCashierWarning ? fonts.bold : fonts.regular;
      return {
        isCashierWarning,
        lines: wrapWords(
          instruction,
          font,
          profile.size,
          instructionsWidth - 16,
        ),
      };
    });
    const height = blocks.reduce(
      (total, block, index) =>
        total + block.lines.length * profile.lineHeight +
        (index < blocks.length - 1 ? profile.blockGap : 0),
      0,
    );
    return { profile, blocks, height };
  });
  const instructionLayout = preparedInstructions.find(({ height }) =>
    instructionTop - height >= instructionBottom
  );
  if (!instructionLayout) {
    throw new Error(
      "As instruções do boleto Banese não cabem integralmente no documento.",
    );
  }
  let instructionCursorY = instructionTop;
  instructionLayout.blocks.forEach((block, blockIndex) => {
    block.lines.forEach((line) => {
      drawText(page, fonts, line, box.x + 8, instructionCursorY, {
        size: instructionLayout.profile.size,
        bold: block.isCashierWarning,
        color: block.isCashierWarning ? COLORS.sandbox : COLORS.black,
      });
      instructionCursorY -= instructionLayout.profile.lineHeight;
    });
    if (blockIndex < instructionLayout.blocks.length - 1) {
      instructionCursorY -= instructionLayout.profile.blockGap;
    }
  });
  if (hasPixCopyAndPaste) {
    instructionCursorY -= 3;
    drawText(
      page,
      fonts,
      "Pix Copia e Cola oficial Banese:",
      box.x + 8,
      instructionCursorY,
      { size: 5, bold: true, color: COLORS.darkGreen },
    );
    instructionCursorY -= 7;
    pixCopyLines.forEach((line) => {
      drawText(page, fonts, line, box.x + 8, instructionCursorY, {
        size: 4.4,
        color: COLORS.gray,
      });
      instructionCursorY -= 5.5;
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
  if (showBarcode) {
    y = row(barcodeBlockHeight);
    drawBarcode(page, input.barcode, {
      x: box.x,
      y: y + 7,
      width: box.width,
      height: 42,
    });
  }
};
