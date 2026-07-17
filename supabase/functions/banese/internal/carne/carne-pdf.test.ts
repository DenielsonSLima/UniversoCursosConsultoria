import assert from "node:assert/strict";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../testing/pix-fixture.ts";
import { buildBaneseCarnetPdf } from "./carne-pdf.ts";

const items = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    baneseDocumentFixtureAt(
      index,
      `2026-${String(8 + Math.floor(index / 28)).padStart(2, "0")}-${
        String(1 + (index % 28)).padStart(2, "0")
      }`,
    ));

for (const [count, expectedPages] of [[3, 1], [4, 2], [10, 4]]) {
  Deno.test(`gera carne Banese com ${count} boleto(s) em ${expectedPages} pagina(s)`, async () => {
    const bytes = await buildBaneseCarnetPdf(items(count));
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), expectedPages);
  });
}

Deno.test("bloqueia carne Banese com menos de 3 parcelas", async () => {
  await assert.rejects(
    () => buildBaneseCarnetPdf(items(1)),
    /ao menos 3 parcelas/i,
  );
  await assert.rejects(
    () => buildBaneseCarnetPdf(items(2)),
    /ao menos 3 parcelas/i,
  );
});

Deno.test("mantem limite seguro com maxItems invalido em tempo de execucao", async () => {
  const runtimeOptions = { maxItems: Number.NaN };
  const bytes = await buildBaneseCarnetPdf(items(3), runtimeOptions);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");
});

Deno.test("bloqueia carne Banese com pagadores diferentes", async () => {
  const differentPayer = {
    ...BANESE_DOCUMENT_FIXTURE,
    receivableId: "22222222-2222-4222-8222-222222222222",
    payer: {
      ...BANESE_DOCUMENT_FIXTURE.payer,
      document: "12345678909",
    },
  };
  const samePayerItems = items(3);
  await assert.rejects(
    () =>
      buildBaneseCarnetPdf([
        samePayerItems[0],
        samePayerItems[1],
        differentPayer,
      ]),
    /unico pagador/i,
  );
});

Deno.test("bloqueia parcelas com o mesmo titulo bancario", async () => {
  const validItems = items(3);
  await assert.rejects(
    () =>
      buildBaneseCarnetPdf([
        validItems[0],
        {
          ...validItems[0],
          receivableId: "22222222-2222-4222-8222-222222222222",
          documentNumber: "PARC-02",
        },
        validItems[2],
      ]),
    /exclusivo/i,
  );
});

Deno.test("bloqueia tres parcelas por pagina quando houver Pix oficial", async () => {
  const productionPix = items(3).map((item, index) => ({
    ...item,
    environment: "production" as const,
    pix: {
      copyAndPaste: buildBanesePixPayloadFixture(`TXID-OFICIAL-${index}`),
      qrCodeBase64: buildBanesePixImageFixture(index),
      txid: `TXID-OFICIAL-${index}`,
    },
  }));
  await assert.rejects(
    () => buildBaneseCarnetPdf(productionPix, { itemsPerPage: 3 }),
    /maximo 2 parcelas por pagina/i,
  );
});

Deno.test("bloqueia Pix repetido entre parcelas do carne", async () => {
  const productionPix = items(3).map((item, index) => ({
    ...item,
    environment: "production" as const,
    pix: {
      copyAndPaste: buildBanesePixPayloadFixture("TXID-REPETIDO"),
      qrCodeBase64: buildBanesePixImageFixture(index),
      txid: "TXID-REPETIDO",
    },
  }));
  await assert.rejects(
    () => buildBaneseCarnetPdf(productionPix),
    /Pix copia e cola exclusivo/i,
  );
});
