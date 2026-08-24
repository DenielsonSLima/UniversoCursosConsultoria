import assert from "node:assert/strict";
import { loadFrozenInstitutionalWatermark } from "./artifact-final-assets.ts";
import { createSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts";

const PORTRAIT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABjCAMAAAARkYYzAAAACVBMVEX////tHE4AGjMFrW9BAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAUklEQVRYhe3QoQGAAAzAsG3/H80DVGEQyQEVnbu7+WR3d2ReedO8ad40b5o3zZvmTfOmedO8ad40b5o3zZvmTfOmedO8ad40b5o3zZvmTfvfmwcHuwSltX1/5wAAAABJRU5ErkJggg==";

Deno.test("asset do comprovante é lido do snapshot portrait, não do manifesto landscape", async () => {
  const snapshot = createSnapshot();
  const receiptSnapshot = {
    schemaVersion: 1 as const,
    source: "POLO_PORTRAIT_WATERMARK_V1" as const,
    poloId: snapshot.source.poloId,
    url: PORTRAIT_PNG,
    opacity: 0.25,
    scale: 60,
    rotate: false,
  };
  let networkLoads = 0;
  const loaded = await loadFrozenInstitutionalWatermark(
    {
      loadCanonicalAsset: () => {
        networkLoads += 1;
        return Promise.reject(new Error("a marca retrato é inline"));
      },
    },
    snapshot,
    {
      schemaVersion: 1,
      source: "UNIVERSO_DIARIO_PDF_ASSETS_V1",
      documentSnapshotSha256: "a".repeat(64),
      validationUrl: "https://universocc.com.br/validador?code=DIA-TESTE",
      assets: {
        headerLogo: {
          sourceKind: "HTTPS_URL",
          sourceUrl: snapshot.assetSources.headerLogoUrl,
          mimeType: "image/png",
          byteSize: 1,
          width: 1,
          height: 1,
          sha256: "b".repeat(64),
        },
        watermark: null,
        validationQr: {
          sourceKind: "GENERATED_QR",
          payload: "https://universocc.com.br/validador?code=DIA-TESTE",
          mimeType: "image/png",
          byteSize: 1,
          width: 240,
          height: 240,
          sha256: "c".repeat(64),
        },
      },
    },
    {
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "receiptWatermarkSnapshot.url",
    },
    receiptSnapshot,
  );
  assert.equal(networkLoads, 0);
  assert.equal(loaded?.width, 70);
  assert.equal(loaded?.height, 99);
});

Deno.test("asset retrato falha se o polo do descritor divergir", async () => {
  const snapshot = createSnapshot();
  await assert.rejects(() =>
    loadFrozenInstitutionalWatermark(
      {
        loadCanonicalAsset: () => Promise.reject(new Error("inacessível")),
      },
      snapshot,
      {} as never,
      {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "receiptWatermarkSnapshot.url",
      },
      {
        schemaVersion: 1,
        source: "POLO_PORTRAIT_WATERMARK_V1",
        poloId: "00000000-0000-4000-8000-000000000099",
        url: PORTRAIT_PNG,
        opacity: 0.25,
        scale: 60,
        rotate: false,
      },
    )
  );
});
