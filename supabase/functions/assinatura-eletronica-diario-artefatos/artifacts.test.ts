/* global ReadableStream, TextDecoder */

import assert from "node:assert/strict";
import {
  assertFrozenCustomWatermarksCompatible,
  assertFrozenV3InstitutionalWatermark,
  createDiarioArtifactHandler,
  type DiarioArtifactDependencies,
  type FrozenSnapshotIntegrity,
  loadFrozenInstitutionalWatermark,
  MAX_REQUEST_BYTES,
  normalizeFrozenSignatureGeometry,
  parseDiarioArtifactRequest,
  reserveAndUploadFinalArtifactPair,
  verifyFrozenDocumentSnapshot,
} from "./artifacts.ts";
import { sha256Hex } from "./artifact-assets.ts";
import { ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS } from "../../../modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts";
import { createDefaultElectronicSignatureStampTemplate } from "../../../modules/shared/assinatura-eletronica/signature-stamp-template.ts";
import {
  createSnapshot,
  createSnapshotIntegrity,
  loadAssets,
} from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.test.ts";

const ENVELOPE_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const STAMP_ASSET_ID = "00000000-0000-4000-8000-000000000005";

const geometrySlots = () => [{
  role: "PROFESSOR",
  pageTarget: "LAST_PAGE",
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
  xBp: 5_000,
  yBp: 78_000,
  widthBp: 42_000,
  heightBp: 14_000,
}, {
  role: "COORDENADOR",
  pageTarget: "LAST_PAGE",
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
  xBp: 53_000,
  yBp: 78_000,
  widthBp: 42_000,
  heightBp: 14_000,
}];

const frozenGeometry = (schemaVersion: 1 | 2) => ({
  schemaVersion,
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
  assetId: STAMP_ASSET_ID,
  assetSnapshot: null,
  layout: "HORIZONTAL",
  ...(schemaVersion === 2
    ? {
      contentLayout: {
        sealScalePercent: 120,
        lineSpacingPercent: 95,
        qrScalePercent: 110,
      },
    }
    : {}),
  slots: geometrySlots(),
});

const frozenGeometryV3 = () => ({
  schemaVersion: 3,
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
  assetId: STAMP_ASSET_ID,
  assetSnapshot: {
    assetId: STAMP_ASSET_ID,
    sha256: "a".repeat(64),
    mimeType: "image/png",
    sizeBytes: 68,
    width: 1,
    height: 1,
  },
  template: createDefaultElectronicSignatureStampTemplate(),
  autoLayout: { ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS },
});

const unreachable = (): Promise<never> =>
  Promise.reject(new Error("dependência não deveria ser alcançada"));

const mockDependencies = (
  authenticate: DiarioArtifactDependencies["authenticate"] = () =>
    Promise.resolve({
      userId: "00000000-0000-4000-8000-000000000003",
      sessionId: "00000000-0000-4000-8000-000000000004",
    }),
): DiarioArtifactDependencies => ({
  validationOrigin: "https://universocc.com.br",
  authenticate,
  prepareOriginal: unreachable,
  registerOriginal: unreachable,
  startFinalization: unreachable,
  registerFinal: unreachable,
  reserveUploadIntent: unreachable,
  reconcileExpiredUploads: () => Promise.resolve(),
  scheduleBackgroundTask: () => undefined,
  artifactCheckpoint: () => Promise.resolve(),
  loadCanonicalAsset: unreachable,
  downloadPrivateObject: unreachable,
  downloadModelAsset: unreachable,
  uploadImmutable: unreachable,
});

