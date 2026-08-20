// deno-lint-ignore no-import-prefix -- Supabase Edge exige versão reprodutível.
import { createClient } from "npm:@supabase/supabase-js@2.106.1";
import {
  type AuthenticatedIdentity,
  type DiarioArtifactDependencies,
  type FinalizationPreflight,
  type FrozenSnapshotIntegrity,
  type OriginalPreparePreflight,
  PublicHttpError,
  type ReceiptInstitutionalWatermarkReference,
  SIGNATURE_ARTIFACT_BUCKET,
  SIGNATURE_MODEL_ASSET_BUCKET,
  type StorageArtifactReference,
  type StoredModelAssetReference,
} from "./artifacts.ts";
import {
  type DiarioPdfAssetManifest,
  MAX_CANONICAL_ASSET_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_INLINE_WATERMARK_BYTES,
  parseOwnPublicStorageUrl,
  sha256Hex,
  type SupportedImageMime,
} from "./artifact-assets.ts";
import {
  createDiaryPdfSemanticManifest,
  DIARY_PDF_SEMANTIC_MANIFEST_SOURCE,
  type DiaryPdfSemanticManifest,
} from "../../../modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts";
import type {
  FrozenPdfSignatureTarget,
  InspectedPdfPage,
} from "../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts";
import { ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS } from "../../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts";

export const PREPARE_ORIGINAL_RPC =
  "assinatura_eletronica_internal_preparar_original_diario_seguro";
export const REGISTER_ORIGINAL_RPC =
  "assinatura_eletronica_rpc_publicar_original_diario";
export const START_FINALIZATION_RPC =
  "assinatura_eletronica_rpc_iniciar_finalizacao_diario";
export const REGISTER_FINAL_RPC =
  "assinatura_eletronica_rpc_finalizar_artefatos_diario";
export const RESERVE_UPLOAD_RPC =
  "assinatura_eletronica_internal_reservar_upload_diario";
export const CLAIM_ORPHAN_UPLOADS_RPC =
  "assinatura_eletronica_internal_claim_uploads_orfaos";
export const VALIDATE_ORPHAN_CLAIM_RPC =
  "assinatura_eletronica_internal_validar_claim_orfao";
export const COMPLETE_ORPHAN_CLEANUP_RPC =
  "assinatura_eletronica_internal_concluir_cleanup_upload";
export const REPORT_ORPHAN_CLEANUP_RPC =
  "assinatura_eletronica_internal_reportar_cleanup_upload";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MASKED_CPF_PATTERN = /^\*\*\*\.\*\*\*\.\*\*\*-[0-9]{2}$/u;
const SIGNATURE_CODE_PATTERN =
  /^SIG-[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/u;

type RpcResult = { data: unknown; error: unknown };
type StorageResult<T> = { data: T | null; error: unknown };

type StorageBucket = {
  download: (path: string) => PromiseLike<StorageResult<Blob>>;
  upload: (
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; cacheControl: string; upsert: false },
  ) => PromiseLike<StorageResult<{ path?: string }>>;
  remove: (
    paths: string[],
  ) => PromiseLike<StorageResult<Array<{ name?: string }>>>;
};

