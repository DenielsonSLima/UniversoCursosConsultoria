import assert from "node:assert/strict";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from "npm:pdf-lib@1.17.1";
import { getDocument } from "npm:pdfjs-dist@5.6.205/legacy/build/pdf.mjs";
import { buildBaneseBoletoPdf } from "../boletos/boleto-pdf.ts";
import { buildBaneseCarnetPdf } from "../carne/carne-pdf.ts";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../testing/document-fixture.ts";
import { formatBaneseDigitableLine } from "../types.ts";
import { buildBanesePixPayloadFixture } from "../testing/pix-fixture.ts";
import { renderOfficialBanesePixQr } from "../official-pix-qr.ts";
import {
  SERVICE_INVOICE_APPENDIX_REFERENCE,
  serviceInvoiceReference,
} from "./service-invoice-details.ts";

const plain = (value: string) => value.replace(/\s+/g, " ").trim();
const compact = (value: string) => value.replace(/\s+/g, "");
const count = (text: string, value: string) => text.split(value).length - 1;
async function pageTexts(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    return await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, index) => {
        const page = await pdf.getPage(index + 1),
          content = await page.getTextContent();
        return plain(
          content.items.map((item) => "str" in item ? item.str : "").join(" "),
        );
      }),
    );
  } finally {
    await pdf.destroy();
  }
}
const input = (description: string) => ({
  ...BANESE_DOCUMENT_FIXTURE,
  serviceInvoice: { number: "7", description },
  installment: { current: 1, total: 3 },
  instructions: ["HOMOLOGAÇÃO - SEM VALIDADE. NÃO PAGAR."],
});

Deno.test("boleto de serviço mostra NFS-e e parcela nas duas vias e descrição curta integral nas vias e anexo", async () => {
  const description = "SERVIÇO SINTÉTICO PRESTADO CONFORME CONTRATO.";
  const bytes = await buildBaneseBoletoPdf(input(description)),
    pages = await pageTexts(bytes);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  assert.equal(
    count(pages[0], serviceInvoiceReference(input(description))!),
    2,
  );
  assert.equal(count(pages[0], description), 2);
  assert.equal(count(pages[0], SERVICE_INVOICE_APPENDIX_REFERENCE), 2);
  assert.equal(
    count(
      pages[0],
      formatBaneseDigitableLine(BANESE_DOCUMENT_FIXTURE.digitableLine),
    ),
    2,
  );
  assert(pages[1].includes(description));
  assert.doesNotMatch(pages.join(" "), /\.\.\./);
});

Deno.test("descrição NFS-e de 2.000 caracteres usa demonstrativo nativo completo sem alterar boleto ou ocultar o final", async () => {
  const ending = " FINAL INTEGRAL PRESERVADO 2000.";
  const description =
    (`INÍCIO SERVIÇO SINTÉTICO. ${
      "Descrição contratual integral com acentuação e informações do serviço. "
        .repeat(35)
    }`).slice(0, 2_000 - ending.length) + ending;
  assert.equal([...description].length, 2_000);
  const bytes = await buildBaneseBoletoPdf(input(description)),
    pages = await pageTexts(bytes);
  assert.equal(pages.length, 2);
  assert.equal(count(pages[0], "NFS-e nº 7 - Parcela 1/3"), 2);
  assert.equal(count(pages[0], SERVICE_INVOICE_APPENDIX_REFERENCE), 2);
  assert(compact(pages.slice(1).join(" ")).includes(compact(description)));
  assert(pages[1].includes("FINAL INTEGRAL PRESERVADO 2000."));
  assert.doesNotMatch(pages.join(" "), /\.\.\./);
});

Deno.test("carnê preserva três boletos por página, referência nas duas vias e um demonstrativo por NFS-e", async () => {
  const description = "SERVIÇO SINTÉTICO INTEGRAL PARA TRÊS PARCELAS.";
  const items = [0, 1, 2].map((index) => ({
    ...baneseDocumentFixtureAt(index),
    serviceInvoice: { number: "7", description },
    installment: { current: index + 1, total: 3 },
    instructions: ["HOMOLOGAÇÃO - NÃO PAGAR."],
  }));
  const bytes = await buildBaneseCarnetPdf(items),
    pages = await pageTexts(bytes);
  assert.equal(pages.length, 2);
  assert.equal(count(pages[0], "NFS-e nº 7"), 6);
  assert.equal(count(pages[0], SERVICE_INVOICE_APPENDIX_REFERENCE), 6);
  for (const item of items) {
    assert(pages[0].includes(formatBaneseDigitableLine(item.digitableLine)));
  }
  assert.equal(count(pages[1], description), 1);
  await assert.rejects(
    () =>
      buildBaneseCarnetPdf([{ ...items[0] }, {
        ...items[1],
        serviceInvoice: { number: "7", description: "Outra descrição." },
      }, items[2]]),
    /descrições divergentes/,
  );
});

Deno.test("metadados de serviço preservam os dois QR da mesma cobrança e texto nativo nas vias", async () => {
  const copyAndPaste = buildBanesePixPayloadFixture("NFSE-SYNTHETIC-QR");
  const bytes = await buildBaneseBoletoPdf({
    ...input("Serviço sintético com Pix de fixture."),
    environment: "production",
    pix: {
      copyAndPaste,
      qrCodeBase64: await renderOfficialBanesePixQr(copyAndPaste),
      txid: "NFSE-SYNTHETIC-QR",
    },
  });
  const pdf = await PDFDocument.load(bytes), page = pdf.getPage(0);
  const objects = page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
  const images = objects.values().map((value) => pdf.context.lookup(value))
    .filter((value): value is PDFRawStream => value instanceof PDFRawStream);
  const squareImages = images.filter((value) =>
    value.dict.get(PDFName.of("Width"))?.toString() ===
      value.dict.get(PDFName.of("Height"))?.toString()
  );
  assert.equal(
    squareImages.length,
    2,
    "Each bank slip retains its own QR image of the same title",
  );
  const pages = await pageTexts(bytes);
  assert.equal(count(pages[0], "NFS-e nº 7 - Parcela 1/3"), 2);
  assert(pages[1].includes("Serviço sintético com Pix de fixture."));
  assert.equal(pdf.getPageCount(), 2);
});