for (
  const checkpoint of [
    "AFTER_FIRST_FINAL_UPLOAD",
    "AFTER_SECOND_FINAL_UPLOAD",
  ] as const
) {
  Deno.test(`failpoint ${checkpoint} converge no retry sem duplicar uploads`, async () => {
    const finalBytes = new TextEncoder().encode("%PDF-1.7\nfinal");
    const receiptBytes = new TextEncoder().encode("%PDF-1.7\nreceipt");
    const finalArtifact = {
      bucketId: "documentos-assinatura-eletronica",
      storagePath: `envelopes/${ENVELOPE_ID}/documento-final.pdf`,
      byteSize: finalBytes.byteLength,
      sha256: await sha256Hex(finalBytes),
    };
    const receiptArtifact = {
      bucketId: "documentos-assinatura-eletronica",
      storagePath: `envelopes/${ENVELOPE_ID}/comprovante-evidencia.pdf`,
      byteSize: receiptBytes.byteLength,
      sha256: await sha256Hex(receiptBytes),
    };
    const objects = new Map<string, Uint8Array>();
    const outcomes: string[] = [];
    let armed: typeof checkpoint | null = checkpoint;
    const dependencies = {
      reserveUploadIntent: (
        input: Parameters<
          DiarioArtifactDependencies["reserveUploadIntent"]
        >[0],
      ) => {
        outcomes.push(`RESERVE:${input.artifactClass}`);
        return Promise.resolve();
      },
      uploadImmutable: ({
        reference,
        bytes,
      }: Parameters<DiarioArtifactDependencies["uploadImmutable"]>[0]) => {
        const existing = objects.get(reference.storagePath);
        if (existing) {
          assert.deepEqual(existing, bytes);
          outcomes.push(`EXISTING:${reference.storagePath}`);
          return Promise.resolve("EXISTING_IDENTICAL" as const);
        }
        objects.set(reference.storagePath, Uint8Array.from(bytes));
        outcomes.push(`CREATED:${reference.storagePath}`);
        return Promise.resolve("CREATED" as const);
      },
      artifactCheckpoint: (current: typeof checkpoint) => {
        outcomes.push(current);
        if (armed === current) {
          armed = null;
          return Promise.reject(new Error(`FAILPOINT:${current}`));
        }
        return Promise.resolve();
      },
    };

    await assert.rejects(
      () =>
        reserveAndUploadFinalArtifactPair(dependencies, {
          envelopeId: ENVELOPE_ID,
          userId: "00000000-0000-4000-8000-000000000003",
          sessionId: "00000000-0000-4000-8000-000000000004",
          requestId: REQUEST_ID,
          finalArtifact,
          finalBytes,
          receiptArtifact,
          receiptBytes,
        }),
      new RegExp(`FAILPOINT:${checkpoint}`),
    );
    assert.equal(objects.has(finalArtifact.storagePath), true);
    assert.equal(
      objects.has(receiptArtifact.storagePath),
      checkpoint === "AFTER_SECOND_FINAL_UPLOAD",
    );

    assert.deepEqual(outcomes.slice(0, 3), [
      "RESERVE:DOCUMENTO_FINAL",
      "RESERVE:COMPROVANTE_EVIDENCIA",
      `CREATED:${finalArtifact.storagePath}`,
    ]);

    await reserveAndUploadFinalArtifactPair(dependencies, {
      envelopeId: ENVELOPE_ID,
      userId: "00000000-0000-4000-8000-000000000003",
      sessionId: "00000000-0000-4000-8000-000000000004",
      requestId: REQUEST_ID,
      finalArtifact,
      finalBytes,
      receiptArtifact,
      receiptBytes,
    });
    assert.equal(objects.size, 2);
    assert.equal(
      outcomes.filter((item) => item === `CREATED:${finalArtifact.storagePath}`)
        .length,
      1,
    );
    assert.equal(
      outcomes.filter((item) =>
        item === `CREATED:${receiptArtifact.storagePath}`
      ).length,
      1,
    );
  });
}

Deno.test("request público aceita somente action, envelopeId e requestId", () => {
  assert.deepEqual(
    parseDiarioArtifactRequest({
      action: "PREPARE_ORIGINAL",
      envelopeId: ENVELOPE_ID,
      requestId: REQUEST_ID,
    }),
    {
      action: "PREPARE_ORIGINAL",
      envelopeId: ENVELOPE_ID,
      requestId: REQUEST_ID,
    },
  );
  for (
    const forbidden of [
      { pdf: "JVBERi0=" },
      { snapshot: {} },
      { participants: [] },
      { sha256: "a".repeat(64) },
      { assetUrl: "https://evil.example/logo.png" },
    ]
  ) {
    assert.throws(() =>
      parseDiarioArtifactRequest({
        action: "PREPARE_ORIGINAL",
        envelopeId: ENVELOPE_ID,
        requestId: REQUEST_ID,
        ...forbidden,
      })
    );
  }
});

