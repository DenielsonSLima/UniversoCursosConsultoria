import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { getDocument } from "npm:pdfjs-dist@5.6.205/legacy/build/pdf.mjs";
import {
  assertBaneseBankNumbers,
  barcodeFromBaneseDigitableLine,
  formatBaneseDigitableLine,
} from "../types.ts";
import { buildBaneseInterleaved2of5 } from "../barcode.ts";
import { BANESE_DOCUMENT_FIXTURE } from "../testing/document-fixture.ts";
import { buildBaneseBoletoPdf } from "./boleto-pdf.ts";

const extractPdfText = async (bytes: Uint8Array) => {
  const document = await getDocument({
    data: bytes.slice(),
    verbosity: 0,
  }).promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    return content.items
      .map((item) => "str" in item ? item.str : "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } finally {
    await document.destroy();
  }
};

const occurrences = (text: string, value: string) =>
  text.split(value).length - 1;

Deno.test("valida vetor do modelo Banese e recompõe codigo de barras", () => {
  const result = assertBaneseBankNumbers(
    BANESE_DOCUMENT_FIXTURE.digitableLine,
    BANESE_DOCUMENT_FIXTURE.barcode,
  );
  assert.equal(result.barcode, BANESE_DOCUMENT_FIXTURE.barcode);
  assert.equal(
    barcodeFromBaneseDigitableLine(BANESE_DOCUMENT_FIXTURE.digitableLine),
    BANESE_DOCUMENT_FIXTURE.barcode,
  );
});

Deno.test("rejeita linha digitavel Banese com DV corrompido", () => {
  const originalDigit = BANESE_DOCUMENT_FIXTURE.digitableLine[9];
  const invalid = `${BANESE_DOCUMENT_FIXTURE.digitableLine.slice(0, 9)}${
    originalDigit === "9" ? "0" : String(Number(originalDigit) + 1)
  }${BANESE_DOCUMENT_FIXTURE.digitableLine.slice(10)}`;
  assert.throws(
    () => assertBaneseBankNumbers(invalid, BANESE_DOCUMENT_FIXTURE.barcode),
    /mesmo titulo|digito|banco banese/i,
  );
});

Deno.test("gera barras 2 de 5 com modulo estreito fisico de 0,3 mm", () => {
  const result = buildBaneseInterleaved2of5(
    BANESE_DOCUMENT_FIXTURE.barcode,
  );
  assert.equal(result.value.length, 44);
  assert.ok(Math.abs(result.narrowWidth - (72 * 0.3 / 25.4)) < 0.0001);
  assert.equal(result.wideWidth, result.narrowWidth * 3);
  assert.ok(result.bars.length > 100);
});

Deno.test("gera boleto Banese A4 de uma pagina", async () => {
  const bytes = await buildBaneseBoletoPdf(BANESE_DOCUMENT_FIXTURE);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const size = pdf.getPage(0).getSize();
  assert.ok(Math.abs(size.width - 595.28) < 0.1);
  assert.ok(Math.abs(size.height - 841.89) < 0.1);
});

Deno.test("gera as instruções longas do boleto sem descartar blocos", async () => {
  const description =
    "Mensalidade 3/12 - Ciclo 1 - Técnico em Radiologia - Integral - Japoatã - 2026.1";
  const classIdentification =
    "TURMA: 2026.1-RAD-INT-JAP — Técnico em Radiologia - Integral - Japoatã";
  const cashierWarning =
    "SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.";
  const bytes = await buildBaneseBoletoPdf({
    ...BANESE_DOCUMENT_FIXTURE,
    instructions: [description, classIdentification, cashierWarning],
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const text = await extractPdfText(bytes);
  assert.doesNotMatch(text, /COBRANÇA EDUCACIONAL/);
  assert.equal(occurrences(text, description), 2);
  assert.equal(occurrences(text, classIdentification), 2);
  assert.equal(occurrences(text, cashierWarning), 2);
  assert.equal(
    occurrences(
      text,
      formatBaneseDigitableLine(BANESE_DOCUMENT_FIXTURE.digitableLine),
    ),
    2,
  );
  assert.equal(occurrences(text, BANESE_DOCUMENT_FIXTURE.beneficiary.name), 2);
  assert.equal(occurrences(text, BANESE_DOCUMENT_FIXTURE.payer.name), 2);
  assert.doesNotMatch(text, /Convênio Banese|Identificador:|\.\.\./);
  assert.doesNotMatch(text, new RegExp(BANESE_DOCUMENT_FIXTURE.receivableId));
  assert.doesNotMatch(
    text,
    new RegExp(BANESE_DOCUMENT_FIXTURE.beneficiary.agreement),
  );
});

Deno.test("rejeita beneficiário que não cabe em vez de inserir reticências", async () => {
  await assert.rejects(
    () =>
      buildBaneseBoletoPdf({
        ...BANESE_DOCUMENT_FIXTURE,
        beneficiary: {
          ...BANESE_DOCUMENT_FIXTURE.beneficiary,
          name: "W".repeat(80),
        },
      }),
    /beneficiário não cabem integralmente/i,
  );
});

Deno.test("rejeita excesso de instruções em vez de descartar conteúdo", async () => {
  await assert.rejects(
    () =>
      buildBaneseBoletoPdf({
        ...BANESE_DOCUMENT_FIXTURE,
        instructions: Array.from({ length: 6 }, (_, index) =>
          `Instrução ${index + 1}`),
      }),
    /no máximo 5 instruções/i,
  );
});