type AdminClient = {
  auth: {
    getClaims: (
      bearer: string,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
    getUser: (bearer: string) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
  storage: { from: (bucketId: string) => StorageBucket };
};

type ClientFactory = (
  supabaseUrl: string,
  apiKey: string,
  options: Record<string, unknown>,
) => AdminClient;

type OrphanUploadClaim = {
  intentId: string;
  leaseToken: string;
  envelopeId: string;
  artifactClass:
    | "DOCUMENTO_ORIGINAL"
    | "DOCUMENTO_FINAL"
    | "COMPROVANTE_EVIDENCIA";
  bucketId: string;
  storagePath: string;
  byteSize: number;
  sha256: string;
};

export type DiarioArtifactRuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  validationOrigin: string;
  validationAllowedOrigins: readonly string[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const unwrapRecord = (value: unknown) =>
  asRecord(Array.isArray(value) ? value[0] : value);

const unavailable = (cause?: unknown) =>
  new PublicHttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "O serviço de documentos está temporariamente indisponível.",
    cause,
  );

const sessionInvalid = () =>
  new PublicHttpError(401, "SESSION_INVALID", "Sua sessão não é mais válida.");

const requiredString = (
  source: Record<string, unknown> | null,
  key: string,
  maximumLength = 4096,
) => {
  const value = typeof source?.[key] === "string" ? source[key].trim() : "";
  if (!value || value.length > maximumLength) throw unavailable();
  return value;
};

const requiredUuid = (source: Record<string, unknown> | null, key: string) => {
  const value = requiredString(source, key, 36).toLowerCase();
  if (!UUID_PATTERN.test(value)) throw unavailable();
  return value;
};

const requiredSha256 = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = requiredString(source, key, 64).toLowerCase();
  if (!SHA256_PATTERN.test(value)) throw unavailable();
  return value;
};

const requiredInteger = (
  source: Record<string, unknown> | null,
  key: string,
  minimum: number,
  maximum: number,
) => {
  const value = Number(source?.[key]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw unavailable();
  }
  return value;
};

const requiredRecord = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = asRecord(source?.[key]);
  if (!value) throw unavailable();
  return value;
};

const requiredArray = (source: Record<string, unknown> | null, key: string) => {
  const value = source?.[key];
  if (!Array.isArray(value)) throw unavailable();
  return value;
};

const requiredFiniteNumber = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = source?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw unavailable();
  return value;
};

const normalizeSemanticManifest = (
  value: unknown,
): DiaryPdfSemanticManifest => {
  const source = asRecord(value);
  if (
    source?.schemaVersion !== 1 ||
    source.source !== DIARY_PDF_SEMANTIC_MANIFEST_SOURCE ||
    source.semanticTarget !== "DIARIO_LAST_CONTENT_PAGE"
  ) throw unavailable();
  const pageCount = requiredInteger(source, "pageCount", 1, 500);
  const targetPageIndex = requiredInteger(
    source,
    "targetPageIndex",
    0,
    pageCount - 1,
  );
  const rawInstructions = source.instructionsPageIndex;
  const instructionsPageIndex = rawInstructions === null
    ? null
    : requiredInteger(source, "instructionsPageIndex", 0, pageCount - 1);
  try {
    return createDiaryPdfSemanticManifest({
      pageCount,
      targetPageIndex,
      instructionsPageIndex,
    });
  } catch (error) {
    throw unavailable(error);
  }
};

const normalizeBox = (value: unknown) => {
  const source = asRecord(value);
  const result = {
    x: requiredFiniteNumber(source, "x"),
    y: requiredFiniteNumber(source, "y"),
    width: requiredFiniteNumber(source, "width"),
    height: requiredFiniteNumber(source, "height"),
  };
  if (result.width <= 0 || result.height <= 0) throw unavailable();
  return result;
};

const normalizePdfPage = (
  value: unknown,
  pageCount: number,
): InspectedPdfPage => {
  const source = asRecord(value);
  const pageIndex = requiredInteger(source, "pageIndex", 0, pageCount - 1);
  const pageNumber = requiredInteger(source, "pageNumber", 1, pageCount);
  const rotationDegrees = requiredInteger(source, "rotationDegrees", 0, 270);
  if (
    pageNumber !== pageIndex + 1 ||
    ![0, 90, 180, 270].includes(rotationDegrees)
  ) throw unavailable();
  const mediaBox = normalizeBox(source?.mediaBox);
  const cropBox = normalizeBox(source?.cropBox);
  const visibleWidth = requiredFiniteNumber(source, "visibleWidth");
  const visibleHeight = requiredFiniteNumber(source, "visibleHeight");
  if (visibleWidth <= 0 || visibleHeight <= 0) throw unavailable();
  return {
    pageIndex,
    pageNumber,
    mediaBox,
    cropBox,
    rotationDegrees: rotationDegrees as 0 | 90 | 180 | 270,
    visibleWidth,
    visibleHeight,
  };
};

