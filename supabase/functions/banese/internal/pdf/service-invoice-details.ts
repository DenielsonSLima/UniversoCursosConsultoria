import { type PDFDocument, type PDFPage } from "npm:pdf-lib@1.17.1";
import type { BaneseBoletoDocumentInput } from "../types.ts";
import { validateServiceInvoiceDetails } from "../service-invoice.ts";
import {
  BANESE_PDF_COLORS,
  BANESE_PDF_PAGE,
  type BaneseDocumentBox,
  type BaneseDocumentFonts,
  drawBaneseText,
  fitBaneseFontSize,
  wrapBaneseWords,
} from "./primitives.ts";

export const SERVICE_INVOICE_APPENDIX_REFERENCE =
  "Descrição integral no demonstrativo anexo.";
export function serviceInvoiceReference(input: BaneseBoletoDocumentInput) {
  if (!input.serviceInvoice) return null;
  const invoice = validateServiceInvoiceDetails(input.serviceInvoice);
  return `NFS-e nº ${invoice.number} - Parcela ${
    input.installment?.current || 1
  }/${input.installment?.total || 1}`;
}

/** Prefer the full description on the slip; the appendix always preserves it. */
export function serviceInvoiceInstructionVariants(
  input: BaneseBoletoDocumentInput,
  original: string[],
) {
  const reference = serviceInvoiceReference(input);
  if (!reference) return [original];
  const extra = original.filter((line) =>
    line !== reference && line !== SERVICE_INVOICE_APPENDIX_REFERENCE
  );
  const basic = [reference, SERVICE_INVOICE_APPENDIX_REFERENCE, ...extra];
  return [[
    reference,
    `Serviço: ${input.serviceInvoice!.description}`,
    SERVICE_INVOICE_APPENDIX_REFERENCE,
    ...extra,
  ], basic];
}

export function drawCarnetServiceInstructions(
  page: PDFPage,
  fonts: BaneseDocumentFonts,
  input: BaneseBoletoDocumentInput,
  box: BaneseDocumentBox,
) {
  const original = input.instructions?.length ? input.instructions : [];
  for (const variant of serviceInvoiceInstructionVariants(input, original)) {
    for (const size of [5.2, 4.8]) {
      const lineHeight = size + 1.2;
      const lines = variant.flatMap((text) => {
        const warning = /CAIXA/i.test(text);
        return wrapBaneseWords(
          text,
          warning ? fonts.bold : fonts.regular,
          size,
          box.width,
        )
          .map((line) => ({ line, warning }));
      });
      if (lines.length * lineHeight > box.height) continue;
      lines.forEach(({ line, warning }, index) =>
        drawBaneseText(
          page,
          fonts,
          line,
          box.x,
          box.y + box.height - size - index * lineHeight,
          {
            size,
            bold: warning,
            color: warning
              ? BANESE_PDF_COLORS.sandbox
              : BANESE_PDF_COLORS.black,
          },
        )
      );
      return;
    }
  }
  throw new Error(
    "Referência da NFS-e e instruções não cabem integralmente no carnê Banese.",
  );
}

export function drawCarnetServiceReceiptReference(
  page: PDFPage,
  fonts: BaneseDocumentFonts,
  input: BaneseBoletoDocumentInput,
  box: BaneseDocumentBox,
) {
  if (!input.serviceInvoice) return;
  const label = `NFS-e nº ${input.serviceInvoice.number}`;
  const size = fitBaneseFontSize(label, fonts.bold, 6, 4.5, box.width);
  drawBaneseText(page, fonts, label, box.x, box.y + box.height - size, {
    size,
    bold: true,
  });
  const lines = wrapBaneseWords(
    SERVICE_INVOICE_APPENDIX_REFERENCE,
    fonts.regular,
    4.8,
    box.width,
  );
  if (size + 3 + lines.length * 5.8 > box.height) {
    throw new Error(
      "Referência da NFS-e não cabe integralmente no recibo Banese.",
    );
  }
  lines.forEach((line, index) =>
    drawBaneseText(
      page,
      fonts,
      line,
      box.x,
      box.y + box.height - size - 8 - index * 5.8,
      { size: 4.8 },
    )
  );
}

export function renderServiceInvoiceAppendices(
  pdf: PDFDocument,
  fonts: BaneseDocumentFonts,
  inputs: readonly BaneseBoletoDocumentInput[],
) {
  const invoices = new Map<
    string,
    { description: string; items: BaneseBoletoDocumentInput[] }
  >();
  for (const input of inputs) {
    if (!input.serviceInvoice) continue;
    const invoice = validateServiceInvoiceDetails(input.serviceInvoice),
      previous = invoices.get(invoice.number);
    if (previous && previous.description !== invoice.description) {
      throw new Error(
        "Uma mesma NFS-e possui descrições divergentes no carnê Banese.",
      );
    }
    if (previous) previous.items.push(input);
    else {invoices.set(invoice.number, {
        description: invoice.description,
        items: [input],
      });}
  }
  const margin = BANESE_PDF_PAGE.margin,
    width = BANESE_PDF_PAGE.width - margin * 2;
  for (const [number, invoice] of invoices) {
    // Unsupported glyphs fail explicitly; no fiscal text is replaced or rasterized.
    fonts.regular.encodeText(invoice.description.replace(/\s+/g, " "));
    const lines = wrapBaneseWords(
      invoice.description,
      fonts.regular,
      10,
      width,
    );
    const headerLines = wrapBaneseWords(
      invoice.items.map((item) => serviceInvoiceReference(item)).join("; "),
      fonts.regular,
      8,
      width,
    );
    let page: PDFPage | undefined, cursor = 0;
    const addPage = () => {
      page = pdf.addPage([BANESE_PDF_PAGE.width, BANESE_PDF_PAGE.height]);
      drawBaneseText(
        page,
        fonts,
        `Demonstrativo do serviço - NFS-e nº ${number}`,
        margin,
        790,
        { size: 14, bold: true },
      );
      cursor = 767;
      headerLines.forEach((line) => {
        drawBaneseText(page!, fonts, line, margin, cursor, {
          size: 8,
          color: BANESE_PDF_COLORS.gray,
        });
        cursor -= 11;
      });
      cursor -= 12;
      drawBaneseText(
        page,
        fonts,
        "Descrição integral do serviço constante da NFS-e",
        margin,
        cursor,
        { size: 10, bold: true },
      );
      cursor -= 22;
      drawBaneseText(
        page,
        fonts,
        "Complemento descritivo. Os dados de pagamento permanecem nos boletos correspondentes.",
        margin,
        30,
        { size: 7, color: BANESE_PDF_COLORS.gray },
      );
    };
    for (const line of lines) {
      if (!page || cursor < 62) addPage();
      drawBaneseText(page!, fonts, line, margin, cursor, { size: 10 });
      cursor -= 14;
    }
  }
}
