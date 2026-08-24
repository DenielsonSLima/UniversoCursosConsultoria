/* global structuredClone, TextDecoder */

import assert from "node:assert/strict";
import {
  composeDiarioPdfWithManifest,
  type DiarioPdfResolvedAssets,
} from "./diario-pdf.ts";
import {
  verifyFrozenDocumentSnapshot,
} from "../../../../../../../supabase/functions/assinatura-eletronica-diario-artefatos/snapshot-integrity.ts";
import {
  createSnapshot,
  createSnapshotIntegrity,
  loadAssets,
} from "./diario-pdf-server-boundary.fixtures.ts";

// Compatibilidade dos consumidores Edge que historicamente importam o fixture
// deste contrato público de fronteira, sem acoplá-los ao arquivo de teste novo.
export {
  createSnapshot,
  createSnapshotIntegrity,
  loadAssets,
} from "./diario-pdf-server-boundary.fixtures.ts";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test("compositor puro gera bytes, SHA-256 e manifesto no mesmo ciclo", async () => {
  const built = await composeDiarioPdfWithManifest(
    createSnapshot(),
    await loadAssets(),
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      built.bytes.slice().buffer as ArrayBuffer,
    ),
  );
  const expectedSha256 = [...digest].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  assert.equal(new TextDecoder().decode(built.bytes.subarray(0, 4)), "%PDF");
  assert.equal(built.sha256, expectedSha256);
  assert.match(built.sha256, /^[0-9a-f]{64}$/);
  assert.equal(built.manifest.pageCount, built.pdf.getNumberOfPages());
  assert.equal(built.manifest.schemaVersion, 2);
  assert.equal(built.manifest.targetPageIndex, 1);
  assert.equal(built.manifest.instructionsPageIndex, null);
  if (built.manifest.schemaVersion !== 2) throw new Error("Manifesto v2 esperado.");
  assert.equal(built.manifest.backCoverPageIndex, 1);
  assert.deepEqual(
    built.manifest.signatureSlots.map(({ role, fieldId }) => ({ role, fieldId })),
    [
      { role: "PROFESSOR", fieldId: "contracapaAssinaturaProfessor" },
      { role: "COORDENADOR", fieldId: "contracapaAssinaturaCoordenador" },
    ],
  );
});

Deno.test("compositor puro reproduz bytes idênticos para o mesmo snapshot congelado", async () => {
  const [first, second] = await Promise.all([
    composeDiarioPdfWithManifest(createSnapshot(), await loadAssets()),
    composeDiarioPdfWithManifest(createSnapshot(), await loadAssets()),
  ]);

  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.bytes, second.bytes);
});

Deno.test("compositor aplica escala, opacidade e rotação da marca congelada sem fallback", async () => {
  const sourceUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const createWatermarkedSnapshot = (rotate: boolean, scale = 65) => {
    const snapshot = createSnapshot();
    snapshot.institutionalIdentity.watermarkUrl = sourceUrl;
    snapshot.institutionalIdentity.watermark = {
      url: sourceUrl,
      opacity: 0.35,
      scale,
      rotate,
    };
    snapshot.assetSources.watermarkUrl = sourceUrl;
    return snapshot;
  };
  const assets = await loadAssets();
  const watermarkedAssets = { ...assets, watermark: assets.logo };
  const [flat, rotated, smaller] = await Promise.all([
    composeDiarioPdfWithManifest(
      createWatermarkedSnapshot(false),
      watermarkedAssets,
    ),
    composeDiarioPdfWithManifest(
      createWatermarkedSnapshot(true),
      watermarkedAssets,
    ),
    composeDiarioPdfWithManifest(
      createWatermarkedSnapshot(false, 40),
      watermarkedAssets,
    ),
  ]);

  assert.notEqual(flat.sha256, rotated.sha256);
  assert.notEqual(flat.sha256, smaller.sha256);
  assert.equal(flat.manifest.pageCount, rotated.manifest.pageCount);
  await assert.rejects(
    () => composeDiarioPdfWithManifest(
      createWatermarkedSnapshot(false),
      { ...watermarkedAssets, watermark: null },
    ),
    /bytes da marca-d’água divergem/u,
  );
});

Deno.test("adapter Edge verifica bytes canônicos e hashes internos antes de compor", async () => {
  const snapshot = createSnapshot();
  const integrity = await createSnapshotIntegrity(snapshot);
  const verified = await verifyFrozenDocumentSnapshot(
    integrity,
    integrity.documentSnapshotSha256,
  );
  assert.equal(verified.observacoes, "Sem observações.");
  assert.equal(Object.isFrozen(verified), true);

  const changedObservations = structuredClone(integrity);
  changedObservations.canonicalJson = changedObservations.canonicalJson.replace(
    "Sem observações.",
    "Observação adulterada.",
  );
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        changedObservations,
        integrity.documentSnapshotSha256,
      ),
    /conteúdo canônico/u,
  );

  const changedTemplateRaw = structuredClone(integrity);
  changedTemplateRaw.canonicalJson = changedTemplateRaw.canonicalJson.replace(
    '"versao":1',
    '"versao":2',
  );
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        changedTemplateRaw,
        integrity.documentSnapshotSha256,
      ),
    /conteúdo canônico/u,
  );
});

Deno.test("adapter Edge compara os hashes acadêmico e de modelo embutidos com a prova SQL", async () => {
  const altered = createSnapshot();
  altered.source.academicRevisionSha256 = "c".repeat(64);
  const alteredProof = await createSnapshotIntegrity(altered);
  alteredProof.academicRevisionSha256 = "a".repeat(64);
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        alteredProof,
        alteredProof.documentSnapshotSha256,
      ),
    /hashes internos/u,
  );
});

