import assert from "node:assert/strict";
import {
  SIGNATURE_ARTIFACT_BUCKET,
  SIGNATURE_MODEL_ASSET_BUCKET,
} from "./artifacts.ts";
import {
  CLAIM_ORPHAN_UPLOADS_RPC,
  COMPLETE_ORPHAN_CLEANUP_RPC,
  normalizeFinalizationPreflight,
  PREPARE_ORIGINAL_RPC,
  REGISTER_FINAL_RPC,
  REGISTER_ORIGINAL_RPC,
  REPORT_ORPHAN_CLEANUP_RPC,
  RESERVE_UPLOAD_RPC,
  START_FINALIZATION_RPC,
  VALIDATE_ORPHAN_CLAIM_RPC,
} from "./supabase-adapter.ts";

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

Deno.test("normaliza o preflight v6 com a marca portrait separada", () => {
  const input = validFinalPreflight();
  Object.assign(input, {
    receiptWatermarkSnapshot: {
      schemaVersion: 1,
      source: "POLO_PORTRAIT_WATERMARK_V1",
      poloId: UUIDS[6],
      url:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      opacity: 0.2,
      scale: 55,
      rotate: false,
    },
  });
  input.receiptAssetReferences.institutionalWatermark = {
    sourceKind: "INLINE_DATA_URI",
    sourceRef: "receiptWatermarkSnapshot.url",
  } as unknown as null;
  const result = normalizeFinalizationPreflight(input);
  assert.equal(result.receiptWatermarkSnapshot?.poloId, UUIDS[6]);
  assert.deepEqual(result.receiptAssetReferences.institutionalWatermark, {
    sourceKind: "INLINE_DATA_URI",
    sourceRef: "receiptWatermarkSnapshot.url",
  });
});

Deno.test("normaliza manifesto v2 com página 2 e papéis vinculados aos campos", () => {
  const input = validFinalPreflight();
  const signatureSlots = [
    {
      role: "PROFESSOR",
      fieldId: "contracapaAssinaturaProfessor",
      pageTarget: "DIARIO_BACK_COVER",
      coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
      xBp: 10_000,
      yBp: 84_000,
      widthBp: 38_000,
      heightBp: 14_000,
    },
    {
      role: "COORDENADOR",
      fieldId: "contracapaAssinaturaCoordenador",
      pageTarget: "DIARIO_BACK_COVER",
      coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
      xBp: 52_000,
      yBp: 84_000,
      widthBp: 38_000,
      heightBp: 14_000,
    },
  ];
  const manifest = {
    schemaVersion: 2,
    source: "UNIVERSO_DIARIO_PDF_V1",
    semanticTarget: "DIARIO_BACK_COVER",
    pageCount: 2,
    targetPageIndex: 1,
    backCoverPageIndex: 1,
    instructionsPageIndex: null,
    signatureSlots,
  };
  input.semanticManifestSnapshot =
    manifest as typeof input.semanticManifestSnapshot;
  input.frozenSignatureTargetSnapshot.pageCount = 2;
  input.frozenSignatureTargetSnapshot.semanticTarget = "DIARIO_BACK_COVER";
  input.frozenSignatureTargetSnapshot.targetPageIndex = 1;
  input.frozenSignatureTargetSnapshot.targetPage.pageIndex = 1;
  input.frozenSignatureTargetSnapshot.targetPage.pageNumber = 2;
  input.frozenSignatureTargetSnapshot.manifest =
    manifest as typeof input.frozenSignatureTargetSnapshot.manifest;

  const result = normalizeFinalizationPreflight(input);
  assert.equal(result.semanticManifestSnapshot.schemaVersion, 2);
  assert.equal(
    result.frozenSignatureTargetSnapshot.semanticTarget,
    "DIARIO_BACK_COVER",
  );
  assert.equal(result.semanticManifestSnapshot.targetPageIndex, 1);
  if (result.semanticManifestSnapshot.schemaVersion !== 2) {
    throw new Error("v2 esperado");
  }
  assert.deepEqual(
    result.semanticManifestSnapshot.signatureSlots.map(({ role, fieldId }) => ({
      role,
      fieldId,
    })),
    [
      { role: "PROFESSOR", fieldId: "contracapaAssinaturaProfessor" },
      { role: "COORDENADOR", fieldId: "contracapaAssinaturaCoordenador" },
    ],
  );
});

Deno.test("rejeita alvo/manifesto adulterados e método legado", () => {
  const badTarget = validFinalPreflight();
  badTarget.frozenSignatureTargetSnapshot.targetPage.pageIndex = 1;
  assert.throws(() => normalizeFinalizationPreflight(badTarget));

  const badManifest = validFinalPreflight();
  badManifest.pdfAssetManifestSnapshot.assets.validationQr.width = 241;
  assert.throws(() => normalizeFinalizationPreflight(badManifest));

  const divergentFrozenSemanticTarget = validFinalPreflight();
  divergentFrozenSemanticTarget.frozenSignatureTargetSnapshot.semanticTarget =
    "DIARIO_BACK_COVER";
  assert.throws(() =>
    normalizeFinalizationPreflight(divergentFrozenSemanticTarget)
  );

  const divergentFrozenManifest = validFinalPreflight();
  divergentFrozenManifest.frozenSignatureTargetSnapshot.manifest.pageCount = 2;
  assert.throws(() => normalizeFinalizationPreflight(divergentFrozenManifest));

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
