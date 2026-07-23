import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { embedBaneseBrandAssets } from "../pdf/branding.ts";
import { BANESE_PDF_PAGE, baneseDocumentFonts } from "../pdf/primitives.ts";
import {
  type BaneseBoletoDocumentInput,
  type BaneseDocumentBranding,
  normalizeBaneseBoletoDocument,
} from "../types.ts";
import { drawBaneseCarnetSlip } from "./carne-layout.ts";

export type BaneseCarnetPdfOptions = {
  itemsPerPage?: 2 | 3;
  maxItems?: number;
  branding?: BaneseDocumentBranding;
};

export const buildBaneseCarnetPdf = async (
  rawItems: BaneseBoletoDocumentInput[],
  options: BaneseCarnetPdfOptions = {},
) => {
  const configuredMaxItems = Number(options.maxItems ?? 30);
  const maxItems = Number.isFinite(configuredMaxItems)
    ? Math.max(1, Math.min(60, Math.trunc(configuredMaxItems)))
    : 30;
  if (
    options.itemsPerPage !== undefined &&
    ![2, 3].includes(Number(options.itemsPerPage))
  ) {
    throw new Error("Quantidade de parcelas por pagina do carne e invalida.");
  }
  if (!Array.isArray(rawItems) || rawItems.length < 3) {
    throw new Error(
      "O carne Banese exige ao menos 3 parcelas registradas. Matricula e cobrancas com ate 2 parcelas devem ser emitidas individualmente.",
    );
  }
  if (rawItems.length > maxItems) {
    throw new Error(
      `O carne Banese aceita no maximo ${maxItems} boletos por arquivo.`,
    );
  }

  const items = rawItems.map((item) => {
    try {
      return normalizeBaneseBoletoDocument(item);
    } catch (error) {
      const message = String((error as Error)?.message || error);
      if (item.environment !== "production" || !/pix/i.test(message)) {
        throw error;
      }
      return normalizeBaneseBoletoDocument({
        ...item,
        pix: null,
      });
    }
  }).sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate) ||
    left.documentNumber.localeCompare(right.documentNumber)
  );
  const payerDocuments = new Set(items.map((item) => item.payer.document));
  if (payerDocuments.size !== 1) {
    throw new Error("Um carne Banese deve conter boletos de um unico pagador.");
  }
  for (
    const [label, values] of [
      ["Nosso Numero", items.map((item) => item.ourNumber)],
      ["linha digitavel", items.map((item) => item.digitableLine)],
      ["codigo de barras", items.map((item) => item.barcode)],
    ] as const
  ) {
    if (new Set(values).size !== items.length) {
      throw new Error(`Cada parcela do carne deve possuir ${label} exclusivo.`);
    }
  }
  const issuerKeys = new Set(items.map((item) =>
    [
      item.environment,
      item.beneficiary.document,
      item.beneficiary.agency,
      item.beneficiary.account,
      item.beneficiary.agreement,
    ].join("|")
  ));
  if (issuerKeys.size !== 1) {
    throw new Error(
      "Um carne Banese deve usar um unico convenio beneficiario.",
    );
  }
  const hasOfficialPix = items.some((item) =>
    item.environment === "production" && Boolean(item.pix)
  );
  if (hasOfficialPix) {
    const allProductionItemsHavePix = items.every((item) =>
      item.environment !== "production" || Boolean(item.pix)
    );
    if (!allProductionItemsHavePix) {
      // Se uma parcela perdeu o retorno de Pix valido, cai sem Pix no documento
      // inteiro para evitar mostrar dado contaminado no PDF.
      items.forEach((item) => {
        if (item.environment === "production") {
          item.pix = null;
        }
      });
    }
  }

  const effectiveOfficialPix = items.some((item) =>
    item.environment === "production" && Boolean(item.pix)
  );
  if (effectiveOfficialPix) {
    for (
      const [label, values] of [
        ["Pix copia e cola", items.map((item) => item.pix!.copyAndPaste)],
        ["QR Pix", items.map((item) => item.pix!.qrCodeBase64)],
      ] as const
    ) {
      if (new Set(values).size !== items.length) {
        throw new Error(
          `Cada parcela do carne deve possuir ${label} exclusivo.`,
        );
      }
    }
    const txids = items.map((item) => item.pix?.txid).filter(Boolean);
    if (
      txids.length > 0 &&
      (txids.length !== items.length || new Set(txids).size !== items.length)
    ) {
      throw new Error("Cada parcela do carne deve possuir TXID Pix exclusivo.");
    }
  }
  if (options.itemsPerPage === 3 && effectiveOfficialPix) {
    throw new Error(
      "Carne Banese com Pix oficial aceita no maximo 2 parcelas por pagina.",
    );
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle("Carne Banese - Universo Cursos e Consultoria");
  pdf.setSubject("Carne de boletos registrados no Banese");
  pdf.setCreator("Universo Cursos e Consultoria");
  const fonts = await baneseDocumentFonts(pdf);
  const assets = await embedBaneseBrandAssets(pdf, options.branding);
  const itemsPerPage = options.itemsPerPage || (effectiveOfficialPix ? 2 : 3);
  const margin = 14;
  const gap = 9;
  const slotHeight = (BANESE_PDF_PAGE.height - margin * 2 -
    gap * (itemsPerPage - 1)) / itemsPerPage;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const slotIndex = index % itemsPerPage;
    const page = slotIndex === 0
      ? pdf.addPage([BANESE_PDF_PAGE.width, BANESE_PDF_PAGE.height])
      : pdf.getPages().at(-1)!;
    if (slotIndex === 0) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: BANESE_PDF_PAGE.width,
        height: BANESE_PDF_PAGE.height,
        color: rgb(1, 1, 1),
      });
    }
    const y = BANESE_PDF_PAGE.height - margin - slotHeight * (slotIndex + 1) -
      gap * slotIndex;

    await drawBaneseCarnetSlip(page, pdf, fonts, item, {
      x: margin,
      y: y + 4,
      width: BANESE_PDF_PAGE.width - margin * 2,
      height: slotHeight - 8,
    }, assets);

    if (slotIndex < itemsPerPage - 1 && index < items.length - 1) {
      page.drawLine({
        start: { x: margin, y: y - gap / 2 },
        end: { x: BANESE_PDF_PAGE.width - margin, y: y - gap / 2 },
        thickness: 0.55,
        dashArray: [4, 3],
        color: rgb(0.42, 0.45, 0.48),
      });
    }
  }

  return pdf.save();
};
