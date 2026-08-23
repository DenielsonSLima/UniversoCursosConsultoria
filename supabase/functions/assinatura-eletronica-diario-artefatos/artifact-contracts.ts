import type { FrozenPdfSignatureTarget } from "../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts";
import type { DiaryPdfSemanticManifest } from "../../../modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts";
import type { ElectronicSignatureReceiptPayloadWithoutHashes } from "../../../modules/gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts";
import type {
  DiarioPdfAssetManifest,
  LoadedAssetBytes,
} from "./artifact-assets.ts";
import type { FrozenSnapshotIntegrity } from "./snapshot-integrity.ts";

export const MAX_REQUEST_BYTES = 1024;
export const SIGNATURE_ARTIFACT_BUCKET = "documentos-assinatura-eletronica";
export const SIGNATURE_MODEL_ASSET_BUCKET =
  "assinatura-eletronica-modelo-assets";

export type DiarioArtifactAction = "PREPARE_ORIGINAL" | "FINALIZE";

export type DiarioArtifactRequest = {
  action: DiarioArtifactAction;
  envelopeId: string;
  requestId: string;
};

export type AuthenticatedIdentity = {
  userId: string;
  sessionId: string;
};

export type StorageArtifactReference = {
  bucketId: string;
  storagePath: string;
  byteSize?: number;
  sha256?: string;
};

export type DiarioArtifactClass =
  | "DOCUMENTO_ORIGINAL"
  | "DOCUMENTO_FINAL"
  | "COMPROVANTE_EVIDENCIA";

export type DiarioArtifactCheckpoint =
  | "AFTER_FIRST_FINAL_UPLOAD"
  | "AFTER_SECOND_FINAL_UPLOAD";

export type OriginalPreparePreflight = {
  envelopeId: string;
  status: string;
  documentSnapshotIntegrity: FrozenSnapshotIntegrity;
  documentSnapshotSha256: string;
  geometrySnapshot: unknown;
  participants: unknown;
  policySnapshot: unknown;
  certificateSnapshot: unknown;
  originalDestination: StorageArtifactReference;
  verification: { code: string; basePath: "/validador" };
};

export type SignatureParticipant = {
  participantId: string;
  role: string;
  order: number;
  status: "ASSINADO";
  signerName: string;
  signerCpfMasked: string;
  signedAt: string;
  signatureEventId: string;
  signatureHash: string;
  verificationCode: string;
  verificationPath: string;
};

export type StoredModelAssetReference = StorageArtifactReference & {
  assetId: string;
  mimeType: "image/png";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

export type ReceiptCustomWatermarkReference = StoredModelAssetReference & {
  page: 1 | 2;
};

export type ReceiptWatermarkSnapshot = null | {
  schemaVersion: 1;
  source: "POLO_PORTRAIT_WATERMARK_V1";
  poloId: string;
  url: string;
  opacity: number;
  scale: number;
  rotate: boolean;
};

export type ReceiptInstitutionalWatermarkReference = null | {
  sourceKind: "INLINE_DATA_URI";
  sourceRef: "documentSnapshot.assetSources.watermarkUrl";
} | {
  sourceKind: "INLINE_DATA_URI";
  sourceRef: "receiptWatermarkSnapshot.url";
} | {
  sourceKind: "HTTPS_URL";
  sourceUrl: string;
};

export type FinalizationPreflight = {
  envelopeId: string;
  status: string;
  documentSnapshotIntegrity: FrozenSnapshotIntegrity;
  documentSnapshotSha256: string;
  geometrySnapshot: unknown;
  semanticManifestSnapshot: DiaryPdfSemanticManifest;
  frozenSignatureTargetSnapshot: FrozenPdfSignatureTarget;
  pdfAssetManifestSnapshot: DiarioPdfAssetManifest;
  originalArtifact: StorageArtifactReference & {
    byteSize: number;
    sha256: string;
  };
  participants: readonly SignatureParticipant[];
  signatureEvents: readonly {
    type: "ASSINATURA_CONCLUIDA";
    occurredAt: string;
    participantId: string;
    method: "SENHA_REAUTENTICADA";
    eventId: string;
    signatureHash: string;
  }[];
  receiptPayload: ElectronicSignatureReceiptPayloadWithoutHashes;
  receiptWatermarkSnapshot: ReceiptWatermarkSnapshot;
  receiptAssetReferences: {
    logo: { sourceUrl: string };
    institutionalWatermark: ReceiptInstitutionalWatermarkReference;
    customWatermarks: readonly ReceiptCustomWatermarkReference[];
  };
  stampAsset: StoredModelAssetReference;
  verification: { code: string; basePath: "/validador" };
};

export type OriginalRegistrationInput = {
  envelopeId: string;
  userId: string;
  sessionId: string;
  requestId: string;
  artifact: Required<StorageArtifactReference>;
  documentSnapshotSha256: string;
  pdfAssetManifestSnapshot: DiarioPdfAssetManifest;
  semanticManifest: DiaryPdfSemanticManifest;
  frozenSignatureTarget: FrozenPdfSignatureTarget;
  geometrySnapshot: unknown;
};

export type FinalRegistrationInput = {
  envelopeId: string;
  userId: string;
  sessionId: string;
  requestId: string;
  finalArtifact: Required<StorageArtifactReference>;
  receiptArtifact: Required<StorageArtifactReference>;
};

export type DiarioArtifactDependencies = {
  validationOrigin: string;
  authenticate: (bearer: string) => Promise<AuthenticatedIdentity>;
  prepareOriginal: (
    input: DiarioArtifactRequest & AuthenticatedIdentity,
  ) => Promise<OriginalPreparePreflight>;
  registerOriginal: (
    input: OriginalRegistrationInput,
  ) => Promise<{ status: string }>;
  startFinalization: (
    input: DiarioArtifactRequest & AuthenticatedIdentity,
  ) => Promise<FinalizationPreflight>;
  registerFinal: (input: FinalRegistrationInput) => Promise<{ status: string }>;
  reserveUploadIntent: (input: {
    envelopeId: string;
    userId: string;
    sessionId: string;
    requestId: string;
    artifactClass: DiarioArtifactClass;
    artifact: Required<StorageArtifactReference>;
  }) => Promise<void>;
  reconcileExpiredUploads: () => Promise<void>;
  scheduleBackgroundTask: (task: () => Promise<void>) => void;
  artifactCheckpoint: (
    checkpoint: DiarioArtifactCheckpoint,
  ) => Promise<void>;
  loadCanonicalAsset: (sourceUrl: string) => Promise<LoadedAssetBytes>;
  downloadPrivateObject: (
    reference: StorageArtifactReference,
  ) => Promise<Uint8Array>;
  downloadModelAsset: (
    reference: StoredModelAssetReference,
  ) => Promise<Uint8Array>;
  uploadImmutable: (input: {
    reference: Required<StorageArtifactReference>;
    bytes: Uint8Array;
    contentType: "application/pdf";
  }) => Promise<"CREATED" | "EXISTING_IDENTICAL">;
};

export type PublicErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "AUTHENTICATION_REQUIRED"
  | "SESSION_INVALID"
  | "INVALID_REQUEST"
  | "REQUEST_BODY_TOO_LARGE"
  | "ACCESS_DENIED"
  | "IDEMPOTENCY_CONFLICT"
  | "ARTIFACT_STATE_CONFLICT"
  | "SERVICE_UNAVAILABLE";

export class PublicHttpError extends Error {
  readonly status: number;
  readonly code: PublicErrorCode;

  constructor(
    status: number,
    code: PublicErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PublicHttpError";
    this.status = status;
    this.code = code;
  }
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
