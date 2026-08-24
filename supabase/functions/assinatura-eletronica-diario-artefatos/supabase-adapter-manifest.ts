import {
  type DiarioPdfAssetManifest,
  type DiarioPdfAssetManifestV1,
  MAX_CANONICAL_ASSET_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_INLINE_WATERMARK_BYTES,
  type SupportedImageMime,
} from "./artifact-assets.ts";
import {
  MAX_BACK_COVER_IMAGE_COUNT,
  MAX_BACK_COVER_TOTAL_BYTES,
} from "./artifact-back-cover-assets.ts";
import {
  asRecord,
  requiredArray,
  requiredInteger,
  requiredRecord,
  requiredSha256,
  requiredString,
  unavailable,
} from "./supabase-adapter-support.ts";

export const normalizeManifestImage = (
  value: unknown,
  maximumBytes: number,
): {
  mimeType: SupportedImageMime;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
} => {
  const source = asRecord(value);
  const mimeType = requiredString(source, "mimeType", 32);
  if (
    mimeType !== "image/png" && mimeType !== "image/jpeg" &&
    mimeType !== "image/webp"
  ) {
    throw unavailable();
  }
  const byteSize = requiredInteger(source, "byteSize", 1, maximumBytes);
  const width = requiredInteger(source, "width", 1, MAX_IMAGE_DIMENSION);
  const height = requiredInteger(source, "height", 1, MAX_IMAGE_DIMENSION);
  if (width * height > MAX_IMAGE_PIXELS) throw unavailable();
  return {
    mimeType: mimeType as SupportedImageMime,
    byteSize,
    width,
    height,
    sha256: requiredSha256(source, "sha256"),
  };
};

export const normalizePdfAssetManifest = (
  value: unknown,
): DiarioPdfAssetManifest => {
  const source = asRecord(value);
  const schemaVersion = source?.schemaVersion;
  if (
    !(
      schemaVersion === 1 &&
        source?.source === "UNIVERSO_DIARIO_PDF_ASSETS_V1" ||
      schemaVersion === 2 &&
        source?.source === "UNIVERSO_DIARIO_PDF_ASSETS_V2" ||
      schemaVersion === 3 &&
        source?.source === "UNIVERSO_DIARIO_PDF_ASSETS_V3"
    )
  ) throw unavailable();
  const assets = requiredRecord(source, "assets");
  const header = requiredRecord(assets, "headerLogo");
  if (header.sourceKind !== "HTTPS_URL") throw unavailable();
  const headerLogo: DiarioPdfAssetManifest["assets"]["headerLogo"] = {
    sourceKind: "HTTPS_URL",
    sourceUrl: requiredString(header, "sourceUrl", 2048),
    ...normalizeManifestImage(header, MAX_CANONICAL_ASSET_BYTES),
  };
  const watermarkSource = assets.watermark;
  let watermark: DiarioPdfAssetManifest["assets"]["watermark"] = null;
  if (watermarkSource !== null) {
    const candidate = asRecord(watermarkSource);
    const common = normalizeManifestImage(
      candidate,
      MAX_INLINE_WATERMARK_BYTES,
    );
    if (candidate?.sourceKind === "INLINE_DATA_URI") {
      if (
        candidate.sourceRef !== "documentSnapshot.assetSources.watermarkUrl"
      ) {
        throw unavailable();
      }
      watermark = {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "documentSnapshot.assetSources.watermarkUrl",
        ...common,
      };
    } else if (candidate?.sourceKind === "HTTPS_URL") {
      watermark = {
        sourceKind: "HTTPS_URL",
        sourceUrl: requiredString(candidate, "sourceUrl", 2048),
        ...common,
      };
    } else throw unavailable();
  }
  const qr = requiredRecord(assets, "validationQr");
  if (
    qr.sourceKind !== "GENERATED_QR" || qr.mimeType !== "image/png" ||
    qr.width !== 240 || qr.height !== 240
  ) throw unavailable();
  const sharedAssets: DiarioPdfAssetManifestV1["assets"] = {
    headerLogo,
    watermark,
    validationQr: {
      sourceKind: "GENERATED_QR",
      payload: requiredString(qr, "payload", 2048),
      mimeType: "image/png",
      byteSize: requiredInteger(
        qr,
        "byteSize",
        1,
        MAX_INLINE_WATERMARK_BYTES,
      ),
      width: 240,
      height: 240,
      sha256: requiredSha256(qr, "sha256"),
    },
  };
  const shared = {
    documentSnapshotSha256: requiredSha256(source, "documentSnapshotSha256"),
    validationUrl: requiredString(source, "validationUrl", 2048),
    assets: sharedAssets,
  };
  if (schemaVersion === 1) {
    return {
      schemaVersion: 1,
      source: "UNIVERSO_DIARIO_PDF_ASSETS_V1",
      ...shared,
    };
  }
  const normalizeHttpsImage = (value: unknown) => {
    if (value === null) return null;
    const image = asRecord(value);
    if (image?.sourceKind !== "HTTPS_URL") throw unavailable();
    return {
      sourceKind: "HTTPS_URL" as const,
      sourceUrl: requiredString(image, "sourceUrl", 2048),
      ...normalizeManifestImage(image, MAX_CANONICAL_ASSET_BYTES),
    };
  };
  const backCoverBackground = normalizeHttpsImage(
    assets.backCoverBackground,
  );
  const imageIds = new Set<string>();
  const backCoverImages = requiredArray(assets, "backCoverImages").map(
    (candidate) => {
      const image = asRecord(candidate);
      const fieldId = requiredString(image, "fieldId", 80);
      if (imageIds.has(fieldId)) throw unavailable();
      imageIds.add(fieldId);
      return {
        fieldId,
        sourceUrl: requiredString(image, "sourceUrl", 2048),
        ...normalizeManifestImage(image, MAX_CANONICAL_ASSET_BYTES),
      };
    },
  );
  if (
    backCoverImages.length > MAX_BACK_COVER_IMAGE_COUNT ||
    (backCoverBackground?.byteSize || 0) +
          backCoverImages.reduce((sum, image) => sum + image.byteSize, 0) >
      MAX_BACK_COVER_TOTAL_BYTES
  ) throw unavailable();
  const backCoverAssets = {
    backCoverBackground,
    backCoverImages,
  };
  if (schemaVersion === 2) {
    return {
      schemaVersion: 2,
      source: "UNIVERSO_DIARIO_PDF_ASSETS_V2",
      ...shared,
      assets: { ...shared.assets, ...backCoverAssets },
    };
  }
  return {
    schemaVersion: 3,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V3",
    ...shared,
    assets: {
      ...shared.assets,
      ...backCoverAssets,
      coverBackground: normalizeHttpsImage(assets.coverBackground),
    },
  };
};
