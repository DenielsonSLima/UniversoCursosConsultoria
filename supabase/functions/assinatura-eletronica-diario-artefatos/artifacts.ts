/* global TextDecoder */

import { buildCorsHeaders } from "../_shared/http.ts";
import type { DiarioPdfAcademicSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts";
import {
  composeDiarioPdfWithManifest,
  type DiarioPdfResolvedAssets,
} from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts";
import {
  type AppliedSignatureStamp,
  freezeDiaryPdfSignatureTarget,
  type FrozenPdfSignatureTarget,
} from "../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts";
import {
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS,
  ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS,
  ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS,
  type ElectronicSignatureStampAutoLayoutV1,
  type ElectronicSignatureStampContentLayout,
  type ElectronicSignatureStampTemplateV1,
} from "../../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  deriveAutomaticSignatureStampPlacements,
  normalizeElectronicSignatureStampAutoLayout,
  normalizeElectronicSignatureStampTemplate,
} from "../../../modules/shared/assinatura-eletronica/signature-stamp-template.ts";
import {
  SIGNATURE_STAMP_COORDINATE_SCALE,
  SIGNATURE_STAMP_MAX_HEIGHT_BP,
  SIGNATURE_STAMP_MAX_WIDTH_BP,
  SIGNATURE_STAMP_MIN_HEIGHT_BP,
  SIGNATURE_STAMP_MIN_WIDTH_BP,
} from "../../../modules/shared/assinatura-eletronica/signature-stamp-placement.ts";
import type {
  DiaryPdfSemanticManifest,
} from "../../../modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts";
import {
  createSignedPdfArtifacts,
  type ElectronicSignatureReceiptPayloadWithoutHashes,
} from "../../../modules/gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts";
import type { CanonicalPdfImage } from "../../../modules/gestor/secretaria/shared/canonical-document-vector-pdf.core.ts";
import { createLocalQrCodeDataUrl } from "../../../modules/shared/qrcode/local-qrcode.ts";
import {
  assertSha256,
  buildCanonicalValidationUrl,
  decodeCanonicalInlineDataImage,
  type DiarioPdfAssetManifest,
  imageToDataUrl,
  type InspectedImageAsset,
  inspectImageAsset,
  type LoadedAssetBytes,
  MAX_INLINE_WATERMARK_BYTES,
  sha256Hex,
  toPdfImage,
} from "./artifact-assets.ts";
import {
  type FrozenSnapshotIntegrity,
  verifyFrozenDocumentSnapshot,
} from "./snapshot-integrity.ts";

export type { FrozenSnapshotIntegrity } from "./snapshot-integrity.ts";
export { verifyFrozenDocumentSnapshot } from "./snapshot-integrity.ts";

export const MAX_REQUEST_BYTES = 1024;
export const SIGNATURE_ARTIFACT_BUCKET = "documentos-assinatura-eletronica";
export const SIGNATURE_MODEL_ASSET_BUCKET =
  "assinatura-eletronica-modelo-assets";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MASKED_CPF_PATTERN = /^\*\*\*\.\*\*\*\.\*\*\*-[0-9]{2}$/u;
