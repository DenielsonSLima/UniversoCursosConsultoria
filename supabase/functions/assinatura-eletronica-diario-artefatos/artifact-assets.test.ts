import assert from "node:assert/strict";
import {
  buildCanonicalValidationUrl,
  decodeCanonicalInlineDataImage,
  inspectImageAsset,
  parseOwnPublicStorageUrl,
  sha256Hex,
} from "./artifact-assets.ts";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const inlinePng = () => `data:image/png;base64,${PNG_1X1}`;

Deno.test("valida uma única leitura por magic, MIME, dimensões e SHA-256", async () => {
  const loaded = decodeCanonicalInlineDataImage(inlinePng());
  const inspected = await inspectImageAsset(loaded, {
    expectedMimeType: "image/png",
    expectedByteSize: loaded.bytes.byteLength,
    expectedWidth: 1,
    expectedHeight: 1,
    expectedSha256: await sha256Hex(loaded.bytes),
  });
  assert.equal(inspected.width, 1);
  assert.equal(inspected.height, 1);
  assert.equal(inspected.bytes.byteLength, loaded.bytes.byteLength);
});

Deno.test("rejeita data URI não canônica e assinatura binária incompatível", async () => {
  assert.throws(
    () => decodeCanonicalInlineDataImage(`data:image/png;base64,${PNG_1X1}\n`),
    /data URI canônica/u,
  );
  await assert.rejects(
    () =>
      inspectImageAsset({
        bytes: decodeCanonicalInlineDataImage(inlinePng()).bytes,
        mimeType: "image/jpeg",
      }),
    /assinatura binária/u,
  );
});

Deno.test("rejeita imagem acima da geometria autorizada antes do compositor", async () => {
  const loaded = decodeCanonicalInlineDataImage(inlinePng());
  const oversized = loaded.bytes.slice();
  oversized.set([0, 0, 16, 1], 16); // 4097 px no IHDR.
  await assert.rejects(
    () => inspectImageAsset({ bytes: oversized, mimeType: "image/png" }),
    /dimensões/u,
  );
});

Deno.test("aceita somente URL pública do Storage do próprio projeto", () => {
  assert.deepEqual(
    parseOwnPublicStorageUrl(
      "https://project.supabase.co/storage/v1/object/public/documentos/logo.png",
      "https://project.supabase.co",
    ),
    { bucketId: "documentos", storagePath: "logo.png" },
  );
  for (
    const source of [
      "https://evil.example/storage/v1/object/public/documentos/logo.png",
      "https://project.supabase.co/storage/v1/object/public/documentos/logo.png?download=1",
      "https://project.supabase.co/storage/v1/object/sign/documentos/logo.png",
    ]
  ) {
    assert.throws(
      () => parseOwnPublicStorageUrl(source, "https://project.supabase.co"),
      /Storage autorizado/u,
    );
  }
});

Deno.test("gera somente a URL canônica /validador com query code única", () => {
  assert.equal(
    buildCanonicalValidationUrl(
      "https://universocc.com.br",
      "/validador",
      "DIA-TECNICO-TESTE",
    ),
    "https://universocc.com.br/validador?code=DIA-TECNICO-TESTE",
  );
  assert.throws(
    () =>
      buildCanonicalValidationUrl(
        "https://localhost",
        "/validador",
        "DIA-TECNICO-TESTE",
      ),
    /origem HTTPS autorizada/u,
  );
  assert.throws(
    () =>
      buildCanonicalValidationUrl(
        "https://universocc.com.br",
        "/verificar-assinatura",
        "DIA-TECNICO-TESTE",
      ),
    /contrato de validação/u,
  );
});
