import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { OFFICIAL_BANESE_LOGO_BASE64 } from "../assets/banese-logo.ts";
import { embedBaneseBrandAssets } from "./branding.ts";

Deno.test("reserva Banese preserva os bytes da logo oficial existente", () => {
  const bytes = Buffer.from(OFFICIAL_BANESE_LOGO_BASE64.split(",")[1], "base64");
  assert.equal(bytes.length, 11739);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "93dad7dc98fc786f8b31fc1b3322dd06282bfe8cc37250b38a11fa253f97b65d",
  );
});

for (const value of [undefined, null, ""]) {
  Deno.test(`embute logo oficial se download retorna ${String(value)}`, async () => {
    const pdf = await PDFDocument.create();
    const assets = await embedBaneseBrandAssets(pdf, { bankLogoBase64: value });
    assert.ok(assets.bankLogo, "Logo oficial obrigatoria, sem marca generica");
    assert.deepEqual(assets.bankLogo.size(), { width: 720, height: 220 });
    assert.ok(assets.companyLogo, "Marca Universo deve ser preservada");
  });
}

Deno.test("preserva a logo bancaria fornecida quando o download funciona", async () => {
  const pdf = await PDFDocument.create();
  const assets = await embedBaneseBrandAssets(pdf, {
    bankLogoBase64: OFFICIAL_BANESE_LOGO_BASE64,
  });
  assert.ok(assets.bankLogo);
  assert.deepEqual(assets.bankLogo.size(), { width: 720, height: 220 });
});

Deno.test("imagem bancaria corrompida continua falhando explicitamente", async () => {
  const pdf = await PDFDocument.create();
  await assert.rejects(
    () => embedBaneseBrandAssets(pdf, { bankLogoBase64: "bm90LWFuLWltYWdl" }),
    /PNG ou JPEG valido/,
  );
});
