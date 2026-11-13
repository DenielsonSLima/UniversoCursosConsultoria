import assert from "node:assert/strict";
import { getDocument } from "npm:pdfjs-dist@5.6.205/legacy/build/pdf.mjs";
import { buildBaneseBoletoPdf } from "./boleto-pdf.ts";
import { BANESE_DOCUMENT_FIXTURE } from "../testing/document-fixture.ts";
import { buildBanesePixPayloadFixture } from "../testing/pix-fixture.ts";
import { renderOfficialBanesePixQr } from "../official-pix-qr.ts";

const payload = buildBanesePixPayloadFixture(
  "BOLETO-PIX-SINTETICO-CODIGO-COMPLETO",
  BANESE_DOCUMENT_FIXTURE.amount,
  "BR.GOV.BCB.PIX",
  `${"TESTE".repeat(15)}00`,
);
const label = "PIX COPIA E COLA";
const compact = (value: string) => value.replace(/\s+/g, "");
const occurrences = (text: string, value: string) => text.split(value).length - 1;

async function extract(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return content.items.filter((item) => "str" in item);
  } finally {
    await pdf.destroy();
  }
}

Deno.test("Pix Copia e Cola integral e legível nas duas vias do boleto", async () => {
  const items = await extract(await buildBaneseBoletoPdf({
    ...BANESE_DOCUMENT_FIXTURE,
    environment: "production",
    instructions: [
      "Mensalidade 3/12 - Ciclo 1 - Técnico em Radiologia - Integral - Japoatã - 2026.1",
      "TURMA: 2026.1-RAD-INT-JAP — Técnico em Radiologia - Integral - Japoatã",
      "SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.",
    ],
    pix: { copyAndPaste: payload, qrCodeBase64: await renderOfficialBanesePixQr(payload) },
  }));
  const text = items.map((item) => item.str).join(" ");
  assert.equal(occurrences(text, label), 2);
  assert.equal(occurrences(compact(text), payload), 2);
  assert.equal(occurrences(text, "SR.(A) CAIXA:"), 2);
  const titles = items.filter((item) => item.str === label);
  for (const title of titles) {
    assert(title.height >= 7, "O título Pix deve ter destaque nas duas vias");
    const codeItems = items.filter((item) =>
      item.str && payload.includes(item.str) && item.transform[5] < title.transform[5] &&
      item.transform[5] > title.transform[5] - 70
    );
    assert(codeItems.length > 0);
    assert.equal(codeItems.map((item) => item.str).join(""), payload);
    assert(codeItems.every((item) => item.height >= 6.4), "Código sem fonte miúda");
  }
});

for (const environment of ["production", "sandbox"] as const) {
  Deno.test(`sem Pix oficial não imprime código nem destaque (${environment})`, async () => {
    const items = await extract(await buildBaneseBoletoPdf({
      ...BANESE_DOCUMENT_FIXTURE,
      environment,
      pix: null,
    }));
    assert(!items.some((item) => item.str === label));
    assert.equal(occurrences(items.map((item) => item.str).join(" "), payload), 0);
  });
}