const normalizeFrozenTarget = (value: unknown): FrozenPdfSignatureTarget => {
  const source = asRecord(value);
  if (source?.semanticTarget !== "DIARIO_LAST_CONTENT_PAGE") {
    throw unavailable();
  }
  const pageCount = requiredInteger(source, "pageCount", 1, 500);
  const targetPageIndex = requiredInteger(
    source,
    "targetPageIndex",
    0,
    pageCount - 1,
  );
  const manifest = normalizeSemanticManifest(source?.manifest);
  const targetPage = normalizePdfPage(source?.targetPage, pageCount);
  if (
    manifest.pageCount !== pageCount ||
    manifest.targetPageIndex !== targetPageIndex ||
    targetPage.pageIndex !== targetPageIndex
  ) throw unavailable();
  return {
    originalSha256: requiredSha256(source, "originalSha256"),
    pageCount,
    semanticTarget: "DIARIO_LAST_CONTENT_PAGE",
    manifest,
    targetPageIndex,
    targetPage,
  };
};

const normalizeManifestImage = (
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

const normalizePdfAssetManifest = (value: unknown): DiarioPdfAssetManifest => {
  const source = asRecord(value);
  if (
    source?.schemaVersion !== 1 ||
    source.source !== "UNIVERSO_DIARIO_PDF_ASSETS_V1"
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
  return {
    schemaVersion: 1,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V1",
    documentSnapshotSha256: requiredSha256(source, "documentSnapshotSha256"),
    validationUrl: requiredString(source, "validationUrl", 2048),
    assets: {
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
    },
  };
};

export const authenticateBearer = async (
  admin: AdminClient,
  bearer: string,
): Promise<AuthenticatedIdentity> => {
  const { data: claimsData, error: claimsError } = await admin.auth.getClaims(
    bearer,
  );
  const claims = asRecord(asRecord(claimsData)?.claims);
  const userId = typeof claims?.sub === "string"
    ? claims.sub.trim().toLowerCase()
    : "";
  const sessionId = typeof claims?.session_id === "string"
    ? claims.session_id.trim().toLowerCase()
    : "";
  if (
    claimsError || !UUID_PATTERN.test(userId) ||
    !UUID_PATTERN.test(sessionId) ||
    claims?.role !== "authenticated" || claims?.is_anonymous === true
  ) throw sessionInvalid();
  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  const user = asRecord(asRecord(userData)?.user);
  if (
    userError || String(user?.id || "").trim().toLowerCase() !== userId ||
    user?.is_anonymous === true
  ) throw sessionInvalid();
  return { userId, sessionId };
};

const normalizeIntegrity = (value: unknown): FrozenSnapshotIntegrity => {
  const source = asRecord(value);
  if (
    source?.schemaVersion !== 1 ||
    source.canonicalization !== "POSTGRES_JSONB_TEXT_UTF8_V1" ||
    source.hashAlgorithm !== "SHA-256" || source.encoding !== "UTF-8"
  ) throw unavailable();
  return {
    schemaVersion: 1,
    canonicalization: "POSTGRES_JSONB_TEXT_UTF8_V1",
    hashAlgorithm: "SHA-256",
    encoding: "UTF-8",
    canonicalJson: requiredString(source, "canonicalJson", 4 * 1024 * 1024),
    documentSnapshotSha256: requiredSha256(source, "documentSnapshotSha256"),
    academicRevisionSha256: requiredSha256(source, "academicRevisionSha256"),
    templateSourceSha256: requiredSha256(source, "templateSourceSha256"),
  };
};

const normalizeVerification = (value: unknown) => {
  const source = asRecord(value);
  const basePath = requiredString(source, "basePath", 32);
  if (basePath !== "/validador") throw unavailable();
  return { code: requiredString(source, "code", 128), basePath } as const;
};

const normalizeStorageReference = (
  value: unknown,
  options: { requireIntegrity?: boolean } = {},
): StorageArtifactReference => {
  const source = asRecord(value);
  const result: StorageArtifactReference = {
    bucketId: requiredString(source, "bucketId", 100),
    storagePath: requiredString(source, "storagePath", 1024),
  };
  if (options.requireIntegrity) {
    result.byteSize = requiredInteger(source, "byteSize", 1, 50 * 1024 * 1024);
    result.sha256 = requiredSha256(source, "sha256");
  }
  return result;
};

const normalizeModelAsset = (value: unknown): StoredModelAssetReference => {
  const source = asRecord(value);
  const mimeType = requiredString(source, "mimeType", 32);
  if (mimeType !== "image/png") throw unavailable();
  return {
    assetId: requiredUuid(source, "assetId"),
    bucketId: requiredString(source, "bucketId", 100),
    storagePath: requiredString(source, "storagePath", 1024),
    mimeType,
    byteSize: requiredInteger(source, "byteSize", 1, 1024 * 1024),
    width: requiredInteger(source, "width", 1, 4096),
    height: requiredInteger(source, "height", 1, 4096),
    sha256: requiredSha256(source, "sha256"),
  };
};

const normalizeInstitutionalWatermarkReference = (
  value: unknown,
): ReceiptInstitutionalWatermarkReference => {
  if (value === null) return null;
  const source = asRecord(value);
  if (source?.sourceKind === "INLINE_DATA_URI") {
    if (
      Object.keys(source).length !== 2 ||
      source.sourceRef !== "documentSnapshot.assetSources.watermarkUrl"
    ) throw unavailable();
    return {
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "documentSnapshot.assetSources.watermarkUrl",
    };
  }
  if (source?.sourceKind === "HTTPS_URL") {
    if (Object.keys(source).length !== 2) throw unavailable();
    return {
      sourceKind: "HTTPS_URL",
      sourceUrl: requiredString(source, "sourceUrl", 2048),
    };
  }
  throw unavailable();
};

export const normalizeOriginalPreflight = (
  value: unknown,
): OriginalPreparePreflight => {
  const source = unwrapRecord(value);
  const documentSnapshotIntegrity = normalizeIntegrity(
    source?.documentSnapshotIntegrity,
  );
  const documentSnapshotSha256 = requiredSha256(
    source,
    "documentSnapshotSha256",
  );
  if (
    documentSnapshotIntegrity.documentSnapshotSha256 !== documentSnapshotSha256
  ) {
    throw unavailable();
  }
  return {
    envelopeId: requiredUuid(source, "envelopeId"),
    status: requiredString(source, "status", 64),
    documentSnapshotIntegrity,
    documentSnapshotSha256,
    geometrySnapshot: requiredRecord(source, "geometrySnapshot"),
    participants: requiredArray(source, "participants"),
    policySnapshot: requiredRecord(source, "policySnapshot"),
    certificateSnapshot: requiredRecord(source, "certificateSnapshot"),
    originalDestination: normalizeStorageReference(source?.originalDestination),
    verification: normalizeVerification(source?.verification),
  };
};

export const normalizeFinalizationPreflight = (
  value: unknown,
): FinalizationPreflight => {
  const source = unwrapRecord(value);
  const documentSnapshotIntegrity = normalizeIntegrity(
    source?.documentSnapshotIntegrity,
  );
  const documentSnapshotSha256 = requiredSha256(
    source,
    "documentSnapshotSha256",
  );
  if (
    documentSnapshotIntegrity.documentSnapshotSha256 !== documentSnapshotSha256
  ) {
    throw unavailable();
  }
  const participants = requiredArray(source, "participants").map(
    (item, index) => {
      const participant = asRecord(item);
      const role = requiredString(participant, "role", 32);
      const order = requiredInteger(
        participant,
        "order",
        1,
        ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS,
      );
      const signatureEventId = requiredUuid(
        participant,
        "signatureEventId",
      );
      const verificationCode = requiredString(
        participant,
        "verificationCode",
        40,
      );
      const verificationPath = requiredString(
        participant,
        "verificationPath",
        64,
      );
      if (
        order !== index + 1 ||
        !SIGNATURE_CODE_PATTERN.test(verificationCode) ||
        verificationCode !== `SIG-${signatureEventId.toUpperCase()}` ||
        verificationPath !== `/validador?code=${verificationCode}`
      ) throw unavailable();
      const signerCpfMasked = requiredString(
        participant,
        "signerCpfMasked",
        14,
      );
      if (!MASKED_CPF_PATTERN.test(signerCpfMasked)) throw unavailable();
      return {
        participantId: requiredUuid(participant, "participantId"),
        role,
        order,
        status: requiredString(participant, "status", 32),
        signerName: requiredString(participant, "signerName", 300),
        signerCpfMasked,
        signedAt: requiredString(participant, "signedAt", 64),
        signatureEventId,
        signatureHash: requiredSha256(participant, "signatureHash"),
        verificationCode,
        verificationPath,
      };
    },
  );
  if (
    participants.length < 1 ||
    participants.length > ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS
  ) throw unavailable();
  const signatureEvents = requiredArray(source, "signatureEvents").map(
    (item) => {
      const event = asRecord(item);
      const type = requiredString(event, "type", 64);
      const method = requiredString(event, "method", 64);
      if (type !== "ASSINATURA_CONCLUIDA" || method !== "SENHA_REAUTENTICADA") {
        throw unavailable();
      }
      return {
        type,
        occurredAt: requiredString(event, "occurredAt", 64),
        participantId: requiredUuid(event, "participantId"),
        method,
        eventId: requiredUuid(event, "eventId"),
        signatureHash: requiredSha256(event, "signatureHash"),
      };
    },
  );
  if (signatureEvents.length !== participants.length) throw unavailable();
  const references = requiredRecord(source, "receiptAssetReferences");
  const logo = requiredRecord(references, "logo");
  const customWatermarks = requiredArray(references, "customWatermarks").map(
    (item) => {
      const row = asRecord(item);
      const page = requiredInteger(row, "page", 1, 2) as 1 | 2;
      return { ...normalizeModelAsset(row), page } as const;
    },
  );
  return {
    envelopeId: requiredUuid(source, "envelopeId"),
    status: requiredString(source, "status", 64),
    documentSnapshotIntegrity,
    documentSnapshotSha256,
    geometrySnapshot: requiredRecord(source, "geometrySnapshot"),
    semanticManifestSnapshot: normalizeSemanticManifest(
      source?.semanticManifestSnapshot,
    ),
    frozenSignatureTargetSnapshot: normalizeFrozenTarget(
      source?.frozenSignatureTargetSnapshot,
    ),
    pdfAssetManifestSnapshot: normalizePdfAssetManifest(
      source?.pdfAssetManifestSnapshot,
    ),
    originalArtifact: normalizeStorageReference(source?.originalArtifact, {
      requireIntegrity: true,
    }) as FinalizationPreflight["originalArtifact"],
    participants: participants as FinalizationPreflight["participants"],
    signatureEvents:
      signatureEvents as FinalizationPreflight["signatureEvents"],
    receiptPayload: requiredRecord(
      source,
      "receiptPayload",
    ) as FinalizationPreflight["receiptPayload"],
    receiptAssetReferences: {
      logo: { sourceUrl: requiredString(logo, "sourceUrl", 2048) },
      institutionalWatermark: normalizeInstitutionalWatermarkReference(
        references.institutionalWatermark,
      ),
      customWatermarks,
    },
    stampAsset: normalizeModelAsset(source?.stampAsset),
    verification: normalizeVerification(source?.verification),
  };
};

const callRpc = async (
  admin: AdminClient,
  name: string,
  args: Record<string, unknown>,
) => {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
};

const normalizeOrphanUploadClaims = (value: unknown): OrphanUploadClaim[] => {
  if (!Array.isArray(value) || value.length > 50) throw unavailable();
  return value.map((item) => {
    const source = asRecord(item);
    const artifactClass = requiredString(source, "class", 32);
    if (
      artifactClass !== "DOCUMENTO_ORIGINAL" &&
      artifactClass !== "DOCUMENTO_FINAL" &&
      artifactClass !== "COMPROVANTE_EVIDENCIA"
    ) throw unavailable();
    const envelopeId = requiredUuid(source, "envelopeId");
    const storagePath = requiredString(source, "storagePath", 1024);
    const expectedPath = `envelopes/${envelopeId}/${
      artifactClass === "DOCUMENTO_ORIGINAL"
        ? "documento-original.pdf"
        : artifactClass === "DOCUMENTO_FINAL"
        ? "documento-final.pdf"
        : "comprovante-evidencia.pdf"
    }`;
    if (storagePath !== expectedPath) throw unavailable();
    const bucketId = requiredString(source, "bucketId", 100);
    if (bucketId !== SIGNATURE_ARTIFACT_BUCKET) throw unavailable();
    return {
      intentId: requiredUuid(source, "intentId"),
      leaseToken: requiredUuid(source, "leaseToken"),
      envelopeId,
      artifactClass,
      bucketId,
      storagePath,
      byteSize: requiredInteger(source, "byteSize", 1, 50 * 1024 * 1024),
      sha256: requiredSha256(source, "sha256"),
    };
  });
};

const requiredBoolean = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = source?.[key];
  if (typeof value !== "boolean") throw unavailable();
  return value;
};

const downloadObject = async (
  admin: AdminClient,
  reference: Pick<StorageArtifactReference, "bucketId" | "storagePath">,
  maxBytes: number,
) => {
  const { data, error } = await admin.storage.from(reference.bucketId).download(
    reference.storagePath,
  );
  if (error || !data || data.size < 1 || data.size > maxBytes) {
    throw unavailable(error);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength !== data.size) throw unavailable();
  return { bytes, mimeType: String(data.type || "").trim().toLowerCase() };
};

const isExactAllowedOrigin = (
  origin: string,
  allowed: readonly string[],
) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && !parsed.port && !parsed.username &&
      !parsed.password && parsed.pathname === "/" && !parsed.search &&
      !parsed.hash &&
      parsed.origin === origin && allowed.includes(origin);
  } catch {
    return false;
  }
};