const SIGNATURE_CODE_PATTERN =
  /^SIG-[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/u;
const ISO_WITH_SECONDS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;

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

export type ReceiptInstitutionalWatermarkReference = null | {
  sourceKind: "INLINE_DATA_URI";
  sourceRef: "documentSnapshot.assetSources.watermarkUrl";
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const exactKeys = (
  source: Record<string, unknown>,
  allowed: readonly string[],
) =>
  Object.keys(source).length === allowed.length &&
  Object.keys(source).every((key) => allowed.includes(key));

const invalidRequest = () =>
  new PublicHttpError(
    400,
    "INVALID_REQUEST",
    "Os dados enviados para preparar o documento são inválidos.",
  );

const requiredUuid = (source: Record<string, unknown>, key: string) => {
  const value = typeof source[key] === "string"
    ? source[key].trim().toLowerCase()
    : "";
  if (!UUID_PATTERN.test(value)) throw invalidRequest();
  return value;
};

export const parseDiarioArtifactRequest = (
  value: unknown,
): DiarioArtifactRequest => {
  const source = asRecord(value);
  if (!source || !exactKeys(source, ["action", "envelopeId", "requestId"])) {
    throw invalidRequest();
  }
  if (source.action !== "PREPARE_ORIGINAL" && source.action !== "FINALIZE") {
    throw invalidRequest();
  }
  return {
    action: source.action,
    envelopeId: requiredUuid(source, "envelopeId"),
    requestId: requiredUuid(source, "requestId"),
  };
};

const qrImage = async (validationUrl: string) => {
  const qrDataUrl = await createLocalQrCodeDataUrl(validationUrl, {
    size: 240,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const inspected = await inspectImageAsset(
    decodeCanonicalInlineDataImage(qrDataUrl),
    { maxBytes: MAX_INLINE_WATERMARK_BYTES, expectedMimeType: "image/png" },
  );
  if (inspected.width !== 240 || inspected.height !== 240) {
    throw new Error("O QR Code local não possui 240 × 240 pixels.");
  }
  return inspected;
};

const assetManifestEntry = (image: InspectedImageAsset) => ({
  mimeType: image.mimeType,
  byteSize: image.byteSize,
  width: image.width,
  height: image.height,
  sha256: image.sha256,
});

const resolveOriginalAssets = async (
  dependencies: DiarioArtifactDependencies,
  snapshot: DiarioPdfAcademicSnapshot,
  verification: OriginalPreparePreflight["verification"],
  documentSnapshotSha256: string,
) => {
  if (verification.code !== snapshot.validationCode) {
    throw new Error("O código de validação diverge do snapshot congelado.");
  }
  const validationUrl = buildCanonicalValidationUrl(
    dependencies.validationOrigin,
    verification.basePath,
    verification.code,
  );
  const headerSource = snapshot.assetSources.headerLogoUrl;
  const watermarkSource = snapshot.assetSources.watermarkUrl;
  const [headerLogo, watermark, qrCode] = await Promise.all([
    dependencies.loadCanonicalAsset(headerSource).then((asset) =>
      inspectImageAsset(asset)
    ),
    watermarkSource === null
      ? Promise.resolve(null)
      : watermarkSource.startsWith("data:")
      ? inspectImageAsset(decodeCanonicalInlineDataImage(watermarkSource), {
        maxBytes: MAX_INLINE_WATERMARK_BYTES,
      })
      : dependencies.loadCanonicalAsset(watermarkSource).then((asset) =>
        inspectImageAsset(asset)
      ),
    qrImage(validationUrl),
  ]);
  const manifest: DiarioPdfAssetManifest = {
    schemaVersion: 1,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V1",
    documentSnapshotSha256,
    validationUrl,
    assets: {
      headerLogo: {
        sourceKind: "HTTPS_URL",
        sourceUrl: headerSource,
        ...assetManifestEntry(headerLogo),
      },
      watermark: watermark === null || watermarkSource === null
        ? null
        : watermarkSource.startsWith("data:")
        ? {
          sourceKind: "INLINE_DATA_URI",
          sourceRef: "documentSnapshot.assetSources.watermarkUrl",
          ...assetManifestEntry(watermark),
        }
        : {
          sourceKind: "HTTPS_URL",
          sourceUrl: watermarkSource,
          ...assetManifestEntry(watermark),
        },
      validationQr: {
        sourceKind: "GENERATED_QR",
        payload: validationUrl,
        mimeType: "image/png",
        byteSize: qrCode.byteSize,
        width: 240,
        height: 240,
        sha256: qrCode.sha256,
      },
    },
  };
  const resolved: DiarioPdfResolvedAssets = {
    logo: toPdfImage(headerLogo),
    watermark: watermark ? toPdfImage(watermark) : null,
    qrCode: {
      image: toPdfImage(qrCode),
      payload: validationUrl,
      generatedBy: "TRUSTED_ADAPTER",
    },
    validationEndpoint: {
      origin: new URL(validationUrl).origin,
      pathname: "/validador",
      generatedBy: "TRUSTED_ADAPTER",
    },
    validationUrl,
    institution: snapshot.institutionalIdentity.institution,
  };
  return { headerLogo, manifest, resolved, validationUrl };
};

const expectedArtifactReference = (
  envelopeId: string,
  fileName:
    | "documento-original.pdf"
    | "documento-final.pdf"
    | "comprovante-evidencia.pdf",
): StorageArtifactReference => ({
  bucketId: SIGNATURE_ARTIFACT_BUCKET,
  storagePath: `envelopes/${envelopeId}/${fileName}`,
});

const assertDestination = (
  actual: StorageArtifactReference,
  expected: StorageArtifactReference,
) => {
  if (
    actual?.bucketId !== expected.bucketId ||
    actual?.storagePath !== expected.storagePath
  ) throw new Error("O destino privado do artefato diverge do contrato.");
};

const requiredArtifact = (
  reference: StorageArtifactReference,
  bytes: Uint8Array,
  sha256: string,
): Required<StorageArtifactReference> => ({
  bucketId: reference.bucketId,
  storagePath: reference.storagePath,
  byteSize: bytes.byteLength,
  sha256,
});

export const uploadFinalArtifactPair = async (
  dependencies: Pick<
    DiarioArtifactDependencies,
    "uploadImmutable" | "artifactCheckpoint"
  >,
  input: {
    finalArtifact: Required<StorageArtifactReference>;
    finalBytes: Uint8Array;
    receiptArtifact: Required<StorageArtifactReference>;
    receiptBytes: Uint8Array;
  },
) => {
  // A ordem é deliberadamente serial. Ela torna a janela de falha observável e
  // reproduzível sem depender do agendamento de Promise.all; as duas intenções
  // já precisam ter sido persistidas antes de chegar aqui.
  await dependencies.uploadImmutable({
    reference: input.finalArtifact,
    bytes: input.finalBytes,
    contentType: "application/pdf",
  });
  await dependencies.artifactCheckpoint("AFTER_FIRST_FINAL_UPLOAD");
  await dependencies.uploadImmutable({
    reference: input.receiptArtifact,
    bytes: input.receiptBytes,
    contentType: "application/pdf",
  });
  await dependencies.artifactCheckpoint("AFTER_SECOND_FINAL_UPLOAD");
};

export const reserveAndUploadFinalArtifactPair = async (
  dependencies: Pick<
    DiarioArtifactDependencies,
    "reserveUploadIntent" | "uploadImmutable" | "artifactCheckpoint"
  >,
  input: {
    envelopeId: string;
    userId: string;
    sessionId: string;
    requestId: string;
    finalArtifact: Required<StorageArtifactReference>;
    finalBytes: Uint8Array;
    receiptArtifact: Required<StorageArtifactReference>;
    receiptBytes: Uint8Array;
  },
) => {
  // Ambas as intenções precisam existir antes do primeiro upload. O helper é
  // compartilhado pelo fluxo FINALIZE e pelos failpoints para manter essa ordem
  // como contrato executável, não apenas como detalhe do handler.
  await dependencies.reserveUploadIntent({
    envelopeId: input.envelopeId,
    userId: input.userId,
    sessionId: input.sessionId,
    requestId: input.requestId,
    artifactClass: "DOCUMENTO_FINAL",
    artifact: input.finalArtifact,
  });
  await dependencies.reserveUploadIntent({
    envelopeId: input.envelopeId,
    userId: input.userId,
    sessionId: input.sessionId,
    requestId: input.requestId,
    artifactClass: "COMPROVANTE_EVIDENCIA",
    artifact: input.receiptArtifact,
  });
  await uploadFinalArtifactPair(dependencies, input);
};

const prepareOriginal = async (
  dependencies: DiarioArtifactDependencies,
  body: DiarioArtifactRequest,
  identity: AuthenticatedIdentity,
) => {
  const preflight = await dependencies.prepareOriginal({
    ...body,
    ...identity,
  });
  if (preflight.envelopeId !== body.envelopeId) {
    throw new Error("O preflight do documento retornou envelope divergente.");
  }
  const snapshot = await verifyFrozenDocumentSnapshot(
    preflight.documentSnapshotIntegrity,
    preflight.documentSnapshotSha256,
  );
  const destination = expectedArtifactReference(
    body.envelopeId,
    "documento-original.pdf",
  );
  assertDestination(preflight.originalDestination, destination);
  const { manifest, resolved } = await resolveOriginalAssets(
    dependencies,
    snapshot,
    preflight.verification,
    preflight.documentSnapshotSha256,
  );
  const composed = await composeDiarioPdfWithManifest(snapshot, resolved);
  const frozenTarget = await freezeDiaryPdfSignatureTarget(composed.bytes, {
    manifest: composed.manifest,
  });
  const artifact = requiredArtifact(
    destination,
    composed.bytes,
    composed.sha256,
  );
  await dependencies.reserveUploadIntent({
    envelopeId: body.envelopeId,
    userId: identity.userId,
    sessionId: identity.sessionId,
    requestId: body.requestId,
    artifactClass: "DOCUMENTO_ORIGINAL",
    artifact,
  });
  await dependencies.uploadImmutable({
    reference: artifact,
    bytes: composed.bytes,
    contentType: "application/pdf",
  });
  const registered = await dependencies.registerOriginal({
    envelopeId: body.envelopeId,
    userId: identity.userId,
    sessionId: identity.sessionId,
    requestId: body.requestId,
    artifact,
    documentSnapshotSha256: preflight.documentSnapshotSha256,
    pdfAssetManifestSnapshot: manifest,
    semanticManifest: composed.manifest,
    frozenSignatureTarget: frozenTarget,
    geometrySnapshot: preflight.geometrySnapshot,
  });
  return {
    ok: true,
    envelopeId: body.envelopeId,
    status: registered.status,
  } as const;
};

const assertModelAssetReference = (reference: StoredModelAssetReference) => {
  if (
    reference.mimeType !== "image/png" ||
    !UUID_PATTERN.test(reference.assetId) ||
    reference.bucketId !== SIGNATURE_MODEL_ASSET_BUCKET ||
    reference.storagePath !== `global/${reference.assetId}.png` ||
    reference.byteSize < 1 || reference.byteSize > MAX_INLINE_WATERMARK_BYTES ||
    !Number.isInteger(reference.width) || !Number.isInteger(reference.height)
  ) throw new Error("O recurso visual privado não corresponde ao contrato.");
  assertSha256(reference.sha256, "O hash do recurso visual privado");
};

const loadFrozenModelAsset = async (
  dependencies: DiarioArtifactDependencies,
  reference: StoredModelAssetReference,
) => {
  assertModelAssetReference(reference);
  const bytes = await dependencies.downloadModelAsset(reference);
  return inspectImageAsset(
    { bytes, mimeType: reference.mimeType },
    {
      maxBytes: MAX_INLINE_WATERMARK_BYTES,
      expectedMimeType: reference.mimeType,
      expectedByteSize: reference.byteSize,
      expectedWidth: reference.width,
      expectedHeight: reference.height,
      expectedSha256: reference.sha256,
    },
  );
};

const asCanonicalImage = (asset: InspectedImageAsset): CanonicalPdfImage => ({
  dataUrl: imageToDataUrl(asset),
  format: asset.format,
});

const assertFinalParticipants = (preflight: FinalizationPreflight) => {
  if (
    preflight.participants.length < 1 ||
    preflight.participants.length > ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS ||
    preflight.signatureEvents.length !== preflight.participants.length ||
    preflight.participants.some((participant) => (
      participant.status !== "ASSINADO" || !participant.signerName.trim() ||
      !participant.role.trim() || !Number.isInteger(participant.order) ||
      !MASKED_CPF_PATTERN.test(participant.signerCpfMasked) ||
      !UUID_PATTERN.test(participant.participantId) ||
      !UUID_PATTERN.test(participant.signatureEventId) ||
      !SHA256_PATTERN.test(participant.signatureHash) ||
      !SIGNATURE_CODE_PATTERN.test(participant.verificationCode) ||
      participant.verificationCode !==
        `SIG-${participant.signatureEventId.toUpperCase()}` ||
      participant.verificationPath !==
        `/validador?code=${participant.verificationCode}` ||
      !ISO_WITH_SECONDS_PATTERN.test(participant.signedAt) ||
      !Number.isFinite(Date.parse(participant.signedAt))
    )) ||
    preflight.signatureEvents.some((event) => (
      event.type !== "ASSINATURA_CONCLUIDA" ||
      event.method !== "SENHA_REAUTENTICADA" ||
      !UUID_PATTERN.test(event.eventId) ||
      !SHA256_PATTERN.test(event.signatureHash) ||
      !ISO_WITH_SECONDS_PATTERN.test(event.occurredAt) ||
      !Number.isFinite(Date.parse(event.occurredAt))
    ))
  ) {
    throw new Error(
      "Os signatários do Diário não correspondem às provas finais autorizadas.",
    );
  }
  if (
    preflight.participants.some((participant, index) =>
      participant.order !== index + 1
    )
  ) {
    throw new Error("A ordem autoritativa dos signatários não é sequencial.");
  }
  if (
    new Set(preflight.participants.map((item) => item.signatureEventId))
        .size !== preflight.participants.length ||
    new Set(preflight.participants.map((item) => item.signatureHash)).size !==
      preflight.participants.length ||
    new Set(preflight.participants.map((item) => item.verificationCode))
        .size !== preflight.participants.length ||
    new Set(preflight.participants.map((item) => item.participantId)).size !==
      preflight.participants.length
  ) {
    throw new Error(
      "Cada assinatura precisa de uma prova individual distinta.",
    );
  }
  for (const participant of preflight.participants) {
    const matches = preflight.signatureEvents.filter((event) =>
      event.participantId === participant.participantId &&
      Date.parse(event.occurredAt) === Date.parse(participant.signedAt) &&
      event.eventId === participant.signatureEventId &&
      event.signatureHash === participant.signatureHash
    );
    if (matches.length !== 1) {
      throw new Error(
        "A evidência final não corresponde aos signatários congelados.",
      );
    }
  }
};

const prepareFrozenContentLayout = (
  value: unknown,
): ElectronicSignatureStampContentLayout => {
  const source = asRecord(value);
  const keys = [
    "sealScalePercent",
    "lineSpacingPercent",
    "qrScalePercent",
  ] as const;
  if (!source || !exactKeys(source, keys)) {
    throw new Error("A distribuição interna congelada do carimbo é inválida.");
  }
  const result = {} as Record<
    typeof keys[number],
    number
  >;
  for (const key of keys) {
    const candidate = source[key];
    const limit = ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_LIMITS[key];
    if (
      !Number.isInteger(candidate) || Number(candidate) < limit.min ||
      Number(candidate) > limit.max || Number(candidate) % limit.step !== 0
    ) {
      throw new Error(
        `O ajuste congelado ${key} do carimbo é inválido.`,
      );
    }
    result[key] = Number(candidate);
  }
  return result as ElectronicSignatureStampContentLayout;
};

export const normalizeFrozenSignatureGeometry = (
  value: unknown,
): {
  schemaVersion: 1 | 2 | 3;
  layout: "HORIZONTAL" | "COMPACT" | null;
  contentLayout: ElectronicSignatureStampContentLayout | null;
  template: ElectronicSignatureStampTemplateV1 | null;
  autoLayout: ElectronicSignatureStampAutoLayoutV1 | null;
  slots: readonly AppliedSignatureStamp["placement"][] | null;
} => {
  const geometry = asRecord(value);
  const schemaVersion = geometry?.schemaVersion;
  const expectedKeys = schemaVersion === 1
    ? [
      "assetId",
      "assetSnapshot",
      "coordinateSpace",
      "layout",
      "schemaVersion",
      "slots",
    ]
    : schemaVersion === 2
    ? [
      "assetId",
      "assetSnapshot",
      "contentLayout",
      "coordinateSpace",
      "layout",
      "schemaVersion",
      "slots",
    ]
    : [
      "assetId",
      "assetSnapshot",
      "autoLayout",
      "coordinateSpace",
      "schemaVersion",
      "template",
    ];
  if (schemaVersion === 3) {
    if (
      !geometry || !exactKeys(geometry, expectedKeys) ||
      geometry.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
      typeof geometry.assetId !== "string" ||
      !UUID_PATTERN.test(geometry.assetId) ||
      asRecord(geometry.assetSnapshot) === null
    ) {
      throw new Error("A geometria global congelada do carimbo é inválida.");
    }
    return {
      schemaVersion: 3,
      layout: null,
      contentLayout: null,
      template: normalizeElectronicSignatureStampTemplate(geometry.template),
      autoLayout: normalizeElectronicSignatureStampAutoLayout(
        geometry.autoLayout,
      ),
      slots: null,
    };
  }
  const instances = geometry?.slots;
  if (
    !geometry ||
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    !exactKeys(geometry, expectedKeys) ||
    geometry.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
    (geometry.layout !== "HORIZONTAL" && geometry.layout !== "COMPACT") ||
    !Array.isArray(instances) || instances.length !== 2 ||
    (geometry.assetId !== null &&
      (typeof geometry.assetId !== "string" ||
        !UUID_PATTERN.test(geometry.assetId))) ||
    (geometry.assetSnapshot !== null &&
      asRecord(geometry.assetSnapshot) === null)
  ) throw new Error("A geometria congelada dos carimbos é inválida.");
  const roles = ["PROFESSOR", "COORDENADOR"] as const;
  const slots = instances.map((candidate, index) => {
    const slot = asRecord(candidate);
    const expectedInstanceKeys = [
      "coordinateSpace",
      "heightBp",
      "pageTarget",
      "role",
      "widthBp",
      "xBp",
      "yBp",
    ];
    if (
      !slot ||
      !exactKeys(slot, expectedInstanceKeys) ||
      slot.role !== roles[index] ||
      slot.pageTarget !== "LAST_PAGE" ||
      slot.coordinateSpace !== "PAGE_TOP_LEFT_BP_V1" ||
      !Number.isInteger(slot.xBp) || !Number.isInteger(slot.yBp) ||
      !Number.isInteger(slot.widthBp) || !Number.isInteger(slot.heightBp)
    ) throw new Error("A ordem dos carimbos congelados é inválida.");
    const placement = {
      coordinateSpace: "PAGE_TOP_LEFT_BP_V1" as const,
      xBp: Number(slot.xBp),
      yBp: Number(slot.yBp),
      widthBp: Number(slot.widthBp),
      heightBp: Number(slot.heightBp),
    };
    if (
      placement.widthBp < SIGNATURE_STAMP_MIN_WIDTH_BP ||
      placement.widthBp > SIGNATURE_STAMP_MAX_WIDTH_BP ||
      placement.heightBp < SIGNATURE_STAMP_MIN_HEIGHT_BP ||
      placement.heightBp > SIGNATURE_STAMP_MAX_HEIGHT_BP ||
      placement.xBp < 0 || placement.yBp < 0 ||
      placement.xBp + placement.widthBp > SIGNATURE_STAMP_COORDINATE_SCALE ||
      placement.yBp + placement.heightBp > SIGNATURE_STAMP_COORDINATE_SCALE
    ) {
      throw new Error("As coordenadas dos carimbos congelados são inválidas.");
    }
    return placement;
  }) as AppliedSignatureStamp["placement"][];
  const [first, second] = slots as [
    AppliedSignatureStamp["placement"],
    AppliedSignatureStamp["placement"],
  ];
  if (
    first.xBp < second.xBp + second.widthBp &&
    first.xBp + first.widthBp > second.xBp &&
    first.yBp < second.yBp + second.heightBp &&
    first.yBp + first.heightBp > second.yBp
  ) throw new Error("Os carimbos congelados não podem se sobrepor.");
  return {
    schemaVersion: schemaVersion as 1 | 2,
    layout: geometry.layout as "HORIZONTAL" | "COMPACT",
    contentLayout: schemaVersion === 1
      ? { ...ELECTRONIC_SIGNATURE_STAMP_CONTENT_LAYOUT_DEFAULTS }
      : prepareFrozenContentLayout(geometry.contentLayout),
    template: null,
    autoLayout: null,
    slots,
  };
};

const assertManifestForFinalization = (
  manifest: DiarioPdfAssetManifest,
  snapshot: DiarioPdfAcademicSnapshot,
  documentSnapshotSha256: string,
  validationUrl: string,
) => {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.source !== "UNIVERSO_DIARIO_PDF_ASSETS_V1" ||
    manifest.documentSnapshotSha256 !== documentSnapshotSha256 ||
    manifest.validationUrl !== validationUrl ||
    manifest.assets?.headerLogo?.sourceKind !== "HTTPS_URL" ||
    manifest.assets.headerLogo.sourceUrl !==
      snapshot.assetSources.headerLogoUrl ||
    manifest.assets.validationQr?.sourceKind !== "GENERATED_QR" ||
    manifest.assets.validationQr.payload !== validationUrl ||
    manifest.assets.validationQr.mimeType !== "image/png" ||
    manifest.assets.validationQr.width !== 240 ||
    manifest.assets.validationQr.height !== 240
  ) throw new Error("O manifesto dos recursos do PDF original é inválido.");
  const expectedWatermark = snapshot.assetSources.watermarkUrl;
  const watermark = manifest.assets.watermark;
  if (expectedWatermark === null) {
    if (watermark !== null) {
      throw new Error("O manifesto incluiu marca-d’água inexistente.");
    }
  } else if (expectedWatermark.startsWith("data:")) {
    if (
      watermark?.sourceKind !== "INLINE_DATA_URI" ||
      watermark.sourceRef !== "documentSnapshot.assetSources.watermarkUrl"
    ) {
      throw new Error(
        "A origem inline da marca-d’água não foi congelada corretamente.",
      );
    }
  } else if (
    watermark?.sourceKind !== "HTTPS_URL" ||
    watermark.sourceUrl !== expectedWatermark
  ) {
    throw new Error("A URL da marca-d’água diverge do snapshot congelado.");
  }
};

const assertReceiptInstitutionalWatermarkReference = (
  snapshot: DiarioPdfAcademicSnapshot,
  reference: ReceiptInstitutionalWatermarkReference,
) => {
  const expected = snapshot.assetSources.watermarkUrl;
  if (expected === null) {
    if (reference !== null) {
      throw new Error(
        "O comprovante incluiu marca-d’água institucional inexistente.",
      );
    }
    return;
  }
  if (expected.startsWith("data:")) {
    if (
      reference?.sourceKind !== "INLINE_DATA_URI" ||
      reference.sourceRef !== "documentSnapshot.assetSources.watermarkUrl"
    ) throw new Error("A referência inline do comprovante não é canônica.");
    return;
  }
  if (
    reference?.sourceKind !== "HTTPS_URL" ||
    reference.sourceUrl !== expected
  ) {
    throw new Error(
      "A marca-d’água institucional do comprovante diverge do snapshot.",
    );
  }
};

/**
 * Resolve exclusivamente a marca-d'água institucional congelada pelo Diário.
 * A origem precisa coincidir simultaneamente com o snapshot acadêmico, com o
 * manifesto de bytes e com a referência entregue pelo RPC de finalização.
 */
export const loadFrozenInstitutionalWatermark = async (
  dependencies: Pick<DiarioArtifactDependencies, "loadCanonicalAsset">,
  snapshot: DiarioPdfAcademicSnapshot,
  manifest: DiarioPdfAssetManifest,
  reference: ReceiptInstitutionalWatermarkReference,
): Promise<InspectedImageAsset | null> => {
  assertReceiptInstitutionalWatermarkReference(snapshot, reference);
  const manifestWatermark = manifest.assets.watermark;
  if (reference === null) {
    if (manifestWatermark !== null) {
      throw new Error(
        "O manifesto possui marca-d’água que não foi congelada para o comprovante.",
      );
    }
    return null;
  }
  if (manifestWatermark === null) {
    throw new Error("O manifesto institucional não possui marca-d’água.");
  }
  const expected = {
    maxBytes: MAX_INLINE_WATERMARK_BYTES,
    expectedMimeType: manifestWatermark.mimeType,
    expectedByteSize: manifestWatermark.byteSize,
    expectedWidth: manifestWatermark.width,
    expectedHeight: manifestWatermark.height,
    expectedSha256: manifestWatermark.sha256,
  } as const;
  if (reference.sourceKind === "INLINE_DATA_URI") {
    if (
      manifestWatermark.sourceKind !== "INLINE_DATA_URI" ||
      manifestWatermark.sourceRef !== reference.sourceRef ||
      !snapshot.assetSources.watermarkUrl?.startsWith("data:")
    ) {
      throw new Error(
        "A marca-d’água inline diverge do manifesto institucional congelado.",
      );
    }
    return inspectImageAsset(
      decodeCanonicalInlineDataImage(snapshot.assetSources.watermarkUrl),
      expected,
    );
  }
  if (
    manifestWatermark.sourceKind !== "HTTPS_URL" ||
    manifestWatermark.sourceUrl !== reference.sourceUrl
  ) {
    throw new Error(
      "A URL da marca-d’água diverge do manifesto institucional congelado.",
    );
  }
  return inspectImageAsset(
    await dependencies.loadCanonicalAsset(reference.sourceUrl),
    expected,
  );
};

/**
 * Geometria v1 continua reconhecida para leitura histórica. No schema v2, que
 * corresponde às políticas v4, qualquer referência custom é incompatível e
 * falha antes de download/composição.
 */
export const assertFrozenCustomWatermarksCompatible = (
  geometrySchemaVersion: 1 | 2 | 3,
  references: readonly ReceiptCustomWatermarkReference[],
) => {
  if (geometrySchemaVersion >= 2 && references.length !== 0) {
    throw new Error(
      "O editor v4/v5 não permite marca-d’água customizada no comprovante.",
    );
  }
  references.forEach((reference) => {
    assertModelAssetReference(reference);
    if (reference.page !== 1 && reference.page !== 2) {
      throw new Error("A página da marca-d’água histórica é inválida.");
    }
  });
};

/**
 * O template global v5 admite somente a referência inline do snapshot
 * congelado. O byte é conferido antes de qualquer composição; URL/Storage e
 * referências alternativas continuam exclusivos de caminhos históricos.
 */
export const assertFrozenV3InstitutionalWatermark = async (
  snapshot: Pick<
    DiarioPdfAcademicSnapshot,
    "assetSources" | "institutionalIdentity"
  >,
  reference: ReceiptInstitutionalWatermarkReference,
) => {
  const source = snapshot.assetSources.watermarkUrl;
  if (
    !source ||
    source !== snapshot.institutionalIdentity.watermarkUrl ||
    reference?.sourceKind !== "INLINE_DATA_URI" ||
    reference.sourceRef !== "documentSnapshot.assetSources.watermarkUrl"
  ) {
    throw new Error(
      "O template global exige a marca landscape institucional congelada.",
    );
  }
  await inspectImageAsset(decodeCanonicalInlineDataImage(source), {
    maxBytes: MAX_INLINE_WATERMARK_BYTES,
  });
};

const finalize = async (
  dependencies: DiarioArtifactDependencies,
  body: DiarioArtifactRequest,
  identity: AuthenticatedIdentity,
) => {
  const preflight = await dependencies.startFinalization({
    ...body,
    ...identity,
  });
  if (preflight.envelopeId !== body.envelopeId) {
    throw new Error("O preflight final retornou envelope divergente.");
  }
  const snapshot = await verifyFrozenDocumentSnapshot(
    preflight.documentSnapshotIntegrity,
    preflight.documentSnapshotSha256,
  );
  assertFinalParticipants(preflight);
  const geometry = normalizeFrozenSignatureGeometry(
    preflight.geometrySnapshot,
  );
  if (geometry.schemaVersion === 3) {
    await assertFrozenV3InstitutionalWatermark(
      snapshot,
      preflight.receiptAssetReferences.institutionalWatermark,
    );
  }
  if (
    preflight.verification.code !== snapshot.validationCode ||
    preflight.verification.basePath !== "/validador"
  ) throw new Error("A validação pública final diverge do snapshot.");
  const validationUrl = buildCanonicalValidationUrl(
    dependencies.validationOrigin,
    preflight.verification.basePath,
    preflight.verification.code,
  );
  assertManifestForFinalization(
    preflight.pdfAssetManifestSnapshot,
    snapshot,
    preflight.documentSnapshotSha256,
    validationUrl,
  );
  assertReceiptInstitutionalWatermarkReference(
    snapshot,
    preflight.receiptAssetReferences.institutionalWatermark,
  );
  const expectedOriginal = expectedArtifactReference(
    body.envelopeId,
    "documento-original.pdf",
  );
  assertDestination(preflight.originalArtifact, expectedOriginal);
  const originalBytes = await dependencies.downloadPrivateObject(
    preflight.originalArtifact,
  );
  if (
    originalBytes.byteLength !== preflight.originalArtifact.byteSize ||
    await sha256Hex(originalBytes) !== preflight.originalArtifact.sha256 ||
    preflight.frozenSignatureTargetSnapshot.originalSha256 !==
      preflight.originalArtifact.sha256
  ) throw new Error("O PDF original privado diverge do artefato congelado.");
  assertFrozenCustomWatermarksCompatible(
    geometry.schemaVersion,
    preflight.receiptAssetReferences.customWatermarks,
  );
  const [stampAsset, receiptLogo, institutionalWatermark] = await Promise.all([
    loadFrozenModelAsset(dependencies, preflight.stampAsset),
    dependencies.loadCanonicalAsset(
      preflight.receiptAssetReferences.logo.sourceUrl,
    )
      .then((asset) =>
        inspectImageAsset(asset, {
          expectedMimeType:
            preflight.pdfAssetManifestSnapshot.assets.headerLogo.mimeType,
          expectedByteSize:
            preflight.pdfAssetManifestSnapshot.assets.headerLogo.byteSize,
          expectedWidth:
            preflight.pdfAssetManifestSnapshot.assets.headerLogo.width,
          expectedHeight:
            preflight.pdfAssetManifestSnapshot.assets.headerLogo.height,
          expectedSha256:
            preflight.pdfAssetManifestSnapshot.assets.headerLogo.sha256,
        })
      ),
    loadFrozenInstitutionalWatermark(
      dependencies,
      snapshot,
      preflight.pdfAssetManifestSnapshot,
      preflight.receiptAssetReferences.institutionalWatermark,
    ),
  ]);
  if (
    preflight.receiptAssetReferences.logo.sourceUrl !==
      snapshot.assetSources.headerLogoUrl ||
    preflight.stampAsset.assetId !==
      (asRecord(preflight.geometrySnapshot)?.assetId ?? null)
  ) {
    throw new Error(
      "Os recursos do comprovante divergem dos snapshots congelados.",
    );
  }
  const signatureVerificationUrls = preflight.participants.map(
    (participant) => {
      const url = buildCanonicalValidationUrl(
        dependencies.validationOrigin,
        "/validador",
        participant.verificationCode,
      );
      const parsed = new URL(url);
      if (
        `${parsed.pathname}${parsed.search}` !== participant.verificationPath
      ) {
        throw new Error("A URL individual diverge da prova congelada.");
      }
      return url;
    },
  );
  const placements = geometry.autoLayout
    ? deriveAutomaticSignatureStampPlacements(
      geometry.autoLayout,
      preflight.participants.length,
    )
    : geometry.slots;
  if (!placements || placements.length !== preflight.participants.length) {
    throw new Error(
      "A distribuição automática não corresponde aos signatários congelados.",
    );
  }
  const stamps = preflight.participants.map((
    participant,
    index,
  ): AppliedSignatureStamp => ({
    role: participant.role,
    participantId: participant.participantId,
    signerName: participant.signerName,
    signerCpfMasked: participant.signerCpfMasked,
    signedAt: participant.signedAt,
    timeZone: "America/Maceio",
    signatureEventId: participant.signatureEventId,
    signatureHash: participant.signatureHash,
    verificationCode: participant.verificationCode,
    verificationUrl: signatureVerificationUrls[index]!,
    placement: placements[index]!,
  }));
  const receiptPayload = {
    ...preflight.receiptPayload,
    logo: asCanonicalImage(receiptLogo),
    institutionalWatermark: institutionalWatermark
      ? asCanonicalImage(institutionalWatermark)
      : null,
    validation: { code: preflight.verification.code, url: validationUrl },
  };
  // Um payload histórico pode carregar a chave removida do contrato v4 em
  // tempo de execução. Ela nunca segue para o compositor novo: a única marca
  // aceita vem da referência institucional congelada e validada acima.
  delete (receiptPayload as Record<string, unknown>).watermarkAssets;
  const artifacts = await createSignedPdfArtifacts({
    originalBytes,
    frozenTarget: preflight.frozenSignatureTargetSnapshot,
    ...(geometry.template
      ? {
        template: geometry.template,
        autoLayout: geometry.autoLayout!,
      }
      : {
        layout: geometry.layout!,
        contentLayout: geometry.contentLayout!,
      }),
    stampPngBytes: stampAsset.bytes,
    verificationUrl: validationUrl,
    stamps,
    receiptPayload,
  });
  const finalReference = expectedArtifactReference(
    body.envelopeId,
    "documento-final.pdf",
  );
  const receiptReference = expectedArtifactReference(
    body.envelopeId,
    "comprovante-evidencia.pdf",
  );
  const finalArtifact = requiredArtifact(
    finalReference,
    artifacts.finalPdfBytes,
    artifacts.finalSha256,
  );
  const receiptArtifact = requiredArtifact(
    receiptReference,
    artifacts.receiptPdfBytes,
    artifacts.receiptSha256,
  );
  await reserveAndUploadFinalArtifactPair(dependencies, {
    envelopeId: body.envelopeId,
    userId: identity.userId,
    sessionId: identity.sessionId,
    requestId: body.requestId,
    finalArtifact,
    finalBytes: artifacts.finalPdfBytes,
    receiptArtifact,
    receiptBytes: artifacts.receiptPdfBytes,
  });
  const registered = await dependencies.registerFinal({
    envelopeId: body.envelopeId,
    userId: identity.userId,
    sessionId: identity.sessionId,
    requestId: body.requestId,
    finalArtifact,
    receiptArtifact,
  });
  return {
    ok: true,
    envelopeId: body.envelopeId,
    status: registered.status,
  } as const;
};

const readBodyBounded = async (request: Request) => {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new PublicHttpError(
      413,
      "REQUEST_BODY_TOO_LARGE",
      "A solicitação ultrapassa o limite permitido.",
    );
  }
  if (!request.body) throw invalidRequest();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel("request-body-limit");
        throw new PublicHttpError(
          413,
          "REQUEST_BODY_TOO_LARGE",
          "A solicitação ultrapassa o limite permitido.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

const bearerFromRequest = (request: Request) => {
  const match = /^Bearer\s+([^\s]{1,8192})$/iu.exec(
    String(request.headers.get("authorization") || "").trim(),
  );
  return match?.[1] || "";
};

const responseHeaders = (request: Request) => ({
  ...buildCorsHeaders(request),
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
});

const jsonResponse = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });

export const publicErrorFromUnknown = (error: unknown) => {
  if (error instanceof PublicHttpError) return error;
  const record = asRecord(error);
  const internal = [record?.code, record?.message]
    .map((value) => String(value || ""))
    .join(" ")
    .toUpperCase();
  if (
    internal.includes("ASSINATURA_SESSAO_INVALIDA") ||
    internal.includes("SESSION_INVALID")
  ) {
    return new PublicHttpError(
      401,
      "SESSION_INVALID",
      "Sua sessão não é mais válida.",
    );
  }
  if (
    internal.includes("42501") || internal.includes("ACCESS_DENIED") ||
    internal.includes("NAO_AUTORIZADO") ||
    internal.includes("VINCULO_INVALIDO") ||
    internal.includes("ENVELOPE_NAO_ENCONTRADO")
  ) {
    return new PublicHttpError(
      403,
      "ACCESS_DENIED",
      "Você não pode preparar este documento.",
    );
  }
  if (internal.includes("IDEMPOTENCIA_DIVERGENTE")) {
    return new PublicHttpError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "A tentativa repetida não corresponde à operação original.",
    );
  }
  if (
    internal.includes("ESTADO_INVALIDO") || internal.includes("ORIGINAL_") ||
    internal.includes("PARTICIPANTES_") || internal.includes("EVENTOS_") ||
    internal.includes("POLITICA_NAO_HABILITADA")
  ) {
    return new PublicHttpError(
      409,
      "ARTIFACT_STATE_CONFLICT",
      "O documento ainda não está no estado permitido para esta operação.",
    );
  }
  return new PublicHttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "O serviço de documentos está temporariamente indisponível.",
  );
};

