import type { AppliedSignatureStamp } from "../../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts";
import { deriveAutomaticSignatureStampPlacements } from "../../../modules/shared/assinatura-eletronica/signature-stamp-template.ts";
import { createSignedPdfArtifacts } from "../../../modules/gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts";
import {
  buildCanonicalValidationUrl,
  inspectImageAsset,
  sha256Hex,
} from "./artifact-assets.ts";
import { reloadFrozenBackCoverAssets } from "./artifact-back-cover-assets.ts";
import {
  asRecord,
  type AuthenticatedIdentity,
  type DiarioArtifactDependencies,
  type DiarioArtifactRequest,
} from "./artifact-contracts.ts";
import {
  assertDestination,
  expectedArtifactReference,
  requiredArtifact,
  reserveAndUploadFinalArtifactPair,
} from "./artifact-original.ts";
import {
  asCanonicalImage,
  assertFinalParticipants,
  loadFrozenModelAsset,
} from "./artifact-participant-validation.ts";
import { normalizeFrozenSignatureGeometry } from "./artifact-signature-geometry.ts";
import { resolveDiarySignaturePlacements } from "./artifact-diary-signature-slots.ts";
import {
  assertFrozenCustomWatermarksCompatible,
  assertFrozenV3InstitutionalWatermark,
  assertManifestForFinalization,
  assertReceiptInstitutionalWatermarkReference,
  loadFrozenInstitutionalWatermark,
  resolveReceiptWatermarkSettings,
} from "./artifact-final-assets.ts";
import { verifyFrozenDocumentSnapshot } from "./snapshot-integrity.ts";

export const finalize = async (
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
      preflight.receiptWatermarkSnapshot,
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
    preflight.receiptWatermarkSnapshot,
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
      preflight.receiptWatermarkSnapshot,
    ),
    reloadFrozenBackCoverAssets(
      dependencies,
      snapshot,
      preflight.pdfAssetManifestSnapshot,
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
  const historicalPlacements = geometry.autoLayout
    ? deriveAutomaticSignatureStampPlacements(
      geometry.autoLayout,
      preflight.participants.length,
    )
    : geometry.slots;
  const placements = resolveDiarySignaturePlacements(
    preflight.semanticManifestSnapshot,
    preflight.participants,
    historicalPlacements,
  );
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
      ? {
        image: asCanonicalImage(institutionalWatermark),
        settings: resolveReceiptWatermarkSettings(
          snapshot,
          preflight.receiptWatermarkSnapshot,
        ),
      }
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