const reportCleanupOutcome = async (
  admin: AdminClient,
  claim: OrphanUploadClaim,
  result: "FALHA_TRANSITORIA" | "HASH_DIVERGENTE",
) => {
  await callRpc(admin, REPORT_ORPHAN_CLEANUP_RPC, {
    p_intent_id: claim.intentId,
    p_lease_token: claim.leaseToken,
    p_resultado: result,
  });
};

const reconcileExpiredUploadIntents = async (
  admin: AdminClient,
): Promise<void> => {
  const claims = normalizeOrphanUploadClaims(
    await callRpc(admin, CLAIM_ORPHAN_UPLOADS_RPC, { p_limit: 1 }),
  );
  for (const claim of claims) {
    let bytes: Uint8Array;
    try {
      bytes = (await downloadObject(
        admin,
        claim,
        50 * 1024 * 1024,
      )).bytes;
    } catch {
      // O objeto pode ter desaparecido depois do claim. Nunca inferimos isso a
      // partir do erro HTTP: liberamos a lease e o banco reavalia no próximo TTL.
      await reportCleanupOutcome(
        admin,
        claim,
        "FALHA_TRANSITORIA",
      ).catch(() => undefined);
      continue;
    }
    if (
      bytes.byteLength !== claim.byteSize ||
      await sha256Hex(bytes) !== claim.sha256
    ) {
      // Um path determinístico com bytes diferentes é incidente, não órfão.
      await reportCleanupOutcome(
        admin,
        claim,
        "HASH_DIVERGENTE",
      ).catch(() => undefined);
      continue;
    }

    let validated: Record<string, unknown> | null;
    try {
      validated = unwrapRecord(
        await callRpc(admin, VALIDATE_ORPHAN_CLAIM_RPC, {
          p_intent_id: claim.intentId,
          p_lease_token: claim.leaseToken,
        }),
      );
    } catch {
      await reportCleanupOutcome(
        admin,
        claim,
        "FALHA_TRANSITORIA",
      ).catch(() => undefined);
      continue;
    }
    if (!requiredBoolean(validated, "deleteAllowed")) continue;

    const removed = await admin.storage.from(claim.bucketId).remove([
      claim.storagePath,
    ]);
    if (removed.error) {
      await reportCleanupOutcome(
        admin,
        claim,
        "FALHA_TRANSITORIA",
      ).catch(() => undefined);
      continue;
    }
    try {
      await callRpc(admin, COMPLETE_ORPHAN_CLEANUP_RPC, {
        p_intent_id: claim.intentId,
        p_lease_token: claim.leaseToken,
      });
    } catch {
      // Se a confirmação falhar depois do remove, a intenção permanece
      // fenced. Depois da quarentena, o próximo claim observa storage.objects
      // ausente e encerra a intenção sem liberar cedo o path.
    }
  }
};

