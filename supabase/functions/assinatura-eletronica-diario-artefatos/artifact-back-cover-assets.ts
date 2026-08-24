import type { DiarioPdfAcademicSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts";
import type { PdfImage } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-image.core.ts";
import {
  type DiarioPdfAssetManifest,
  type DiarioPdfAssetManifestV2,
  type DiarioPdfManifestImage,
  type InspectedImageAsset,
  inspectImageAsset,
  isDiarioPdfAssetManifestV2,
  type LoadedAssetBytes,
  toPdfImage,
} from "./artifact-assets.ts";

type CanonicalAssetLoader = {
  loadCanonicalAsset: (sourceUrl: string) => Promise<LoadedAssetBytes>;
};

export const MAX_BACK_COVER_IMAGE_COUNT = 20;
export const MAX_BACK_COVER_TOTAL_BYTES = 24 * 1024 * 1024;

type BackCoverImageSource = { fieldId: string; sourceUrl: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const requireExactSource = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} não possui URL canônica.`);
  }
  return value;
};

export const collectBackCoverAssetSources = (
  snapshot: DiarioPdfAcademicSnapshot,
) => {
  const backgroundSource = snapshot.template.contracapaUrl;
  if (backgroundSource !== snapshot.assetSources.backCoverUrl) {
    throw new Error(
      "A arte da contracapa diverge das fontes do snapshot congelado.",
    );
  }
  if (backgroundSource !== null) {
    requireExactSource(backgroundSource, "A arte da contracapa");
  }
  const rawFields = snapshot.templateSource.raw.contracapaCampos;
  if (rawFields !== undefined && !Array.isArray(rawFields)) {
    throw new Error("Os campos de imagem da contracapa são inválidos.");
  }
  const images: BackCoverImageSource[] = [];
  const ids = new Set<string>();
  (rawFields || []).forEach((candidate, index) => {
    const field = asRecord(candidate);
    if (!field || field.visible !== true || field.isImage !== true) return;
    const fieldId = typeof field.id === "string" ? field.id.trim() : "";
    if (!fieldId || fieldId.length > 80 || fieldId !== field.id) {
      throw new Error(
        `O campo de imagem ${index + 1} da contracapa não é canônico.`,
      );
    }
    if (ids.has(fieldId)) {
      throw new Error(`O campo de imagem ${fieldId} está duplicado.`);
    }
    ids.add(fieldId);
    images.push({
      fieldId,
      sourceUrl: requireExactSource(
        field.imageUrl,
        `A imagem ${fieldId} da contracapa`,
      ),
    });
  });
  if (images.length > MAX_BACK_COVER_IMAGE_COUNT) {
    throw new Error("A contracapa excede o limite de imagens autorizado.");
  }
  return { backgroundSource, images } as const;
};

const manifestImage = (image: InspectedImageAsset): DiarioPdfManifestImage => ({
  mimeType: image.mimeType,
  byteSize: image.byteSize,
  width: image.width,
  height: image.height,
  sha256: image.sha256,
});

export const loadOriginalBackCoverAssets = async (
  dependencies: CanonicalAssetLoader,
  snapshot: DiarioPdfAcademicSnapshot,
) => {
  const sources = collectBackCoverAssetSources(snapshot);
  const background = sources.backgroundSource === null
    ? null
    : await inspectImageAsset(
      await dependencies.loadCanonicalAsset(sources.backgroundSource),
    );
  let totalBytes = background?.byteSize || 0;
  const imageAssets = [] as Array<
    BackCoverImageSource & { image: InspectedImageAsset }
  >;
  for (const source of sources.images) {
    const image = await inspectImageAsset(
      await dependencies.loadCanonicalAsset(source.sourceUrl),
    );
    totalBytes += image.byteSize;
    if (totalBytes > MAX_BACK_COVER_TOTAL_BYTES) {
      throw new Error(
        "A contracapa excede o limite total de bytes autorizado.",
      );
    }
    imageAssets.push({ ...source, image });
  }
  return {
    manifest: {
      backCoverBackground: background === null ? null : {
        sourceKind: "HTTPS_URL" as const,
        sourceUrl: sources.backgroundSource!,
        ...manifestImage(background),
      },
      backCoverImages: imageAssets.map(({ fieldId, sourceUrl, image }) => ({
        fieldId,
        sourceUrl,
        ...manifestImage(image),
      })),
    },
    resolved: {
      backCoverBackground: background ? toPdfImage(background) : null,
      backCoverImages: Object.fromEntries(
        imageAssets.map(({ fieldId, image }) => [fieldId, toPdfImage(image)]),
      ) as Record<string, PdfImage>,
    },
  };
};

const frozenImageOptions = (entry: DiarioPdfManifestImage) => ({
  expectedMimeType: entry.mimeType,
  expectedByteSize: entry.byteSize,
  expectedWidth: entry.width,
  expectedHeight: entry.height,
  expectedSha256: entry.sha256,
});

/**
 * V1 é aceito somente para finalizar envelopes históricos. V2 relê todos os
 * bytes que influenciam a contracapa e os confere contra fonte e hash congelados.
 */
export const reloadFrozenBackCoverAssets = async (
  dependencies: CanonicalAssetLoader,
  snapshot: DiarioPdfAcademicSnapshot,
  manifest: DiarioPdfAssetManifest,
) => {
  if (!isDiarioPdfAssetManifestV2(manifest)) return;
  const sources = collectBackCoverAssetSources(snapshot);
  const frozen = manifest.assets;
  if (sources.backgroundSource === null) {
    if (frozen.backCoverBackground !== null) {
      throw new Error("O manifesto incluiu arte de contracapa inexistente.");
    }
  } else if (
    frozen.backCoverBackground?.sourceKind !== "HTTPS_URL" ||
    frozen.backCoverBackground.sourceUrl !== sources.backgroundSource
  ) {
    throw new Error("A fonte da arte de contracapa não foi congelada.");
  }
  if (frozen.backCoverImages.length !== sources.images.length) {
    throw new Error("As imagens da contracapa divergem do snapshot congelado.");
  }
  sources.images.forEach((source, index) => {
    const entry = frozen.backCoverImages[index];
    if (
      entry?.fieldId !== source.fieldId || entry.sourceUrl !== source.sourceUrl
    ) throw new Error("A fonte de imagem da contracapa não foi congelada.");
  });
  await Promise.all([
    frozen.backCoverBackground === null
      ? Promise.resolve(null)
      : dependencies.loadCanonicalAsset(frozen.backCoverBackground.sourceUrl)
        .then((loaded) =>
          inspectImageAsset(
            loaded,
            frozenImageOptions(frozen.backCoverBackground!),
          )
        ),
    ...frozen.backCoverImages.map((entry) =>
      dependencies.loadCanonicalAsset(entry.sourceUrl).then((loaded) =>
        inspectImageAsset(loaded, frozenImageOptions(entry))
      )
    ),
  ]);
};

export type DiarioPdfBackCoverManifestV2 = Pick<
  DiarioPdfAssetManifestV2["assets"],
  "backCoverBackground" | "backCoverImages"
>;