export const createDiarioArtifactHandler =
  (dependencies: DiarioArtifactDependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: buildCorsHeaders(request) });
    }
    if (request.method !== "POST") {
      return jsonResponse(request, {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." },
      }, 405);
    }
    let authenticated = false;
    let response: Response;
    try {
      const bearer = bearerFromRequest(request);
      if (!bearer) {
        throw new PublicHttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Autenticação obrigatória.",
        );
      }
      const identity = await dependencies.authenticate(bearer);
      authenticated = true;
      const contentType = String(request.headers.get("content-type") || "")
        .toLowerCase();
      if (!contentType.startsWith("application/json")) throw invalidRequest();
      let parsed: unknown;
      try {
        parsed = JSON.parse(
          new TextDecoder().decode(await readBodyBounded(request)),
        );
      } catch (error) {
        if (error instanceof PublicHttpError) throw error;
        throw invalidRequest();
      }
      const body = parseDiarioArtifactRequest(parsed);
      const result = body.action === "PREPARE_ORIGINAL"
        ? await prepareOriginal(dependencies, body, identity)
        : await finalize(dependencies, body, identity);
      response = jsonResponse(request, result);
    } catch (error) {
      const safe = publicErrorFromUnknown(error);
      response = jsonResponse(request, {
        ok: false,
        error: { code: safe.code, message: safe.message },
      }, safe.status);
    }
    if (authenticated && response.ok) {
      // O cleanup é oportunístico e sempre pós-operação. O scheduler de
      // produção usa EdgeRuntime.waitUntil; portanto download/hash/remove nunca
      // entram na latência da resposta legítima. Falhas permanecem fail-closed.
      try {
        dependencies.scheduleBackgroundTask(() =>
          dependencies.reconcileExpiredUploads().catch(() => undefined)
        );
      } catch {
        // A resposta canônica não depende de uma tarefa oportunística.
      }
    }
    return response;
  };
