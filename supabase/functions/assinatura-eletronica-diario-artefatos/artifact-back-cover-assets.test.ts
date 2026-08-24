import assert from "node:assert/strict";
import { createSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts";
import {
  collectBackCoverAssetSources,
  loadOriginalBackCoverAssets,
  reloadFrozenBackCoverAssets,
} from "./artifact-back-cover-assets.ts";
import type {
  DiarioPdfAssetManifestV1,
  DiarioPdfAssetManifestV2,
  LoadedAssetBytes,
} from "./artifact-assets.ts";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PROJECT = "https://kfekgwyqozhicpfuunpo.supabase.co";
const assetUrl = (name: string) =>
  `${PROJECT}/storage/v1/object/public/documentos/templates/${name}.png`;
const loadedPng = (): LoadedAssetBytes => ({
  bytes: Uint8Array.from(atob(PNG_1X1), (character) => character.charCodeAt(0)),
  mimeType: "image/png",
});

const snapshotWithBackCover = () => {
  const snapshot = createSnapshot();
  snapshot.template.contracapaUrl = assetUrl("contracapa");
  snapshot.assetSources.backCoverUrl = assetUrl("contracapa");
  snapshot.templateSource.raw.contracapaCampos = [
    {
      id: "selo_b",
      imageUrl: assetUrl("selo-b"),
      visible: true,
      isImage: true,
    },
    {
      id: "texto_ignorado",
      visible: true,
      isImage: false,
    },
    {
      id: "selo_a",
      imageUrl: assetUrl("selo-a"),
      visible: true,
      isImage: true,
    },
    {
      id: "imagem_oculta",
      imageUrl: assetUrl("oculta"),
      visible: false,
      isImage: true,
    },
  ];
  return snapshot;
};

const v2Manifest = async () => {
  const snapshot = snapshotWithBackCover();
  const loaded = await loadOriginalBackCoverAssets(
    { loadCanonicalAsset: () => Promise.resolve(loadedPng()) },
    snapshot,
  );
  const image = loaded.manifest.backCoverImages[0];
  const imageMetrics = {
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
    sha256: image.sha256,
  };
  const manifest: DiarioPdfAssetManifestV2 = {
    schemaVersion: 2,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V2",
    documentSnapshotSha256: "a".repeat(64),
    validationUrl: "https://universocc.com.br/validador?code=DIA-TESTE",
    assets: {
      headerLogo: {
        sourceKind: "HTTPS_URL",
        sourceUrl: assetUrl("logo"),
        ...imageMetrics,
      },
      watermark: null,
      validationQr: {
        sourceKind: "GENERATED_QR",
        payload: "https://universocc.com.br/validador?code=DIA-TESTE",
        mimeType: "image/png",
        byteSize: imageMetrics.byteSize,
        width: 240,
        height: 240,
        sha256: imageMetrics.sha256,
      },
      ...loaded.manifest,
    },
  };
  return { snapshot, manifest, loaded };
};

Deno.test("congela arte e imagens visíveis da contracapa em ordem canônica", async () => {
  const { loaded } = await v2Manifest();
  assert.equal(
    loaded.manifest.backCoverBackground?.sourceUrl,
    assetUrl("contracapa"),
  );
  assert.deepEqual(
    loaded.manifest.backCoverImages.map(({ fieldId, sourceUrl }) => ({
      fieldId,
      sourceUrl,
    })),
    [
      { fieldId: "selo_b", sourceUrl: assetUrl("selo-b") },
      { fieldId: "selo_a", sourceUrl: assetUrl("selo-a") },
    ],
  );
  assert.deepEqual(Object.keys(loaded.resolved.backCoverImages), [
    "selo_b",
    "selo_a",
  ]);
  assert.ok(loaded.resolved.backCoverBackground);
});

Deno.test("revalida fontes e hashes da contracapa antes da finalização", async () => {
  const { snapshot, manifest } = await v2Manifest();
  const loadedUrls: string[] = [];
  await reloadFrozenBackCoverAssets(
    {
      loadCanonicalAsset: (sourceUrl) => {
        loadedUrls.push(sourceUrl);
        return Promise.resolve(loadedPng());
      },
    },
    snapshot,
    manifest,
  );
  assert.deepEqual(
    loadedUrls.sort(),
    [
      assetUrl("contracapa"),
      assetUrl("selo-a"),
      assetUrl("selo-b"),
    ].sort(),
  );

  manifest.assets.backCoverImages[0].sourceUrl = assetUrl("trocada");
  await assert.rejects(
    () =>
      reloadFrozenBackCoverAssets(
        {
          loadCanonicalAsset: () => Promise.resolve(loadedPng()),
        },
        snapshot,
        manifest,
      ),
    /fonte de imagem/u,
  );
});

Deno.test("mantém leitura v1 histórica sem inventar ativos de contracapa", async () => {
  const { manifest: current } = await v2Manifest();
  const legacy: DiarioPdfAssetManifestV1 = {
    schemaVersion: 1,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V1",
    documentSnapshotSha256: current.documentSnapshotSha256,
    validationUrl: current.validationUrl,
    assets: {
      headerLogo: current.assets.headerLogo,
      watermark: current.assets.watermark,
      validationQr: current.assets.validationQr,
    },
  };
  let loads = 0;
  await reloadFrozenBackCoverAssets(
    {
      loadCanonicalAsset: () => {
        loads += 1;
        return Promise.resolve(loadedPng());
      },
    },
    snapshotWithBackCover(),
    legacy,
  );
  assert.equal(loads, 0);
});

Deno.test("rejeita identificadores duplicados no modelo congelado", () => {
  const snapshot = snapshotWithBackCover();
  snapshot.templateSource.raw.contracapaCampos = [
    { id: "selo", imageUrl: assetUrl("a"), visible: true, isImage: true },
    { id: "selo", imageUrl: assetUrl("b"), visible: true, isImage: true },
  ];
  assert.throws(
    () => collectBackCoverAssetSources(snapshot),
    /duplicado/u,
  );
});

Deno.test("limita a quantidade de downloads configuráveis da contracapa", () => {
  const snapshot = snapshotWithBackCover();
  snapshot.templateSource.raw.contracapaCampos = Array.from(
    { length: 21 },
    (_, index) => ({
      id: `imagem_${index}`,
      imageUrl: assetUrl(`imagem-${index}`),
      visible: true,
      isImage: true,
    }),
  );
  assert.throws(
    () => collectBackCoverAssetSources(snapshot),
    /limite de imagens/u,
  );
});
