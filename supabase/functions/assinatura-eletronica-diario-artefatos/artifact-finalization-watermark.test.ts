import assert from "node:assert/strict";
import {
  assertFrozenV3InstitutionalWatermark,
  resolveReceiptWatermarkSettings,
} from "./artifact-final-assets.ts";
import { createSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts";

const LANDSCAPE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PORTRAIT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABjCAMAAAARkYYzAAAACVBMVEX////tHE4AGjMFrW9BAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAUklEQVRYhe3QoQGAAAzAsG3/H80DVGEQyQEVnbu7+WR3d2ReedO8ad40b5o3zZvmTfOmedO8ad40b5o3zZvmTfOmedO8ad40b5o3zZvmTfvfmwcHuwSltX1/5wAAAABJRU5ErkJggg==";

Deno.test("finalização atual valida landscape e portrait separadamente", async () => {
  const snapshot = createSnapshot();
  snapshot.assetSources.watermarkUrl = LANDSCAPE_PNG;
  snapshot.institutionalIdentity.watermarkUrl = LANDSCAPE_PNG;
  const portrait = {
    schemaVersion: 1 as const,
    source: "POLO_PORTRAIT_WATERMARK_V1" as const,
    poloId: snapshot.source.poloId,
    url: PORTRAIT_PNG,
    opacity: 0.32,
    scale: 65,
    rotate: true,
  };
  await assert.doesNotReject(() =>
    assertFrozenV3InstitutionalWatermark(
      snapshot,
      {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "receiptWatermarkSnapshot.url",
      },
      portrait,
    )
  );
  assert.deepEqual(resolveReceiptWatermarkSettings(snapshot, portrait), {
    opacity: 0.32,
    scale: 65,
    rotate: true,
  });
});

Deno.test("finalização histórica mantém exatamente a apresentação landscape", async () => {
  const snapshot = createSnapshot();
  snapshot.assetSources.watermarkUrl = LANDSCAPE_PNG;
  snapshot.institutionalIdentity.watermarkUrl = LANDSCAPE_PNG;
  snapshot.institutionalIdentity.watermark = {
    url: LANDSCAPE_PNG,
    opacity: 0.11,
    scale: 50,
    rotate: false,
  };
  await assert.doesNotReject(() =>
    assertFrozenV3InstitutionalWatermark(
      snapshot,
      {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "documentSnapshot.assetSources.watermarkUrl",
      },
      null,
    )
  );
  assert.deepEqual(resolveReceiptWatermarkSettings(snapshot, null), {
    opacity: 0.11,
    scale: 50,
    rotate: false,
  });
});

Deno.test("finalização rejeita referências cruzadas entre gerações", async () => {
  const snapshot = createSnapshot();
  snapshot.assetSources.watermarkUrl = LANDSCAPE_PNG;
  snapshot.institutionalIdentity.watermarkUrl = LANDSCAPE_PNG;
  await assert.rejects(() =>
    assertFrozenV3InstitutionalWatermark(
      snapshot,
      {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "documentSnapshot.assetSources.watermarkUrl",
      },
      {
        schemaVersion: 1,
        source: "POLO_PORTRAIT_WATERMARK_V1",
        poloId: snapshot.source.poloId,
        url: PORTRAIT_PNG,
        opacity: 0.32,
        scale: 65,
        rotate: true,
      },
    )
  );
});
