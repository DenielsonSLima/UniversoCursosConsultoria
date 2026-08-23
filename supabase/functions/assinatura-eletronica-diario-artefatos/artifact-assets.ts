import type { PdfImage } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-image.core.ts";

export const MAX_CANONICAL_ASSET_BYTES = 12 * 1024 * 1024;
export const MAX_INLINE_WATERMARK_BYTES = 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_IMAGE_PIXELS = 12_000_000;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VALIDATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{7,127}$/u;
const INLINE_DATA_IMAGE_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u;

export type SupportedImageMime = "image/png" | "image/jpeg" | "image/webp";

export interface LoadedAssetBytes {
  bytes: Uint8Array;
  mimeType: string;
}

export interface InspectedImageAsset {
  bytes: Uint8Array;
  mimeType: SupportedImageMime;
  format: PdfImage["format"];
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}

export interface OwnStorageObjectReference {
  bucketId: string;
  storagePath: string;
}

export type DiarioPdfManifestImage = {
  mimeType: SupportedImageMime;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

type DiarioPdfSharedManifestAssets = {
  headerLogo: DiarioPdfManifestImage & {
    sourceKind: "HTTPS_URL";
    sourceUrl: string;
  };
  watermark:
    | null
    | (
      & DiarioPdfManifestImage
      & (
        | { sourceKind: "HTTPS_URL"; sourceUrl: string }
        | {
          sourceKind: "INLINE_DATA_URI";
          sourceRef: "documentSnapshot.assetSources.watermarkUrl";
        }
      )
    );
  validationQr: DiarioPdfManifestImage & {
    sourceKind: "GENERATED_QR";
    payload: string;
    mimeType: "image/png";
    width: 240;
    height: 240;
  };
};

export type DiarioPdfAssetManifestV1 = {
  schemaVersion: 1;
  source: "UNIVERSO_DIARIO_PDF_ASSETS_V1";
  documentSnapshotSha256: string;
  validationUrl: string;
  assets: DiarioPdfSharedManifestAssets;
};

export type DiarioPdfAssetManifestV2 = {
  schemaVersion: 2;
  source: "UNIVERSO_DIARIO_PDF_ASSETS_V2";
  documentSnapshotSha256: string;
  validationUrl: string;
  assets: DiarioPdfSharedManifestAssets & {
    backCoverBackground:
      | null
      | (DiarioPdfManifestImage & {
        sourceKind: "HTTPS_URL";
        sourceUrl: string;
      });
    backCoverImages: readonly (DiarioPdfManifestImage & {
      fieldId: string;
      sourceUrl: string;
    })[];
  };
};

/** V1 permanece somente para leitura/finalização de envelopes históricos. */
export type DiarioPdfAssetManifest =
  | DiarioPdfAssetManifestV1
  | DiarioPdfAssetManifestV2;

export const isDiarioPdfAssetManifestV2 = (
  manifest: DiarioPdfAssetManifest,
): manifest is DiarioPdfAssetManifestV2 => manifest.schemaVersion === 2;

const fail = (message: string): never => {
  throw new Error(message);
};

const normalizedMime = (value: string): SupportedImageMime => {
  const mime = String(value || "").trim().toLowerCase();
  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
    return fail("O recurso visual possui MIME não autorizado.");
  }
  return mime;
};

export const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
};

const readUint16BE = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] << 8) | bytes[offset + 1];

const readUint16LE = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8);

const readUint24LE = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const readUint32BE = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]) >>> 0;

const asciiAt = (bytes: Uint8Array, offset: number, expected: string) => {
  if (bytes.length < offset + expected.length) return false;
  return Array.from(expected).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
};

const pngDimensions = (bytes: Uint8Array) => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    !signature.every((byte, index) => bytes[index] === byte) ||
    !asciiAt(bytes, 12, "IHDR")
  ) return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
};

const jpegDimensions = (bytes: Uint8Array) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (sofMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        width: readUint16BE(bytes, offset + 5),
        height: readUint16BE(bytes, offset + 3),
      };
    }
    offset += segmentLength;
  }
  return null;
};

const webpDimensions = (bytes: Uint8Array) => {
  if (
    bytes.length < 30 ||
    !asciiAt(bytes, 0, "RIFF") ||
    !asciiAt(bytes, 8, "WEBP")
  ) return null;
  if (asciiAt(bytes, 12, "VP8X")) {
    return {
      width: readUint24LE(bytes, 24) + 1,
      height: readUint24LE(bytes, 27) + 1,
    };
  }
  if (asciiAt(bytes, 12, "VP8L") && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) +
        ((bytes[24] & 0x0f) << 10),
    };
  }
  if (
    asciiAt(bytes, 12, "VP8 ") &&
    bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a
  ) {
    return {
      width: readUint16LE(bytes, 26) & 0x3fff,
      height: readUint16LE(bytes, 28) & 0x3fff,
    };
  }
  return null;
};

const dimensionsForMime = (bytes: Uint8Array, mimeType: SupportedImageMime) => {
  if (mimeType === "image/png") return pngDimensions(bytes);
  if (mimeType === "image/jpeg") return jpegDimensions(bytes);
  return webpDimensions(bytes);
};

