import assert from "node:assert/strict";
import {
  normalizeReceiptWatermarkReference,
  normalizeReceiptWatermarkSnapshot,
} from "./supabase-adapter-receipt-watermark.ts";

const POLO_ID = "00000000-0000-4000-8000-000000000001";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const portrait = () => ({
  schemaVersion: 1,
  source: "POLO_PORTRAIT_WATERMARK_V1",
  poloId: POLO_ID,
  url: PNG,
  opacity: 0.18,
  scale: 55,
  rotate: false,
});

Deno.test("normalizador preserva NULL como contrato histórico", () => {
  assert.equal(normalizeReceiptWatermarkSnapshot(undefined), null);
  assert.equal(normalizeReceiptWatermarkSnapshot(null), null);
  assert.deepEqual(
    normalizeReceiptWatermarkReference({
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "documentSnapshot.assetSources.watermarkUrl",
    }, null),
    {
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "documentSnapshot.assetSources.watermarkUrl",
    },
  );
});

Deno.test("normalizador aceita descritor retrato fechado e referência própria", () => {
  const normalized = normalizeReceiptWatermarkSnapshot(portrait());
  assert.deepEqual(normalized, portrait());
  assert.deepEqual(
    normalizeReceiptWatermarkReference({
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "receiptWatermarkSnapshot.url",
    }, normalized),
    {
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "receiptWatermarkSnapshot.url",
    },
  );
});

Deno.test("normalizador rejeita mistura entre contrato atual e legado", () => {
  const normalized = normalizeReceiptWatermarkSnapshot(portrait());
  assert.throws(() =>
    normalizeReceiptWatermarkReference({
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "documentSnapshot.assetSources.watermarkUrl",
    }, normalized)
  );
  assert.throws(() =>
    normalizeReceiptWatermarkReference({
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "receiptWatermarkSnapshot.url",
    }, null)
  );
  assert.throws(() =>
    normalizeReceiptWatermarkSnapshot({ ...portrait(), clientHint: true })
  );
  assert.throws(() =>
    normalizeReceiptWatermarkSnapshot({ ...portrait(), scale: 53 })
  );
});
