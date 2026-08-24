import type {
  ReceiptInstitutionalWatermarkReference,
  ReceiptWatermarkSnapshot,
} from "./artifact-contracts.ts";
import {
  asRecord,
  requiredFiniteNumber,
  requiredInteger,
  requiredString,
  requiredUuid,
  unavailable,
} from "./supabase-adapter-support.ts";

const PORTRAIT_SOURCE = "POLO_PORTRAIT_WATERMARK_V1" as const;
const LEGACY_INLINE_REF = "documentSnapshot.assetSources.watermarkUrl" as const;
const PORTRAIT_INLINE_REF = "receiptWatermarkSnapshot.url" as const;

const exactKeys = (
  source: Record<string, unknown>,
  expected: readonly string[],
) =>
  Object.keys(source).length === expected.length &&
  Object.keys(source).every((key) => expected.includes(key));

export const normalizeReceiptWatermarkSnapshot = (
  value: unknown,
): ReceiptWatermarkSnapshot => {
  // Ausência e NULL identificam exclusivamente envelopes históricos.
  if (value === undefined || value === null) return null;
  const source = asRecord(value);
  if (
    !source ||
    !exactKeys(source, [
      "schemaVersion",
      "source",
      "poloId",
      "url",
      "opacity",
      "scale",
      "rotate",
    ]) ||
    source.schemaVersion !== 1 ||
    source.source !== PORTRAIT_SOURCE ||
    typeof source.rotate !== "boolean"
  ) throw unavailable();
  const url = requiredString(source, "url", 16 * 1024 * 1024);
  const opacity = requiredFiniteNumber(source, "opacity");
  const scale = requiredInteger(source, "scale", 10, 100);
  if (
    !/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/]+={0,2}$/iu.test(url) ||
    opacity < 0 || opacity > 1 || scale % 5 !== 0
  ) throw unavailable();
  return {
    schemaVersion: 1,
    source: PORTRAIT_SOURCE,
    poloId: requiredUuid(source, "poloId"),
    url,
    opacity,
    scale,
    rotate: source.rotate,
  };
};

export const normalizeReceiptWatermarkReference = (
  value: unknown,
  snapshot: ReceiptWatermarkSnapshot,
): ReceiptInstitutionalWatermarkReference => {
  if (value === null) {
    if (snapshot !== null) throw unavailable();
    return null;
  }
  const source = asRecord(value);
  if (source?.sourceKind === "INLINE_DATA_URI") {
    if (Object.keys(source).length !== 2) throw unavailable();
    if (snapshot === null && source.sourceRef === LEGACY_INLINE_REF) {
      return { sourceKind: "INLINE_DATA_URI", sourceRef: LEGACY_INLINE_REF };
    }
    if (snapshot !== null && source.sourceRef === PORTRAIT_INLINE_REF) {
      return {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: PORTRAIT_INLINE_REF,
      };
    }
    throw unavailable();
  }
  if (snapshot !== null || source?.sourceKind !== "HTTPS_URL") {
    throw unavailable();
  }
  if (Object.keys(source).length !== 2) throw unavailable();
  return {
    sourceKind: "HTTPS_URL",
    sourceUrl: requiredString(source, "sourceUrl", 2048),
  };
};