export const inspectImageAsset = async (
  loaded: LoadedAssetBytes,
  options: {
    maxBytes?: number;
    expectedMimeType?: SupportedImageMime;
    expectedByteSize?: number;
    expectedWidth?: number;
    expectedHeight?: number;
    expectedSha256?: string;
  } = {},
): Promise<InspectedImageAsset> => {
  const bytes = Uint8Array.from(loaded.bytes);
  const maxBytes = options.maxBytes ?? MAX_CANONICAL_ASSET_BYTES;
  if (bytes.length < 1 || bytes.length > maxBytes) {
    fail("O recurso visual excede o limite autorizado.");
  }
  const mimeType = normalizedMime(loaded.mimeType);
  if (options.expectedMimeType && mimeType !== options.expectedMimeType) {
    fail("O MIME do recurso visual diverge do manifesto congelado.");
  }
  const dimensions = dimensionsForMime(bytes, mimeType);
  if (!dimensions) return fail("A assinatura binária da imagem é inválida.");
  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width < 1 || dimensions.height < 1 ||
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) fail("As dimensões do recurso visual excedem o contrato autorizado.");
  const sha256 = await sha256Hex(bytes);
  if (
    (options.expectedByteSize !== undefined &&
      bytes.length !== options.expectedByteSize) ||
    (options.expectedWidth !== undefined &&
      dimensions.width !== options.expectedWidth) ||
    (options.expectedHeight !== undefined &&
      dimensions.height !== options.expectedHeight) ||
    (options.expectedSha256 !== undefined && sha256 !== options.expectedSha256)
  ) fail("O recurso visual diverge do snapshot congelado.");
  return {
    bytes,
    mimeType,
    format: mimeType === "image/png"
      ? "PNG"
      : mimeType === "image/jpeg"
      ? "JPEG"
      : "WEBP",
    byteSize: bytes.length,
    width: dimensions.width,
    height: dimensions.height,
    sha256,
  };
};

export const decodeCanonicalInlineDataImage = (
  source: string,
): LoadedAssetBytes => {
  const match = INLINE_DATA_IMAGE_PATTERN.exec(String(source || ""));
  if (!match || match[2].length % 4 !== 0) {
    return fail("A marca-d’água inline não possui data URI canônica.");
  }
  try {
    const decoded = atob(match[2]);
    if (
      decoded.length < 1 || decoded.length > MAX_INLINE_WATERMARK_BYTES ||
      btoa(decoded) !== match[2]
    ) return fail("A marca-d’água inline excede o contrato autorizado.");
    return {
      bytes: Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
      mimeType: `image/${match[1]}`,
    };
  } catch {
    return fail("A marca-d’água inline possui base64 inválido.");
  }
};

export const imageToDataUrl = (image: InspectedImageAsset) => {
  let binary = "";
  for (let offset = 0; offset < image.bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...image.bytes.subarray(offset, offset + 0x8000),
    );
  }
  return `data:${image.mimeType};base64,${btoa(binary)}`;
};

export const toPdfImage = (image: InspectedImageAsset): PdfImage => ({
  bytes: image.bytes,
  format: image.format,
});

export const parseOwnPublicStorageUrl = (
  source: string,
  supabaseUrl: string,
): OwnStorageObjectReference => {
  let parsed: URL;
  let project: URL;
  try {
    parsed = new URL(source);
    project = new URL(supabaseUrl);
  } catch {
    return fail("A URL do recurso canônico é inválida.");
  }
  const prefix = "/storage/v1/object/public/";
  if (
    parsed.protocol !== "https:" || parsed.port || parsed.username ||
    parsed.password ||
    parsed.search || parsed.hash || parsed.origin !== project.origin ||
    parsed.href !== source || !parsed.pathname.startsWith(prefix)
  ) return fail("O recurso canônico não pertence ao Storage autorizado.");
  const encoded = parsed.pathname.slice(prefix.length);
  const separator = encoded.indexOf("/");
  if (separator < 1 || separator === encoded.length - 1) {
    return fail("O caminho do recurso canônico é inválido.");
  }
  let bucketId: string;
  let storagePath: string;
  try {
    bucketId = decodeURIComponent(encoded.slice(0, separator));
    storagePath = encoded.slice(separator + 1).split("/").map(
      decodeURIComponent,
    ).join("/");
  } catch {
    return fail("O caminho do recurso canônico possui codificação inválida.");
  }
  if (
    !/^[A-Za-z0-9._-]{1,100}$/u.test(bucketId) ||
    !storagePath || storagePath.length > 1024 || storagePath.startsWith("/") ||
    storagePath.split("/").some((part) =>
      !part || part === "." || part === ".."
    )
  ) return fail("O caminho do recurso canônico não é autorizado.");
  return { bucketId, storagePath };
};

export const buildCanonicalValidationUrl = (
  allowedOrigin: string,
  basePath: string,
  code: string,
) => {
  if (!VALIDATION_CODE_PATTERN.test(code) || basePath !== "/validador") {
    return fail("O contrato de validação pública do Diário é inválido.");
  }
  let origin: URL;
  try {
    origin = new URL(allowedOrigin);
  } catch {
    return fail("A origem do validador não está configurada.");
  }
  if (
    origin.protocol !== "https:" || origin.port || origin.username ||
    origin.password ||
    origin.pathname !== "/" || origin.search || origin.hash ||
    origin.origin !== allowedOrigin ||
    /^(?:localhost|\[?::1\]?|127(?:\.\d{1,3}){3})$/iu.test(origin.hostname) ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(origin.hostname)
  ) return fail("A origem do validador não é uma origem HTTPS autorizada.");
  const result = new URL(basePath, origin.origin);
  result.searchParams.set("code", code);
  return result.href;
};

export const assertSha256 = (value: string, label: string) => {
  if (!SHA256_PATTERN.test(value)) fail(`${label} não é um SHA-256 canônico.`);
  return value;
};
