import assert from "node:assert/strict";
import { normalizePdfAssetManifest } from "./supabase-adapter-manifest.ts";

const HASH = "a".repeat(64);
const image = {
  mimeType: "image/png",
  byteSize: 128,
  width: 20,
  height: 10,
  sha256: HASH,
};
const sharedAssets = () => ({
  headerLogo: {
    sourceKind: "HTTPS_URL",
    sourceUrl:
      "https://project.supabase.co/storage/v1/object/public/docs/logo.png",
    ...image,
  },
  watermark: null,
  validationQr: {
    sourceKind: "GENERATED_QR",
    payload: "https://universocc.com.br/validador?code=DIA-TESTE",
    mimeType: "image/png",
    byteSize: 128,
    width: 240,
    height: 240,
    sha256: HASH,
  },
});

const v2 = () => ({
  schemaVersion: 2,
  source: "UNIVERSO_DIARIO_PDF_ASSETS_V2",
  documentSnapshotSha256: HASH,
  validationUrl: "https://universocc.com.br/validador?code=DIA-TESTE",
  assets: {
    ...sharedAssets(),
    backCoverBackground: {
      sourceKind: "HTTPS_URL",
      sourceUrl:
        "https://project.supabase.co/storage/v1/object/public/docs/back.png",
      ...image,
    },
    backCoverImages: [
      {
        fieldId: "imagem_a",
        sourceUrl:
          "https://project.supabase.co/storage/v1/object/public/docs/a.png",
        ...image,
      },
      {
        fieldId: "imagem_b",
        sourceUrl:
          "https://project.supabase.co/storage/v1/object/public/docs/b.png",
        ...image,
      },
    ],
  },
});

Deno.test("normalizador aceita v1 histórico e preserva v2 completo", () => {
  const legacy = normalizePdfAssetManifest({
    schemaVersion: 1,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V1",
    documentSnapshotSha256: HASH,
    validationUrl: "https://universocc.com.br/validador?code=DIA-TESTE",
    assets: sharedAssets(),
  });
  assert.equal(legacy.schemaVersion, 1);

  const current = normalizePdfAssetManifest(v2());
  assert.equal(current.schemaVersion, 2);
  if (current.schemaVersion !== 2) throw new Error("manifesto v2 esperado");
  assert.equal(current.assets.backCoverBackground?.sha256, HASH);
  assert.deepEqual(
    current.assets.backCoverImages.map((entry) => entry.fieldId),
    ["imagem_a", "imagem_b"],
  );
});

Deno.test("normalizador preserva a ordem congelada pelo modelo", () => {
  const candidate = v2();
  candidate.assets.backCoverImages.reverse();
  const normalized = normalizePdfAssetManifest(candidate);
  assert.equal(normalized.schemaVersion, 2);
  if (normalized.schemaVersion !== 2) throw new Error("manifesto v2 esperado");
  assert.deepEqual(
    normalized.assets.backCoverImages.map((entry) => entry.fieldId),
    ["imagem_b", "imagem_a"],
  );
});

Deno.test("normalizador rejeita campo duplicado e recurso v2 ausente", () => {
  const duplicate = v2();
  duplicate.assets.backCoverImages[1].fieldId = "imagem_a";
  assert.throws(
    () => normalizePdfAssetManifest(duplicate),
    /temporariamente indisponível/u,
  );

  const missing = v2() as Record<string, unknown> & {
    assets: Record<string, unknown>;
  };
  delete missing.assets.backCoverImages;
  assert.throws(
    () => normalizePdfAssetManifest(missing),
    /temporariamente indisponível/u,
  );
});
