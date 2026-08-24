import assert from "node:assert/strict";
import { createSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts";
import type {
  DiarioPdfAssetManifestV2,
  DiarioPdfAssetManifestV3,
  LoadedAssetBytes,
} from "./artifact-assets.ts";
import {
  collectCoverBackgroundSource,
  loadOriginalCoverBackground,
  reloadFrozenCoverBackground,
} from "./artifact-cover-background.ts";
import { assertManifestForFinalization } from "./artifact-final-assets.ts";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PROJECT = "https://kfekgwyqozhicpfuunpo.supabase.co";
const COVER_URL =
  `${PROJECT}/storage/v1/object/public/documentos/templates/capa.png`;
const loadedPng = (): LoadedAssetBytes => ({
  bytes: Uint8Array.from(atob(PNG_1X1), (character) => character.charCodeAt(0)),
  mimeType: "image/png",
});

const snapshotWithCover = () => {
  const snapshot = createSnapshot();
  snapshot.template.capaUrl = COVER_URL;
  snapshot.assetSources.coverUrl = COVER_URL;
  return snapshot;
};

const v3Manifest = async () => {
  const snapshot = snapshotWithCover();
  const loaded = await loadOriginalCoverBackground(
    { loadCanonicalAsset: () => Promise.resolve(loadedPng()) },
    snapshot,
  );
  const image = loaded.manifest.coverBackground!;
  const imageMetrics = {
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
    sha256: image.sha256,
  };
  const manifest: DiarioPdfAssetManifestV3 = {
    schemaVersion: 3,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V3",
    documentSnapshotSha256: "a".repeat(64),
    validationUrl: "https://universocc.com.br/validador?code=DIA-TESTE",
    assets: {
      headerLogo: {
        sourceKind: "HTTPS_URL",
        sourceUrl: snapshot.assetSources.headerLogoUrl,
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
      coverBackground: image,
      backCoverBackground: null,
      backCoverImages: [],
    },
  };
  return { snapshot, manifest, loaded };
};

Deno.test("congela a URL exata e as propriedades binárias da capa", async () => {
  const { loaded } = await v3Manifest();
  assert.equal(loaded.manifest.coverBackground?.sourceUrl, COVER_URL);
  assert.equal(loaded.manifest.coverBackground?.mimeType, "image/png");
  assert.equal(loaded.manifest.coverBackground?.width, 1);
  assert.equal(loaded.manifest.coverBackground?.height, 1);
  assert.match(
    loaded.manifest.coverBackground?.sha256 || "",
    /^[0-9a-f]{64}$/u,
  );
  assert.ok(loaded.resolved);
});

Deno.test("congela capa opcional nula sem download", async () => {
  let loads = 0;
  const loaded = await loadOriginalCoverBackground(
    {
      loadCanonicalAsset: () => {
        loads += 1;
        return Promise.resolve(loadedPng());
      },
    },
    createSnapshot(),
  );
  assert.equal(loads, 0);
  assert.equal(loaded.manifest.coverBackground, null);
  assert.equal(loaded.resolved, null);
});

Deno.test("revalida URL, bytes e hash antes da finalização", async () => {
  const { snapshot, manifest } = await v3Manifest();
  let loads = 0;
  await reloadFrozenCoverBackground(
    {
      loadCanonicalAsset: (sourceUrl) => {
        loads += 1;
        assert.equal(sourceUrl, COVER_URL);
        return Promise.resolve(loadedPng());
      },
    },
    snapshot,
    manifest,
  );
  assert.equal(loads, 1);

  manifest.assets.coverBackground!.sha256 = "b".repeat(64);
  await assert.rejects(
    () =>
      reloadFrozenCoverBackground(
        { loadCanonicalAsset: () => Promise.resolve(loadedPng()) },
        snapshot,
        manifest,
      ),
    /diverge do snapshot/u,
  );
});

Deno.test("rejeita divergência entre template e assetSources", () => {
  const snapshot = snapshotWithCover();
  snapshot.assetSources.coverUrl = `${COVER_URL}-outra`;
  assert.throws(
    () => collectCoverBackgroundSource(snapshot),
    /diverge das fontes/u,
  );
});

Deno.test("não inventa capa ao finalizar manifesto v2 histórico", async () => {
  const { manifest: v3 } = await v3Manifest();
  const legacy: DiarioPdfAssetManifestV2 = {
    ...v3,
    schemaVersion: 2,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V2",
    assets: {
      headerLogo: v3.assets.headerLogo,
      watermark: v3.assets.watermark,
      validationQr: v3.assets.validationQr,
      backCoverBackground: v3.assets.backCoverBackground,
      backCoverImages: v3.assets.backCoverImages,
    },
  };
  let loads = 0;
  await reloadFrozenCoverBackground(
    {
      loadCanonicalAsset: () => {
        loads += 1;
        return Promise.resolve(loadedPng());
      },
    },
    snapshotWithCover(),
    legacy,
  );
  assert.equal(loads, 0);
  assert.doesNotThrow(() =>
    assertManifestForFinalization(
      legacy,
      snapshotWithCover(),
      legacy.documentSnapshotSha256,
      legacy.validationUrl,
    )
  );
});

Deno.test("finalização aceita v3 somente com a referência exata da capa", async () => {
  const { snapshot, manifest } = await v3Manifest();
  assert.doesNotThrow(() =>
    assertManifestForFinalization(
      manifest,
      snapshot,
      manifest.documentSnapshotSha256,
      manifest.validationUrl,
    )
  );
  manifest.assets.coverBackground!.sourceUrl = `${COVER_URL}-trocada`;
  assert.throws(
    () =>
      assertManifestForFinalization(
        manifest,
        snapshot,
        manifest.documentSnapshotSha256,
        manifest.validationUrl,
      ),
    /fonte do fundo da capa/u,
  );
});
