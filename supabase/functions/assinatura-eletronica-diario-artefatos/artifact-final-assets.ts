import type { DiarioPdfAcademicSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts";
import {
  decodeCanonicalInlineDataImage,
  type DiarioPdfAssetManifest,
  type InspectedImageAsset,
  inspectImageAsset,
  MAX_INLINE_WATERMARK_BYTES,
} from "./artifact-assets.ts";
import type {
  DiarioArtifactDependencies,
  ReceiptCustomWatermarkReference,
  ReceiptInstitutionalWatermarkReference,
  ReceiptWatermarkSnapshot,
} from "./artifact-contracts.ts";
import { assertModelAssetReference } from "./artifact-participant-validation.ts";

export const assertManifestForFinalization = (
  manifest: DiarioPdfAssetManifest,
  snapshot: DiarioPdfAcademicSnapshot,
  documentSnapshotSha256: string,
  validationUrl: string,
) => {
  if (
    !(
      manifest?.schemaVersion === 1 &&
        manifest.source === "UNIVERSO_DIARIO_PDF_ASSETS_V1" ||
      manifest?.schemaVersion === 2 &&
        manifest.source === "UNIVERSO_DIARIO_PDF_ASSETS_V2"
    ) ||
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

export const assertReceiptInstitutionalWatermarkReference = (
  snapshot: DiarioPdfAcademicSnapshot,
  reference: ReceiptInstitutionalWatermarkReference,
  receiptSnapshot: ReceiptWatermarkSnapshot = null,
) => {
  if (receiptSnapshot !== null) {
    if (
      receiptSnapshot.poloId !== snapshot.source.poloId ||
      reference?.sourceKind !== "INLINE_DATA_URI" ||
      reference.sourceRef !== "receiptWatermarkSnapshot.url"
    ) {
      throw new Error(
        "A marca retrato do comprovante diverge do snapshot congelado.",
      );
    }
    return;
  }
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
  receiptSnapshot: ReceiptWatermarkSnapshot = null,
): Promise<InspectedImageAsset | null> => {
  assertReceiptInstitutionalWatermarkReference(
    snapshot,
    reference,
    receiptSnapshot,
  );
  if (receiptSnapshot !== null) {
    return inspectImageAsset(
      decodeCanonicalInlineDataImage(receiptSnapshot.url),
      { maxBytes: MAX_INLINE_WATERMARK_BYTES },
    );
  }
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
    "assetSources" | "institutionalIdentity" | "source"
  >,
  reference: ReceiptInstitutionalWatermarkReference,
  receiptSnapshot: ReceiptWatermarkSnapshot = null,
) => {
  const source = snapshot.assetSources.watermarkUrl;
  if (
    !source ||
    source !== snapshot.institutionalIdentity.watermarkUrl
  ) {
    throw new Error(
      "O template global exige a marca landscape institucional congelada.",
    );
  }
  await inspectImageAsset(decodeCanonicalInlineDataImage(source), {
    maxBytes: MAX_INLINE_WATERMARK_BYTES,
  });
  if (receiptSnapshot === null) {
    if (
      reference?.sourceKind !== "INLINE_DATA_URI" ||
      reference.sourceRef !== "documentSnapshot.assetSources.watermarkUrl"
    ) {
      throw new Error(
        "O template global exige a marca landscape institucional congelada.",
      );
    }
    return;
  }
  if (
    receiptSnapshot.poloId !== snapshot.source.poloId ||
    reference?.sourceKind !== "INLINE_DATA_URI" ||
    reference.sourceRef !== "receiptWatermarkSnapshot.url"
  ) {
    throw new Error(
      "O comprovante exige a marca portrait institucional congelada.",
    );
  }
  await inspectImageAsset(decodeCanonicalInlineDataImage(receiptSnapshot.url), {
    maxBytes: MAX_INLINE_WATERMARK_BYTES,
  });
};

export const resolveReceiptWatermarkSettings = (
  snapshot: Pick<DiarioPdfAcademicSnapshot, "institutionalIdentity">,
  receiptSnapshot: ReceiptWatermarkSnapshot,
) =>
  receiptSnapshot === null
    ? snapshot.institutionalIdentity.watermark
      ? {
        opacity: snapshot.institutionalIdentity.watermark.opacity,
        scale: snapshot.institutionalIdentity.watermark.scale,
        rotate: snapshot.institutionalIdentity.watermark.rotate,
      }
      : null
    : {
      opacity: receiptSnapshot.opacity,
      scale: receiptSnapshot.scale,
      rotate: receiptSnapshot.rotate,
    };
