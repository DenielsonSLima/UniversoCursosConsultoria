import assert from "node:assert/strict";
import { composeDiarioPdfWithManifest } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts";
import { createSnapshot } from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts";
import { resolveOriginalAssets } from "./artifact-original.ts";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PROJECT = "https://kfekgwyqozhicpfuunpo.supabase.co";
const assetUrl = (name: string) =>
  `${PROJECT}/storage/v1/object/public/documentos/templates/${name}.png`;
const loadedPng = () => ({
  bytes: Uint8Array.from(atob(PNG_1X1), (character) => character.charCodeAt(0)),
  mimeType: "image/png",
});

Deno.test("adapter Edge entrega capa e contracapa congeladas ao compositor", async () => {
  const snapshot = createSnapshot();
  snapshot.template.cabecalhoLogoUrl = assetUrl("logo");
  snapshot.institutionalIdentity.logoUrl = assetUrl("logo");
  snapshot.assetSources.headerLogoUrl = assetUrl("logo");
  snapshot.template.capaUrl = assetUrl("capa");
  snapshot.assetSources.coverUrl = assetUrl("capa");
  snapshot.template.contracapaUrl = assetUrl("contracapa");
  snapshot.assetSources.backCoverUrl = assetUrl("contracapa");
  snapshot.templateSource.raw.contracapaCampos = [
    ...snapshot.templateSource.raw.contracapaCampos as unknown[],
    {
      id: "selo_oficial",
      label: "",
      valuePlaceholder: "",
      imageUrl: assetUrl("selo"),
      visible: true,
      isImage: true,
      x: 80,
      y: 5,
      width: 10,
      fontSize: 8,
      color: "#071a33",
      bold: false,
      borderTop: false,
      align: "center",
      mixBlendMode: "normal",
    },
  ];
  const assets = await resolveOriginalAssets(
    {
      validationOrigin: "https://universocc.com.br",
      loadCanonicalAsset: () => Promise.resolve(loadedPng()),
    },
    snapshot,
    { code: snapshot.validationCode, basePath: "/validador" },
    "a".repeat(64),
  );
  assert.equal(assets.manifest.schemaVersion, 3);
  if (assets.manifest.schemaVersion !== 3) {
    throw new Error("manifesto v3 esperado");
  }
  assert.equal(
    assets.manifest.assets.coverBackground?.sourceUrl,
    assetUrl("capa"),
  );
  assert.equal(
    assets.manifest.assets.backCoverBackground?.sourceUrl,
    assetUrl("contracapa"),
  );
  assert.equal(
    assets.manifest.assets.backCoverImages[0].fieldId,
    "selo_oficial",
  );
  assert.ok(assets.resolved.coverBackground);
  assert.ok(assets.resolved.backCoverBackground);
  assert.ok(assets.resolved.backCoverImages.selo_oficial);

  const composed = await composeDiarioPdfWithManifest(
    snapshot,
    assets.resolved,
  );
  assert.ok(composed.bytes.byteLength > 1_000);
  assert.match(composed.sha256, /^[0-9a-f]{64}$/u);
});
