import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import {
  assertBaneseBankNumbers,
  barcodeFromBaneseDigitableLine,
} from "../types.ts";
import { buildBaneseInterleaved2of5 } from "../barcode.ts";
import { BANESE_DOCUMENT_FIXTURE } from "../testing/document-fixture.ts";
import { buildBaneseBoletoPdf } from "./boleto-pdf.ts";

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