export const createSupabaseDiarioArtifactDependencies = (
  config: DiarioArtifactRuntimeConfig,
  factory: ClientFactory = createClient as unknown as ClientFactory,
): DiarioArtifactDependencies => {
  if (
    !config.supabaseUrl || !config.serviceRoleKey ||
    !isExactAllowedOrigin(
      config.validationOrigin,
      config.validationAllowedOrigins,
    )
  ) throw unavailable();
  const admin = factory(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const actorArgs = (input: {
    envelopeId: string;
    userId: string;
    sessionId: string;
    requestId: string;
  }) => ({
    p_envelope_id: input.envelopeId,
    p_actor_auth_user_id: input.userId,
    p_auth_session_id: input.sessionId,
    p_request_id: input.requestId,
  });
  const scheduleBackgroundTask = (task: () => Promise<void>) => {
    const processing = task().catch(() => undefined);
    const edgeRuntime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (typeof edgeRuntime?.waitUntil === "function") {
      edgeRuntime.waitUntil(processing);
    }
    // O fallback local inicia a Promise, mas não a aguarda. Em produção a Edge
    // fornece waitUntil; em testes esta função continua injetável pelo adapter.
  };
  return {
    validationOrigin: config.validationOrigin,
    authenticate: (bearer) => authenticateBearer(admin, bearer),
    prepareOriginal: async (input) =>
      normalizeOriginalPreflight(
        await callRpc(admin, PREPARE_ORIGINAL_RPC, actorArgs(input)),
      ),
    registerOriginal: async (input) => {
      const result = unwrapRecord(
        await callRpc(admin, REGISTER_ORIGINAL_RPC, {
          p_envelope_id: input.envelopeId,
          p_actor_auth_user_id: input.userId,
          p_auth_session_id: input.sessionId,
          p_bucket_id: input.artifact.bucketId,
          p_storage_path: input.artifact.storagePath,
          p_tamanho_bytes: input.artifact.byteSize,
          p_sha256: input.artifact.sha256,
          p_document_snapshot_sha256: input.documentSnapshotSha256,
          p_pdf_asset_manifest: input.pdfAssetManifestSnapshot,
          p_semantic_manifest: input.semanticManifest,
          p_frozen_signature_target: input.frozenSignatureTarget,
          p_geometry_snapshot: input.geometrySnapshot,
          p_request_id: input.requestId,
        }),
      );
      return { status: requiredString(result, "status", 64) };
    },
    startFinalization: async (input) =>
      normalizeFinalizationPreflight(
        await callRpc(admin, START_FINALIZATION_RPC, actorArgs(input)),
      ),
    reserveUploadIntent: async (input) => {
      await callRpc(admin, RESERVE_UPLOAD_RPC, {
        p_envelope_id: input.envelopeId,
        p_actor_auth_user_id: input.userId,
        p_auth_session_id: input.sessionId,
        p_request_id: input.requestId,
        p_classe: input.artifactClass,
        p_bucket_id: input.artifact.bucketId,
        p_storage_path: input.artifact.storagePath,
        p_tamanho_bytes: input.artifact.byteSize,
        p_sha256: input.artifact.sha256,
      });
    },
    reconcileExpiredUploads: () => reconcileExpiredUploadIntents(admin),
    scheduleBackgroundTask,
    artifactCheckpoint: () => Promise.resolve(),
    registerFinal: async (input) => {
      const result = unwrapRecord(
        await callRpc(admin, REGISTER_FINAL_RPC, {
          p_envelope_id: input.envelopeId,
          p_actor_auth_user_id: input.userId,
          p_auth_session_id: input.sessionId,
          p_final_bucket_id: input.finalArtifact.bucketId,
          p_final_storage_path: input.finalArtifact.storagePath,
          p_final_tamanho_bytes: input.finalArtifact.byteSize,
          p_final_sha256: input.finalArtifact.sha256,
          p_receipt_bucket_id: input.receiptArtifact.bucketId,
          p_receipt_storage_path: input.receiptArtifact.storagePath,
          p_receipt_tamanho_bytes: input.receiptArtifact.byteSize,
          p_receipt_sha256: input.receiptArtifact.sha256,
          p_request_id: input.requestId,
        }),
      );
      return { status: requiredString(result, "status", 64) };
    },
    loadCanonicalAsset: (sourceUrl) => {
      const reference = parseOwnPublicStorageUrl(sourceUrl, config.supabaseUrl);
      return downloadObject(admin, reference, MAX_CANONICAL_ASSET_BYTES);
    },
    downloadPrivateObject: async (reference) => {
      if (
        reference.bucketId !== SIGNATURE_ARTIFACT_BUCKET ||
        !/^envelopes\/[0-9a-f-]{36}\/(?:documento-original|documento-final|comprovante-evidencia)\.pdf$/u
          .test(reference.storagePath)
      ) throw unavailable();
      return (await downloadObject(admin, reference, 50 * 1024 * 1024)).bytes;
    },
    downloadModelAsset: async (reference) => {
      if (
        reference.bucketId !== SIGNATURE_MODEL_ASSET_BUCKET ||
        reference.storagePath !== `global/${reference.assetId}.png`
      ) throw unavailable();
      return (await downloadObject(
        admin,
        reference,
        MAX_INLINE_WATERMARK_BYTES,
      )).bytes;
    },
    uploadImmutable: async ({ reference, bytes, contentType }) => {
      if (
        reference.bucketId !== SIGNATURE_ARTIFACT_BUCKET ||
        bytes.byteLength !== reference.byteSize ||
        await sha256Hex(bytes) !== reference.sha256
      ) throw unavailable();
      const bucket = admin.storage.from(reference.bucketId);
      const uploaded = await bucket.upload(reference.storagePath, bytes, {
        contentType,
        cacheControl: "0",
        upsert: false,
      });
      if (!uploaded.error) return "CREATED";
      // Convergência idempotente: conflito de criação só é aceito quando o
      // objeto privado existente possui exatamente os mesmos bytes congelados.
      const existing = await downloadObject(admin, reference, 50 * 1024 * 1024);
      if (
        existing.bytes.byteLength !== reference.byteSize ||
        await sha256Hex(existing.bytes) !== reference.sha256
      ) throw unavailable(uploaded.error);
      return "EXISTING_IDENTICAL";
    },
  };
};
