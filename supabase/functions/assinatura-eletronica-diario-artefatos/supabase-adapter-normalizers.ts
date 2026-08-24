import {
  createDiaryPdfSemanticManifest,
  DIARY_PDF_SEMANTIC_MANIFEST_SOURCE,
  type DiaryPdfSemanticManifest,
  type DiaryPdfSignatureSlot,
} from "../../../modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts";
import type {
  FrozenPdfSignatureTarget,
  InspectedPdfPage,
} from "../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts";
import { ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS } from "../../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import type {
  AuthenticatedIdentity,
  FinalizationPreflight,
  OriginalPreparePreflight,
  StorageArtifactReference,
  StoredModelAssetReference,
} from "./artifact-contracts.ts";
import type { FrozenSnapshotIntegrity } from "./snapshot-integrity.ts";
import { normalizePdfAssetManifest } from "./supabase-adapter-manifest.ts";
import {
  normalizeReceiptWatermarkReference,
  normalizeReceiptWatermarkSnapshot,
} from "./supabase-adapter-receipt-watermark.ts";
import {
  type AdminClient,
  asRecord,
  MASKED_CPF_PATTERN,
  requiredArray,
  requiredFiniteNumber,
  requiredInteger,
  requiredRecord,
  requiredSha256,
  requiredString,
  requiredUuid,
  sessionInvalid,
  SIGNATURE_CODE_PATTERN,
  unavailable,
  unwrapRecord,
  UUID_PATTERN,
} from "./supabase-adapter-support.ts";

const normalizeSemanticManifest = (
  value: unknown,
): DiaryPdfSemanticManifest => {
  const source = asRecord(value);
  if (
    (source?.schemaVersion !== 1 && source?.schemaVersion !== 2) ||
    source.source !== DIARY_PDF_SEMANTIC_MANIFEST_SOURCE
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
    if (source.schemaVersion === 2) {
      if (source.semanticTarget !== "DIARIO_BACK_COVER") throw unavailable();
      const slots = requiredArray(source, "signatureSlots").map((candidate) => {
        const slot = asRecord(candidate);
        return {
          role: requiredString(slot, "role", 20),
          fieldId: requiredString(slot, "fieldId", 80),
          pageTarget: requiredString(slot, "pageTarget", 40),
          coordinateSpace: requiredString(slot, "coordinateSpace", 40),
          xBp: requiredInteger(slot, "xBp", 0, 100_000),
          yBp: requiredInteger(slot, "yBp", 0, 100_000),
          widthBp: requiredInteger(slot, "widthBp", 1, 100_000),
          heightBp: requiredInteger(slot, "heightBp", 1, 100_000),
        } as DiaryPdfSignatureSlot;
      });
      return createDiaryPdfSemanticManifest({
        schemaVersion: 2,
        pageCount,
        targetPageIndex,
        backCoverPageIndex: requiredInteger(
          source,
          "backCoverPageIndex",
          0,
          pageCount - 1,
        ),
        instructionsPageIndex,
        signatureSlots: slots as [DiaryPdfSignatureSlot, DiaryPdfSignatureSlot],
      });
    }
    if (source.semanticTarget !== "DIARIO_LAST_CONTENT_PAGE") {
      throw unavailable();
    }
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
  const semanticTarget = source?.semanticTarget;
  if (
    semanticTarget !== "DIARIO_LAST_CONTENT_PAGE" &&
    semanticTarget !== "DIARIO_BACK_COVER"
  ) {
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
    semanticTarget !== manifest.semanticTarget ||
    manifest.pageCount !== pageCount ||
    manifest.targetPageIndex !== targetPageIndex ||
    targetPage.pageIndex !== targetPageIndex
  ) throw unavailable();
  return {
    originalSha256: requiredSha256(source, "originalSha256"),
    pageCount,
    semanticTarget,
    manifest,
    targetPageIndex,
    targetPage,
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
  const receiptWatermarkSnapshot = normalizeReceiptWatermarkSnapshot(
    source?.receiptWatermarkSnapshot,
  );
  const references = requiredRecord(source, "receiptAssetReferences");
  const logo = requiredRecord(references, "logo");
  const customWatermarks = requiredArray(references, "customWatermarks").map(
    (item) => {
      const row = asRecord(item);
      const page = requiredInteger(row, "page", 1, 2) as 1 | 2;
      return { ...normalizeModelAsset(row), page } as const;
    },
  );
  const semanticManifestSnapshot = normalizeSemanticManifest(
    source?.semanticManifestSnapshot,
  );
  const frozenSignatureTargetSnapshot = normalizeFrozenTarget(
    source?.frozenSignatureTargetSnapshot,
  );
  if (
    JSON.stringify(semanticManifestSnapshot) !==
      JSON.stringify(frozenSignatureTargetSnapshot.manifest)
  ) throw unavailable();
  return {
    envelopeId: requiredUuid(source, "envelopeId"),
    status: requiredString(source, "status", 64),
    documentSnapshotIntegrity,
    documentSnapshotSha256,
    geometrySnapshot: requiredRecord(source, "geometrySnapshot"),
    semanticManifestSnapshot,
    frozenSignatureTargetSnapshot,
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
    receiptWatermarkSnapshot,
    receiptAssetReferences: {
      logo: { sourceUrl: requiredString(logo, "sourceUrl", 2048) },
      institutionalWatermark: normalizeReceiptWatermarkReference(
        references.institutionalWatermark,
        receiptWatermarkSnapshot,
      ),
      customWatermarks,
    },
    stampAsset: normalizeModelAsset(source?.stampAsset),
    verification: normalizeVerification(source?.verification),
  };
};
