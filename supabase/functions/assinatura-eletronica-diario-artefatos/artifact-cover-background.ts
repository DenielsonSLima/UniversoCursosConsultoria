import type { DiarioPdfAcademicSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts";
import {
  type DiarioPdfAssetManifest,
  type DiarioPdfAssetManifestV3,
  type DiarioPdfManifestImage,
  type InspectedImageAsset,
  inspectImageAsset,
  type LoadedAssetBytes,
  toPdfImage,
} from "./artifact-assets.ts";

type CanonicalAssetLoader = {
  loadCanonicalAsset: (sourceUrl: string) => Promise<LoadedAssetBytes>;
};

const requireExactSource = (value: unknown) => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error("O fundo da capa não possui URL canônica.");
  }
  return value;
};

export const collectCoverBackgroundSource = (
  snapshot: DiarioPdfAcademicSnapshot,
) => {
  const sourceUrl = snapshot.template.capaUrl;
  if (sourceUrl !== snapshot.assetSources.coverUrl) {
    throw new Error(
      "O fundo da capa diverge das fontes do snapshot congelado.",
    );
  }
  return sourceUrl === null ? null : requireExactSource(sourceUrl);
};

const manifestImage = (image: InspectedImageAsset): DiarioPdfManifestImage => ({
  mimeType: image.mimeType,
  byteSize: image.byteSize,
  width: image.width,
  height: image.height,
  sha256: image.sha256,
});

export const loadOriginalCoverBackground = async (
  dependencies: CanonicalAssetLoader,
  snapshot: DiarioPdfAcademicSnapshot,
) => {
  const sourceUrl = collectCoverBackgroundSource(snapshot);
  const image = sourceUrl === null ? null : await inspectImageAsset(
    await dependencies.loadCanonicalAsset(sourceUrl),
  );
  return {
    manifest: {
      coverBackground: image === null ? null : {
        sourceKind: "HTTPS_URL" as const,
        sourceUrl: sourceUrl!,
        ...manifestImage(image),
      },
    },
    resolved: image === null ? null : toPdfImage(image),
  };
};

const frozenImageOptions = (entry: DiarioPdfManifestImage) => ({
  expectedMimeType: entry.mimeType,
  expectedByteSize: entry.byteSize,
  expectedWidth: entry.width,
  expectedHeight: entry.height,
  expectedSha256: entry.sha256,
});

export const assertFrozenCoverBackgroundReference = (
  snapshot: DiarioPdfAcademicSnapshot,
  manifest: DiarioPdfAssetManifest,
) => {
  if (manifest.schemaVersion !== 3) return;
  const sourceUrl = collectCoverBackgroundSource(snapshot);
  const frozen = manifest.assets.coverBackground;
  if (sourceUrl === null) {
    if (frozen !== null) {
      throw new Error("O manifesto incluiu fundo de capa inexistente.");
    }
    return;
  }
  if (
    frozen?.sourceKind !== "HTTPS_URL" || frozen.sourceUrl !== sourceUrl
  ) throw new Error("A fonte do fundo da capa não foi congelada.");
};

/**
 * V1/V2 permanecem finalizáveis como históricos. V3 relê o fundo da capa e
 * exige os mesmos bytes, MIME, dimensões e hash usados no PDF original.
 */
export const reloadFrozenCoverBackground = async (
  dependencies: CanonicalAssetLoader,
  snapshot: DiarioPdfAcademicSnapshot,
  manifest: DiarioPdfAssetManifest,
) => {
  if (manifest.schemaVersion !== 3) return null;
  assertFrozenCoverBackgroundReference(snapshot, manifest);
  const frozen = manifest.assets.coverBackground;
  if (frozen === null) return null;
  return inspectImageAsset(
    await dependencies.loadCanonicalAsset(frozen.sourceUrl),
    frozenImageOptions(frozen),
  );
};

export type DiarioPdfCoverBackgroundManifestV3 = Pick<
  DiarioPdfAssetManifestV3["assets"],
  "coverBackground"
>;