Deno.test("geometria v1 recebe defaults e v2 congela contentLayout exato", () => {
  const legacy = normalizeFrozenSignatureGeometry(frozenGeometry(1));
  assert.equal(legacy.schemaVersion, 1);
  assert.deepEqual(legacy.contentLayout, {
    sealScalePercent: 100,
    lineSpacingPercent: 100,
    qrScalePercent: 100,
  });

  const current = normalizeFrozenSignatureGeometry(frozenGeometry(2));
  assert.equal(current.schemaVersion, 2);
  assert.deepEqual(current.contentLayout, {
    sealScalePercent: 120,
    lineSpacingPercent: 95,
    qrScalePercent: 110,
  });
});

Deno.test("geometria v2 rejeita chave extra, passo inválido e sobreposição", () => {
  assert.throws(() =>
    normalizeFrozenSignatureGeometry({
      ...frozenGeometry(2),
      browserHint: true,
    })
  );
  const invalidStep = {
    ...frozenGeometry(2),
    contentLayout: {
      sealScalePercent: 101,
      lineSpacingPercent: 100,
      qrScalePercent: 100,
    },
  };
  assert.throws(() => normalizeFrozenSignatureGeometry(invalidStep));

  const overlap = frozenGeometry(2);
  overlap.slots[1].xBp = 20_000;
  assert.throws(() => normalizeFrozenSignatureGeometry(overlap));
});

Deno.test("geometria v3 congela um template global e distribuição neutra", () => {
  const current = normalizeFrozenSignatureGeometry(frozenGeometryV3());
  assert.equal(current.schemaVersion, 3);
  assert.equal(current.layout, null);
  assert.equal(current.contentLayout, null);
  assert.equal(current.template?.coordinateSpace, "STAMP_TOP_LEFT_BP_V1");
  assert.deepEqual(
    current.template?.elements.map(({ id, binding }) => ({ id, binding })),
    createDefaultElectronicSignatureStampTemplate().elements.map(
      ({ id, binding }) => ({ id, binding }),
    ),
  );
  assert.equal(current.slots, null);
  assert.deepEqual(
    current.autoLayout,
    ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
  );
});

Deno.test("geometria v3 rejeita papel, label livre e distribuição adulterada", () => {
  const roleLeak = {
    ...frozenGeometryV3(),
    role: "PROFESSOR",
  };
  assert.throws(() => normalizeFrozenSignatureGeometry(roleLeak));

  const arbitraryLabel = globalThis.structuredClone(frozenGeometryV3()) as unknown as
    & Record<string, unknown>
    & {
      template: { elements: Array<{ style: Record<string, unknown> }> };
    };
  arbitraryLabel.template.elements[3].style.label = "Nome livre: ";
  assert.throws(() => normalizeFrozenSignatureGeometry(arbitraryLabel));

  const changedLayout = {
    ...frozenGeometryV3(),
    autoLayout: {
      ...ELECTRONIC_SIGNATURE_STAMP_AUTO_LAYOUT_DEFAULTS,
      maxSigners: 3,
    },
  };
  assert.throws(() => normalizeFrozenSignatureGeometry(changedLayout));
});

Deno.test("editor v4 rejeita marca custom e leitura v1 apenas a valida", () => {
  const historicalReference = {
    page: 1 as const,
    assetId: STAMP_ASSET_ID,
    bucketId: "assinatura-eletronica-modelo-assets",
    storagePath: `global/${STAMP_ASSET_ID}.png`,
    mimeType: "image/png" as const,
    byteSize: 68,
    width: 1,
    height: 1,
    sha256: "a".repeat(64),
  };
  assert.doesNotThrow(() =>
    assertFrozenCustomWatermarksCompatible(1, [historicalReference])
  );
  assert.throws(
    () => assertFrozenCustomWatermarksCompatible(2, [historicalReference]),
    /não permite marca-d’água customizada/u,
  );
  assert.throws(
    () => assertFrozenCustomWatermarksCompatible(3, [historicalReference]),
    /não permite marca-d’água customizada/u,
  );
});