Deno.test("compositor puro rejeita bytes de imagem adulterados", async () => {
  const assets = await loadAssets();
  await assert.rejects(
    () =>
      composeDiarioPdfWithManifest(createSnapshot(), {
        ...assets,
        logo: { bytes: new Uint8Array([1, 2, 3]), format: "PNG" },
      }),
    /logo do Diário não é uma imagem .* válida/u,
  );
});

Deno.test("URL e QR exigem origem, path e payload exatos do adaptador confiável", async () => {
  const snapshot = createSnapshot();
  const assets = await loadAssets();
  const probes: Array<[string, DiarioPdfResolvedAssets, RegExp]> = [
    ["query extra", {
      ...assets,
      validationUrl: `${assets.validationUrl}&next=https://evil.test`,
    }, /URL canônica/u],
    ["fragmento", {
      ...assets,
      validationUrl: `${assets.validationUrl}#assinatura`,
    }, /URL canônica/u],
    ["origem diversa", {
      ...assets,
      validationEndpoint: {
        ...assets.validationEndpoint!,
        origin: "https://evil.test",
      },
    }, /URL canônica/u],
    ["path diverso", {
      ...assets,
      validationEndpoint: { ...assets.validationEndpoint!, pathname: "/outro" },
    }, /URL canônica/u],
    ["credenciais", {
      ...assets,
      validationEndpoint: {
        ...assets.validationEndpoint!,
        origin: "https://user:pass@universocc.com.br",
      },
    }, /origem ou o path/u],
    ["endpoint não confiável", {
      ...assets,
      validationEndpoint: {
        ...assets.validationEndpoint!,
        generatedBy: "BROWSER" as "TRUSTED_ADAPTER",
      },
    }, /adaptador confiável/u],
    ["QR não confiável", {
      ...assets,
      qrCode: {
        ...assets.qrCode!,
        generatedBy: "BROWSER" as "TRUSTED_ADAPTER",
      },
    }, /adaptador confiável/u],
    ["payload diferente", {
      ...assets,
      qrCode: {
        ...assets.qrCode!,
        payload: "https://universocc.com.br/validador?code=OUTRO",
      },
    }, /conteúdo do QR Code/u],
  ];

  for (const [label, probe, expected] of probes) {
    await assert.rejects(
      () => composeDiarioPdfWithManifest(snapshot, probe),
      expected,
      label,
    );
  }
});

Deno.test("fronteira server-safe e fluxo web usam um único adapter vetorial", async () => {
  const [core, assets, coverPages, backCoverFields, adapter, hook, modal] = await Promise.all([
    Deno.readTextFile(new URL("./diario-pdf.ts", import.meta.url)),
    Deno.readTextFile(new URL("./diario-pdf-assets.ts", import.meta.url)),
    Deno.readTextFile(
      new URL("./diario-pdf-cover-pages.ts", import.meta.url),
    ),
    Deno.readTextFile(
      new URL("./diario-pdf-back-cover-fields.ts", import.meta.url),
    ),
    Deno.readTextFile(new URL("./diario-pdf.browser.ts", import.meta.url)),
    Deno.readTextFile(
      new URL("./hooks/useDiarioPdfDownload.ts", import.meta.url),
    ),
    Deno.readTextFile(
      new URL("./export/DiarioExportModal.tsx", import.meta.url),
    ),
  ]);

  assert.doesNotMatch(
    core,
    /React|\.tsx['"]|Documentos\/Capa|import\.meta\.env/u,
  );
  assert.doesNotMatch(core, /\b(?:window|document)\.|\bfetch\s*\(/u);
  assert.doesNotMatch(
    core,
    /addFullPageImage|backCover:\s*PdfImage|cover:\s*PdfImage/u,
  );
  assert.doesNotMatch(
    core,
    /createDocumentValidationQrDataUrl|getDocumentValidationUrl|loadPdfImage/u,
  );
  assert.match(core, /drawBackCover/u);
  assert.match(core, /drawContentPages/u);
  assert.doesNotMatch(coverPages, /drawCanonicalInstitutionalHeader|DADOS DO DOCUMENTO/u);
  assert.match(assets, /drawPageWatermark/u);
  assert.match(assets, /presentation\.rotate\s*\?\s*-22\s*:\s*0/u);
  assert.match(backCoverFields, /["']diario-validation-qr["']/u);
  assert.match(backCoverFields, /contracapaRegulamento/u);
  assert.match(backCoverFields, /contracapaAutenticacao/u);
  assert.match(backCoverFields, /resolveBackCoverSignatureSlots/u);
  assert.match(core, /crypto\.subtle\.digest\(["']SHA-256["'], bytes\)/u);
  assert.doesNotMatch(adapter, /Documentos\/Capa-Diario|capaDiarioPadrao/u);
  assert.match(adapter, /generatedBy:\s*'TRUSTED_ADAPTER'/u);
  assert.match(adapter, /createDocumentValidationQrDataUrl/u);
  assert.match(adapter, /getDocumentValidationUrl/u);
  assert.match(adapter, /loadPdfImage/u);
  assert.match(adapter, /composeDiarioPdfWithManifest/u);
  assert.match(hook, /from '\.\.\/diario-pdf\.browser'/u);
  assert.doesNotMatch(modal, /from '\.\.\/diario-pdf\.browser'/u);
  assert.doesNotMatch(modal, /\b(?:build|compose)DiarioPdf/u);
  assert.match(modal, /preparePdfBlob:\s*\(\) => Promise<Blob>/u);
  assert.match(modal, /void preparePdfBlob\(\)/u);
  assert.match(modal, /URL\.createObjectURL\(blob\)/u);
});
