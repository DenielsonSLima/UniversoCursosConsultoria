import assert from "node:assert/strict";
import {
  SIGNATURE_ARTIFACT_BUCKET,
  SIGNATURE_MODEL_ASSET_BUCKET,
} from "./artifacts.ts";
import {
  CLAIM_ORPHAN_UPLOADS_RPC,
  COMPLETE_ORPHAN_CLEANUP_RPC,
  createSupabaseDiarioArtifactDependencies,
  normalizeFinalizationPreflight,
  PREPARE_ORIGINAL_RPC,
  REGISTER_FINAL_RPC,
  REGISTER_ORIGINAL_RPC,
  REPORT_ORPHAN_CLEANUP_RPC,
  RESERVE_UPLOAD_RPC,
  START_FINALIZATION_RPC,
  VALIDATE_ORPHAN_CLAIM_RPC,
} from "./supabase-adapter.ts";
import { sha256Hex } from "./artifact-assets.ts";

const UUIDS = Array.from(
  { length: 8 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const HASH = "a".repeat(64);

Deno.test("nomes RPC do pipeline são explícitos e cabem no PostgreSQL", () => {
  const frozenRpcNames = {
    prepareOriginal:
      "assinatura_eletronica_internal_preparar_original_diario_seguro",
    registerOriginal: "assinatura_eletronica_rpc_publicar_original_diario",
    startFinalization: "assinatura_eletronica_rpc_iniciar_finalizacao_diario",
    registerFinal: "assinatura_eletronica_rpc_finalizar_artefatos_diario",
    reserveUpload: "assinatura_eletronica_internal_reservar_upload_diario",
    claimOrphans: "assinatura_eletronica_internal_claim_uploads_orfaos",
    validateOrphan: "assinatura_eletronica_internal_validar_claim_orfao",
    completeCleanup: "assinatura_eletronica_internal_concluir_cleanup_upload",
    reportCleanup: "assinatura_eletronica_internal_reportar_cleanup_upload",
  } as const;

  assert.deepEqual(
    {
      prepareOriginal: PREPARE_ORIGINAL_RPC,
      registerOriginal: REGISTER_ORIGINAL_RPC,
      startFinalization: START_FINALIZATION_RPC,
      registerFinal: REGISTER_FINAL_RPC,
      reserveUpload: RESERVE_UPLOAD_RPC,
      claimOrphans: CLAIM_ORPHAN_UPLOADS_RPC,
      validateOrphan: VALIDATE_ORPHAN_CLAIM_RPC,
      completeCleanup: COMPLETE_ORPHAN_CLEANUP_RPC,
      reportCleanup: REPORT_ORPHAN_CLEANUP_RPC,
    },
    frozenRpcNames,
  );
  for (const rpcName of Object.values(frozenRpcNames)) {
    assert.ok(
      new TextEncoder().encode(rpcName).byteLength <= 63,
      `RPC excede o limite PostgreSQL: ${rpcName}`,
    );
  }
});

const validFinalPreflight = () => ({
  envelopeId: UUIDS[0],
  status: "FINALIZANDO",
  documentSnapshotSha256: HASH,
  documentSnapshotIntegrity: {
    schemaVersion: 1,
    canonicalization: "POSTGRES_JSONB_TEXT_UTF8_V1",
    hashAlgorithm: "SHA-256",
    encoding: "UTF-8",
    canonicalJson: "{}",
    documentSnapshotSha256: HASH,
    academicRevisionSha256: "b".repeat(64),
    templateSourceSha256: "c".repeat(64),
  },
  geometrySnapshot: {},
  semanticManifestSnapshot: {
    schemaVersion: 1,
    source: "UNIVERSO_DIARIO_PDF_V1",
    semanticTarget: "DIARIO_LAST_CONTENT_PAGE",
    pageCount: 1,
    targetPageIndex: 0,
    instructionsPageIndex: null,
  },
  frozenSignatureTargetSnapshot: {
    originalSha256: "d".repeat(64),
    pageCount: 1,
    semanticTarget: "DIARIO_LAST_CONTENT_PAGE",
    manifest: {
      schemaVersion: 1,
      source: "UNIVERSO_DIARIO_PDF_V1",
      semanticTarget: "DIARIO_LAST_CONTENT_PAGE",
      pageCount: 1,
      targetPageIndex: 0,
      instructionsPageIndex: null,
    },
    targetPageIndex: 0,
    targetPage: {
      pageIndex: 0,
      pageNumber: 1,
      mediaBox: { x: 0, y: 0, width: 595, height: 842 },
      cropBox: { x: 0, y: 0, width: 595, height: 842 },
      rotationDegrees: 0,
      visibleWidth: 595,
      visibleHeight: 842,
    },
  },
  pdfAssetManifestSnapshot: {
    schemaVersion: 1,
    source: "UNIVERSO_DIARIO_PDF_ASSETS_V1",
    documentSnapshotSha256: HASH,
    validationUrl: "https://universocc.com.br/validador?code=DIA-TECNICO-TESTE",
    assets: {
      headerLogo: {
        sourceKind: "HTTPS_URL",
        sourceUrl:
          "https://project.supabase.co/storage/v1/object/public/documentos/logo.png",
        mimeType: "image/png",
        byteSize: 68,
        width: 1,
        height: 1,
        sha256: "e".repeat(64),
      },
      watermark: null,
      validationQr: {
        sourceKind: "GENERATED_QR",
        payload: "https://universocc.com.br/validador?code=DIA-TECNICO-TESTE",
        mimeType: "image/png",
        byteSize: 200,
        width: 240,
        height: 240,
        sha256: "f".repeat(64),
      },
    },
  },
  originalArtifact: {
    bucketId: SIGNATURE_ARTIFACT_BUCKET,
    storagePath: `envelopes/${UUIDS[0]}/documento-original.pdf`,
    byteSize: 100,
    sha256: "d".repeat(64),
  },
  participants: [
    {
      participantId: UUIDS[1],
      role: "PROFESSOR",
      order: 1,
      status: "ASSINADO",
      signerName: "Professor Teste",
      signerCpfMasked: "12*.***.**9-01",
      signedAt: "2026-08-19T12:00:01-03:00",
      signatureEventId: UUIDS[4],
      signatureHash: "2".repeat(64),
      verificationCode: `SIG-${UUIDS[4].toUpperCase()}`,
      verificationPath: `/validador?code=SIG-${UUIDS[4].toUpperCase()}`,
    },
    {
      participantId: UUIDS[2],
      role: "COORDENADOR",
      order: 2,
      status: "ASSINADO",
      signerName: "Coordenador Teste",
      signerCpfMasked: "***.***.***-02",
      signedAt: "2026-08-19T12:00:02-03:00",
      signatureEventId: UUIDS[5],
      signatureHash: "3".repeat(64),
      verificationCode: `SIG-${UUIDS[5].toUpperCase()}`,
      verificationPath: `/validador?code=SIG-${UUIDS[5].toUpperCase()}`,
    },
  ],
  signatureEvents: [
    {
      type: "ASSINATURA_CONCLUIDA",
      occurredAt: "2026-08-19T12:00:01-03:00",
      participantId: UUIDS[1],
      method: "SENHA_REAUTENTICADA",
      eventId: UUIDS[4],
      signatureHash: "2".repeat(64),
    },
    {
      type: "ASSINATURA_CONCLUIDA",
      occurredAt: "2026-08-19T12:00:02-03:00",
      participantId: UUIDS[2],
      method: "SENHA_REAUTENTICADA",
      eventId: UUIDS[5],
      signatureHash: "3".repeat(64),
    },
  ],
  receiptPayload: {},
  receiptAssetReferences: {
    logo: {
      sourceUrl:
        "https://project.supabase.co/storage/v1/object/public/documentos/logo.png",
    },
    institutionalWatermark: null,
    customWatermarks: [],
  },
  stampAsset: {
    assetId: UUIDS[3],
    bucketId: SIGNATURE_MODEL_ASSET_BUCKET,
    storagePath: `global/${UUIDS[3]}.png`,
    mimeType: "image/png",
    byteSize: 68,
    width: 1,
    height: 1,
    sha256: "1".repeat(64),
  },
  verification: { code: "DIA-TECNICO-TESTE", basePath: "/validador" },
});

Deno.test("normaliza manifestos e alvo congelado antes do compositor", () => {
  const result = normalizeFinalizationPreflight(validFinalPreflight());
  assert.equal(result.semanticManifestSnapshot.targetPageIndex, 0);
  assert.equal(result.frozenSignatureTargetSnapshot.targetPage.pageNumber, 1);
  assert.equal(result.pdfAssetManifestSnapshot.assets.validationQr.width, 240);
  assert.equal(result.participants[0].signerCpfMasked, "12*.***.**9-01");
  assert.equal(result.participants[1].signerCpfMasked, "***.***.***-02");
});

Deno.test("rejeita alvo/manifesto adulterados e método legado", () => {
  const badTarget = validFinalPreflight();
  badTarget.frozenSignatureTargetSnapshot.targetPage.pageIndex = 1;
  assert.throws(() => normalizeFinalizationPreflight(badTarget));

  const badManifest = validFinalPreflight();
  badManifest.pdfAssetManifestSnapshot.assets.validationQr.width = 241;
  assert.throws(() => normalizeFinalizationPreflight(badManifest));

  const legacyMethod = validFinalPreflight();
  legacyMethod.signatureEvents[0].method = "CONTA_E_PIN";
  assert.throws(() => normalizeFinalizationPreflight(legacyMethod));

  const divergentSnapshotProof = validFinalPreflight();
  divergentSnapshotProof.documentSnapshotSha256 = "9".repeat(64);
  assert.throws(() => normalizeFinalizationPreflight(divergentSnapshotProof));

  const forgedInlineReference = validFinalPreflight();
  forgedInlineReference.receiptAssetReferences.institutionalWatermark = {
    sourceKind: "INLINE_DATA_URI",
    sourceRef: "browser.payload.watermarkUrl",
  } as unknown as null;
  assert.throws(() => normalizeFinalizationPreflight(forgedInlineReference));

  const invalidMaskedCpf = validFinalPreflight();
  invalidMaskedCpf.participants[0].signerCpfMasked = "123.456.789-01";
  assert.throws(() => normalizeFinalizationPreflight(invalidMaskedCpf));

  const mismatchedSignatureEvent = validFinalPreflight();
  mismatchedSignatureEvent.signatureEvents[0].signatureHash = "4".repeat(64);
  const normalized = normalizeFinalizationPreflight(mismatchedSignatureEvent);
  assert.notEqual(
    normalized.participants[0].signatureHash,
    normalized.signatureEvents[0].signatureHash,
  );
});

Deno.test("retry de upload reutiliza somente o órfão privado byte-a-byte idêntico", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nfixture");
  const sha256 = await sha256Hex(bytes);
  let uploads = 0;
  let downloads = 0;
  let removals = 0;
  const fakeAdmin = {
    auth: {
      getClaims: () => Promise.resolve({ data: null, error: null }),
      getUser: () => Promise.resolve({ data: null, error: null }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: (_bucketId?: string) => ({
        upload: () => {
          uploads += 1;
          return Promise.resolve({ data: null, error: { code: "23505" } });
        },
        download: () => {
          downloads += 1;
          return Promise.resolve({
            data: new Blob([bytes], { type: "application/pdf" }),
            error: null,
          });
        },
        remove: () => {
          removals += 1;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    },
  };
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => fakeAdmin,
  );
  const reference = {
    bucketId: SIGNATURE_ARTIFACT_BUCKET,
    storagePath: `envelopes/${UUIDS[0]}/documento-original.pdf`,
    byteSize: bytes.byteLength,
    sha256,
  };
  assert.equal(
    await dependencies.uploadImmutable({
      reference,
      bytes,
      contentType: "application/pdf",
    }),
    "EXISTING_IDENTICAL",
  );
  assert.equal(
    await dependencies.uploadImmutable({
      reference,
      bytes,
      contentType: "application/pdf",
    }),
    "EXISTING_IDENTICAL",
  );
  assert.equal(uploads, 2);
  assert.equal(downloads, 2);
  assert.equal(removals, 0);
});

Deno.test("retry falha fechado quando o objeto órfão diverge dos bytes esperados", async () => {
  const expected = new TextEncoder().encode("%PDF-1.7\nexpected");
  const different = new TextEncoder().encode("%PDF-1.7\ndifferent");
  const expectedSha256 = await sha256Hex(expected);
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => ({
      auth: {
        getClaims: () => Promise.resolve({ data: null, error: null }),
        getUser: () => Promise.resolve({ data: null, error: null }),
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: {
        from: () => ({
          upload: () =>
            Promise.resolve({ data: null, error: { code: "23505" } }),
          download: () =>
            Promise.resolve({
              data: new Blob([different], { type: "application/pdf" }),
              error: null,
            }),
          remove: () => Promise.resolve({ data: [], error: null }),
        }),
      },
    }),
  );
  await assert.rejects(() =>
    dependencies.uploadImmutable({
      reference: {
        bucketId: SIGNATURE_ARTIFACT_BUCKET,
        storagePath: `envelopes/${UUIDS[0]}/documento-original.pdf`,
        byteSize: expected.byteLength,
        sha256: expectedSha256,
      },
      bytes: expected,
      contentType: "application/pdf",
    })
  );
});

Deno.test("reconciliador remove só após hash exato e segunda validação DB-aware", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\norphan");
  const sha256 = await sha256Hex(bytes);
  const intentId = UUIDS[4];
  const leaseToken = UUIDS[5];
  const storagePath = `envelopes/${UUIDS[0]}/documento-final.pdf`;
  const calls: string[] = [];
  const fakeAdmin = {
    auth: {
      getClaims: () => Promise.resolve({ data: null, error: null }),
      getUser: () => Promise.resolve({ data: null, error: null }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`);
      if (name === CLAIM_ORPHAN_UPLOADS_RPC) {
        assert.deepEqual(args, { p_limit: 1 });
        return Promise.resolve({
          data: [{
            intentId,
            leaseToken,
            envelopeId: UUIDS[0],
            class: "DOCUMENTO_FINAL",
            bucketId: SIGNATURE_ARTIFACT_BUCKET,
            storagePath,
            byteSize: bytes.byteLength,
            sha256,
          }],
          error: null,
        });
      }
      if (name === VALIDATE_ORPHAN_CLAIM_RPC) {
        assert.deepEqual(args, {
          p_intent_id: intentId,
          p_lease_token: leaseToken,
        });
        return Promise.resolve({
          data: { deleteAllowed: true, reason: "UNREFERENCED" },
          error: null,
        });
      }
      if (name === COMPLETE_ORPHAN_CLEANUP_RPC) {
        return Promise.resolve({ data: { state: "REMOVED" }, error: null });
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    storage: {
      from: (bucketId: string) => {
        assert.equal(bucketId, SIGNATURE_ARTIFACT_BUCKET);
        return {
          upload: () => Promise.resolve({ data: null, error: null }),
          download: (path: string) => {
            calls.push(`download:${path}`);
            return Promise.resolve({
              data: new Blob([bytes], { type: "application/pdf" }),
              error: null,
            });
          },
          remove: (paths: string[]) => {
            calls.push(`remove:${paths.join(",")}`);
            return Promise.resolve({
              data: [{ name: storagePath }],
              error: null,
            });
          },
        };
      },
    },
  };
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => fakeAdmin,
  );
  await dependencies.reconcileExpiredUploads();
  assert.deepEqual(calls, [
    `rpc:${CLAIM_ORPHAN_UPLOADS_RPC}`,
    `download:${storagePath}`,
    `rpc:${VALIDATE_ORPHAN_CLAIM_RPC}`,
    `remove:${storagePath}`,
    `rpc:${COMPLETE_ORPHAN_CLEANUP_RPC}`,
  ]);
});

Deno.test("reconciliador nunca remove path cujo conteúdo diverge da intenção", async () => {
  const expected = new TextEncoder().encode("%PDF-1.7\nexpected");
  const divergent = new TextEncoder().encode("%PDF-1.7\ndivergent");
  const storagePath = `envelopes/${UUIDS[0]}/comprovante-evidencia.pdf`;
  let removed = false;
  let reported = "";
  const dependencies = createSupabaseDiarioArtifactDependencies(
    {
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-key",
      validationOrigin: "https://universocc.com.br",
      validationAllowedOrigins: ["https://universocc.com.br"],
    },
    () => ({
      auth: {
        getClaims: () => Promise.resolve({ data: null, error: null }),
        getUser: () => Promise.resolve({ data: null, error: null }),
      },
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === CLAIM_ORPHAN_UPLOADS_RPC) {
          assert.deepEqual(args, { p_limit: 1 });
          return Promise.resolve({
            data: [{
              intentId: UUIDS[4],
              leaseToken: UUIDS[5],
              envelopeId: UUIDS[0],
              class: "COMPROVANTE_EVIDENCIA",
              bucketId: SIGNATURE_ARTIFACT_BUCKET,
              storagePath,
              byteSize: expected.byteLength,
              sha256: "9".repeat(64),
            }],
            error: null,
          });
        }
        assert.equal(name, REPORT_ORPHAN_CLEANUP_RPC);
        reported = String(args.p_resultado);
        return Promise.resolve({ data: { state: "DIVERGENT" }, error: null });
      },
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: null }),
          download: () =>
            Promise.resolve({
              data: new Blob([divergent], { type: "application/pdf" }),
              error: null,
            }),
          remove: () => {
            removed = true;
            return Promise.resolve({ data: [], error: null });
          },
        }),
      },
    }),
  );
  await dependencies.reconcileExpiredUploads();
  assert.equal(reported, "HASH_DIVERGENTE");
  assert.equal(removed, false);
});

Deno.test("scheduler preserva receiver do EdgeRuntime.waitUntil e não aguarda cleanup", async () => {
  const scope = globalThis as unknown as {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  };
  const previous = scope.EdgeRuntime;
  let retained: Promise<unknown> | null = null;
  const runtime = {
    waitUntil(this: unknown, promise: Promise<unknown>) {
      assert.equal(this, runtime);
      retained = promise;
    },
  };
  scope.EdgeRuntime = runtime;
  try {
    const dependencies = createSupabaseDiarioArtifactDependencies(
      {
        supabaseUrl: "https://project.supabase.co",
        serviceRoleKey: "test-service-key",
        validationOrigin: "https://universocc.com.br",
        validationAllowedOrigins: ["https://universocc.com.br"],
      },
      () => ({
        auth: {
          getClaims: () => Promise.resolve({ data: null, error: null }),
          getUser: () => Promise.resolve({ data: null, error: null }),
        },
        rpc: () => Promise.resolve({ data: [], error: null }),
        storage: {
          from: () => ({
            download: () =>
              Promise.resolve({ data: null, error: new Error("unused") }),
            upload: () =>
              Promise.resolve({ data: null, error: new Error("unused") }),
            remove: () =>
              Promise.resolve({ data: null, error: new Error("unused") }),
          }),
        },
      }),
    );
    let completed = false;
    dependencies.scheduleBackgroundTask(async () => {
      await Promise.resolve();
      completed = true;
    });
    assert.ok(retained);
    assert.equal(completed, false);
    await retained;
    assert.equal(completed, true);
  } finally {
    if (previous) scope.EdgeRuntime = previous;
    else delete scope.EdgeRuntime;
  }
});