Deno.test("marca institucional do comprovante usa bytes exatos do manifesto", async () => {
  const pngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(
    atob(pngDataUrl.split(",")[1]),
    (character) => character.charCodeAt(0),
  );
  const snapshot = createSnapshot();
  snapshot.assetSources.watermarkUrl = pngDataUrl;
  snapshot.institutionalIdentity.watermarkUrl = pngDataUrl;
  const manifest = {
    schemaVersion: 1 as const,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V1" as const,
    documentSnapshotSha256: "b".repeat(64),
    validationUrl: "https://universocc.com.br/validador?code=DIA-TESTE",
    assets: {
      headerLogo: {
        sourceKind: "HTTPS_URL" as const,
        sourceUrl: snapshot.assetSources.headerLogoUrl,
        mimeType: "image/png" as const,
        byteSize: 1,
        width: 1,
        height: 1,
        sha256: "c".repeat(64),
      },
      watermark: {
        sourceKind: "INLINE_DATA_URI" as const,
        sourceRef: "documentSnapshot.assetSources.watermarkUrl" as const,
        mimeType: "image/png" as const,
        byteSize: bytes.byteLength,
        width: 1,
        height: 1,
        sha256: await sha256Hex(bytes),
      },
      validationQr: {
        sourceKind: "GENERATED_QR" as const,
        payload: "https://universocc.com.br/validador?code=DIA-TESTE",
        mimeType: "image/png" as const,
        byteSize: 1,
        width: 240 as const,
        height: 240 as const,
        sha256: "d".repeat(64),
      },
    },
  };
  let networkLoads = 0;
  const loaded = await loadFrozenInstitutionalWatermark(
    {
      loadCanonicalAsset: () => {
        networkLoads += 1;
        return Promise.reject(new Error("não deve buscar marca inline"));
      },
    },
    snapshot,
    manifest,
    {
      sourceKind: "INLINE_DATA_URI",
      sourceRef: "documentSnapshot.assetSources.watermarkUrl",
    },
  );
  assert.equal(networkLoads, 0);
  assert.equal(loaded?.sha256, manifest.assets.watermark.sha256);
  await assert.rejects(() =>
    loadFrozenInstitutionalWatermark(
      { loadCanonicalAsset: unreachable },
      snapshot,
      {
        ...manifest,
        assets: {
          ...manifest.assets,
          watermark: { ...manifest.assets.watermark, sha256: "e".repeat(64) },
        },
      },
      {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "documentSnapshot.assetSources.watermarkUrl",
      },
    )
  );
});

Deno.test("template global v3 exige a referência inline canônica da marca landscape", async () => {
  const pngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const snapshot = createSnapshot();
  snapshot.assetSources.watermarkUrl = pngDataUrl;
  snapshot.institutionalIdentity.watermarkUrl = pngDataUrl;

  await assert.doesNotReject(() =>
    assertFrozenV3InstitutionalWatermark(
      snapshot,
      {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "documentSnapshot.assetSources.watermarkUrl",
      },
    )
  );
  await assert.rejects(
    () =>
      assertFrozenV3InstitutionalWatermark(snapshot, {
        sourceKind: "HTTPS_URL",
        sourceUrl:
          "https://project.supabase.co/storage/v1/object/public/documentos/marca.png",
      }),
    /template global exige/u,
  );
  snapshot.assetSources.watermarkUrl = "data:image/png;base64,AAAA";
  snapshot.institutionalIdentity.watermarkUrl =
    snapshot.assetSources.watermarkUrl;
  await assert.rejects(
    () =>
      assertFrozenV3InstitutionalWatermark(snapshot, {
        sourceKind: "INLINE_DATA_URI",
        sourceRef: "documentSnapshot.assetSources.watermarkUrl",
      }),
    /assinatura binária/u,
  );
});

