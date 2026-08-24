import type { CanonicalPdfImage } from "../../../modules/gestor/secretaria/shared/canonical-document-vector-pdf.core.ts";
import { ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS } from "../../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import {
  assertSha256,
  imageToDataUrl,
  type InspectedImageAsset,
  inspectImageAsset,
  MAX_INLINE_WATERMARK_BYTES,
} from "./artifact-assets.ts";
import type {
  DiarioArtifactDependencies,
  FinalizationPreflight,
  StoredModelAssetReference,
} from "./artifact-contracts.ts";
import { SIGNATURE_MODEL_ASSET_BUCKET } from "./artifact-contracts.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MASKED_CPF_PATTERN =
  /^(?:[0-9]{2}\*\.\*{3}\.\*{2}[0-9]-[0-9]{2}|\*{3}\.\*{3}\.\*{3}-[0-9]{2})$/u;
const SIGNATURE_CODE_PATTERN =
  /^SIG-[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/u;
const ISO_WITH_SECONDS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;

export const assertModelAssetReference = (
  reference: StoredModelAssetReference,
) => {
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

export const loadFrozenModelAsset = async (
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

export const asCanonicalImage = (
  asset: InspectedImageAsset,
): CanonicalPdfImage => ({
  dataUrl: imageToDataUrl(asset),
  format: asset.format,
});

export const assertFinalParticipants = (preflight: FinalizationPreflight) => {
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
