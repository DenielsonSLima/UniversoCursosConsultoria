/* global TextDecoder */

import assert from "node:assert/strict";
import {
  createDiarioArtifactHandler,
  type DiarioArtifactDependencies,
  type FrozenSnapshotIntegrity,
  reserveAndUploadFinalArtifactPair,
  verifyFrozenDocumentSnapshot,
} from "./artifacts.ts";
import { sha256Hex } from "./artifact-assets.ts";
import {
  createSnapshot,
  createSnapshotIntegrity,
  loadAssets,
} from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.test.ts";

const ENVELOPE_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";

const unreachable = (): Promise<never> =>
  Promise.reject(new Error("dependência não deveria ser alcançada"));

const mockDependencies = (): DiarioArtifactDependencies => ({
  validationOrigin: "https://universocc.com.br",
  authenticate: () =>
    Promise.resolve({
      userId: "00000000-0000-4000-8000-000000000003",
      sessionId: "00000000-0000-4000-8000-000000000004",
    }),
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