Deno.test("autentica antes de interpretar payload e devolve erro público mínimo", async () => {
  let authenticationCalls = 0;
  let scheduledTasks = 0;
  const dependencies = mockDependencies((bearer) => {
    authenticationCalls += 1;
    assert.equal(bearer, "token-de-teste");
    return Promise.resolve({
      userId: "00000000-0000-4000-8000-000000000003",
      sessionId: "00000000-0000-4000-8000-000000000004",
    });
  });
  dependencies.scheduleBackgroundTask = () => {
    scheduledTasks += 1;
  };
  const handler = createDiarioArtifactHandler(dependencies);
  const response = await handler(
    new Request("https://edge.example/function", {
      method: "POST",
      headers: {
        authorization: "Bearer token-de-teste",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "PREPARE_ORIGINAL",
        envelopeId: ENVELOPE_ID,
        requestId: REQUEST_ID,
        participants: [{ name: "Pessoa que não pode chegar ao backend" }],
      }),
    }),
  );
  assert.equal(authenticationCalls, 1);
  assert.equal(scheduledTasks, 0);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message: "Os dados enviados para preparar o documento são inválidos.",
    },
  });
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});

Deno.test("limita corpo por streaming sem confiar em Content-Length", async () => {
  const handler = createDiarioArtifactHandler(mockDependencies());
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const response = await handler(
    new Request("https://edge.example/function", {
      method: "POST",
      headers: {
        authorization: "Bearer token-de-teste",
        "content-type": "application/json",
      },
      body,
    }),
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "REQUEST_BODY_TOO_LARGE");
});

const proofForCanonicalJson = async (
  canonicalJson: string,
): Promise<FrozenSnapshotIntegrity> => {
  const snapshot = createSnapshot();
  return {
    ...await createSnapshotIntegrity(snapshot),
    canonicalJson,
    documentSnapshotSha256: await sha256Hex(
      new TextEncoder().encode(canonicalJson),
    ),
  };
};

Deno.test("prova canônica usa os bytes UTF-8 exatos, não JSON.stringify local", async () => {
  const snapshot = createSnapshot();
  const { schemaVersion, ...otherFields } = snapshot;
  const canonicalJson = JSON.stringify(
    { ...otherFields, schemaVersion },
    null,
    2,
  );
  assert.notEqual(canonicalJson, JSON.stringify(snapshot));
  const proof = await proofForCanonicalJson(canonicalJson);

  const verified = await verifyFrozenDocumentSnapshot(
    proof,
    proof.documentSnapshotSha256,
  );

  assert.equal(verified.schemaVersion, 2);
  assert.equal(verified.observacoes, "Sem observações.");
});

Deno.test("prova canônica rejeita alteração de um byte e hash integral divergente", async () => {
  const proof = await createSnapshotIntegrity(createSnapshot());
  const alteredByte = {
    ...proof,
    canonicalJson: proof.canonicalJson.replace(
      "Sem observações.",
      "Tem observações.",
    ),
  };

  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(alteredByte, proof.documentSnapshotSha256),
    /conteúdo canônico/u,
  );
  await assert.rejects(
    () => verifyFrozenDocumentSnapshot(proof, "9".repeat(64)),
    /diverge do envelope/u,
  );
});

Deno.test("prova canônica rejeita subhash acadêmico ou de modelo divergente", async () => {
  const proof = await createSnapshotIntegrity(createSnapshot());
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        { ...proof, academicRevisionSha256: "c".repeat(64) },
        proof.documentSnapshotSha256,
      ),
    /hashes internos/u,
  );
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        { ...proof, templateSourceSha256: "d".repeat(64) },
        proof.documentSnapshotSha256,
      ),
    /hashes internos/u,
  );
});

Deno.test("prova canônica rejeita JSON inválido e chaves extras", async () => {
  const invalidJson = await proofForCanonicalJson("{");
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        invalidJson,
        invalidJson.documentSnapshotSha256,
      ),
    /não é JSON válido/u,
  );

  const extraJson = JSON.stringify({ ...createSnapshot(), frontendHint: true });
  const extraProof = await proofForCanonicalJson(extraJson);
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        extraProof,
        extraProof.documentSnapshotSha256,
      ),
    /sobram frontendHint/u,
  );
});

