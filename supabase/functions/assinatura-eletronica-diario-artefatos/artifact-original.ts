import type { DiarioPdfAcademicSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts";
import { composeDiarioPdfWithManifest } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts";
import type { DiarioPdfResolvedAssets } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-assets.ts";
import { freezeDiaryPdfSignatureTarget } from "../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts";
import { createLocalQrCodeDataUrl } from "../../../modules/shared/qrcode/local-qrcode.ts";
import {
  buildCanonicalValidationUrl,
  decodeCanonicalInlineDataImage,
  type DiarioPdfAssetManifest,
  type InspectedImageAsset,
  inspectImageAsset,
  MAX_INLINE_WATERMARK_BYTES,
  toPdfImage,
} from "./artifact-assets.ts";
import { loadOriginalBackCoverAssets } from "./artifact-back-cover-assets.ts";
import type {
  AuthenticatedIdentity,
  DiarioArtifactDependencies,
  DiarioArtifactRequest,
  OriginalPreparePreflight,
  StorageArtifactReference,
} from "./artifact-contracts.ts";
import { SIGNATURE_ARTIFACT_BUCKET } from "./artifact-contracts.ts";
import { verifyFrozenDocumentSnapshot } from "./snapshot-integrity.ts";

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

export const resolveOriginalAssets = async (
  dependencies: Pick<
    DiarioArtifactDependencies,
    "validationOrigin" | "loadCanonicalAsset"
  >,
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
  const [headerLogo, watermark, qrCode, backCover] = await Promise.all([
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
    loadOriginalBackCoverAssets(dependencies, snapshot),
  ]);
  const manifest: DiarioPdfAssetManifest = {
    schemaVersion: 2,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V2",
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
      ...backCover.manifest,
    },
  };
  const resolved: DiarioPdfResolvedAssets = {
    logo: toPdfImage(headerLogo),
    watermark: watermark ? toPdfImage(watermark) : null,
    ...backCover.resolved,
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

export const expectedArtifactReference = (
  envelopeId: string,
  fileName:
    | "documento-original.pdf"
    | "documento-final.pdf"
    | "comprovante-evidencia.pdf",
): StorageArtifactReference => ({
  bucketId: SIGNATURE_ARTIFACT_BUCKET,
  storagePath: `envelopes/${envelopeId}/${fileName}`,
});

export const assertDestination = (
  actual: StorageArtifactReference,
  expected: StorageArtifactReference,
) => {
  if (
    actual?.bucketId !== expected.bucketId ||
    actual?.storagePath !== expected.storagePath
  ) throw new Error("O destino privado do artefato diverge do contrato.");
};

export const requiredArtifact = (
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

export const prepareOriginal = async (
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