Deno.test("snapshot verificado fica profundamente congelado", async () => {
  const proof = await createSnapshotIntegrity(createSnapshot());
  const verified = await verifyFrozenDocumentSnapshot(
    proof,
    proof.documentSnapshotSha256,
  );

  assert.equal(Object.isFrozen(verified), true);
  assert.equal(Object.isFrozen(verified.source), true);
  assert.equal(Object.isFrozen(verified.templateSource.raw), true);
  assert.equal(Object.isFrozen(verified.students), true);
  assert.equal(Object.isFrozen(verified.students[0]), true);
  assert.equal(Object.isFrozen(verified.attendanceMap), true);
  assert.throws(
    () => Object.assign(verified.source, { originVersion: 2 }),
    TypeError,
  );
});

Deno.test("PREPARE_ORIGINAL compõe, envia e registra o mesmo artefato congelado", async () => {
  const snapshot = createSnapshot();
  const integrity = await createSnapshotIntegrity(snapshot);
  const assets = await loadAssets();
  const uploadedArtifacts: Uint8Array[] = [];
  let registeredSha256 = "";
  let reservedSha256 = "";
  const scheduledTasks: Array<() => Promise<void>> = [];
  let reconciliationCalls = 0;

  const dependencies: DiarioArtifactDependencies = {
    ...mockDependencies(),
    prepareOriginal: () =>
      Promise.resolve({
        envelopeId: ENVELOPE_ID,
        status: "RASCUNHO",
        documentSnapshotIntegrity: integrity,
        documentSnapshotSha256: integrity.documentSnapshotSha256,
        geometrySnapshot: { schemaVersion: 1 },
        participants: [],
        policySnapshot: {},
        certificateSnapshot: {},
        originalDestination: {
          bucketId: "documentos-assinatura-eletronica",
          storagePath: `envelopes/${ENVELOPE_ID}/documento-original.pdf`,
        },
        verification: { code: snapshot.validationCode, basePath: "/validador" },
      }),
    loadCanonicalAsset: () =>
      Promise.resolve({
        bytes: assets.logo.bytes,
        mimeType: "image/png",
      }),
    reserveUploadIntent: (input) => {
      assert.equal(input.artifactClass, "DOCUMENTO_ORIGINAL");
      assert.equal(input.envelopeId, ENVELOPE_ID);
      reservedSha256 = input.artifact.sha256;
      return Promise.resolve();
    },
    uploadImmutable: ({ reference, bytes }) => {
      assert.equal(
        reference.storagePath,
        `envelopes/${ENVELOPE_ID}/documento-original.pdf`,
      );
      uploadedArtifacts.push(Uint8Array.from(bytes));
      return Promise.resolve("CREATED");
    },
    registerOriginal: (input) => {
      assert.equal(
        input.documentSnapshotSha256,
        integrity.documentSnapshotSha256,
      );
      assert.equal(
        input.pdfAssetManifestSnapshot.documentSnapshotSha256,
        integrity.documentSnapshotSha256,
      );
      assert.equal(
        input.pdfAssetManifestSnapshot.validationUrl,
        assets.validationUrl,
      );
      registeredSha256 = input.artifact.sha256;
      return Promise.resolve({ status: "AGUARDANDO_ASSINATURAS" });
    },
    reconcileExpiredUploads: () => {
      reconciliationCalls += 1;
      return Promise.resolve();
    },
    scheduleBackgroundTask: (task) => {
      scheduledTasks.push(task);
    },
  };
  const handler = createDiarioArtifactHandler(dependencies);
  const response = await handler(
    new Request("https://edge.example/function", {
      method: "POST",
      headers: {
        authorization: "Bearer token-de-teste",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "PREPARE_ORIGINAL",
        envelopeId: ENVELOPE_ID,
        requestId: REQUEST_ID,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    envelopeId: ENVELOPE_ID,
    status: "AGUARDANDO_ASSINATURAS",
  });
  const uploadedBytes = uploadedArtifacts[0];
  assert(uploadedBytes);
  assert.equal(new TextDecoder().decode(uploadedBytes.subarray(0, 4)), "%PDF");
  assert.equal(await sha256Hex(uploadedBytes), registeredSha256);
  assert.equal(reservedSha256, registeredSha256);
  assert.equal(reconciliationCalls, 0);
  assert.equal(scheduledTasks.length, 1);
  await scheduledTasks[0]();
  assert.equal(reconciliationCalls, 1);
});
