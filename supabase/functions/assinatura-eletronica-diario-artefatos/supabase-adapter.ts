// deno-lint-ignore no-import-prefix -- Supabase Edge exige versão reprodutível.
import { createClient } from "npm:@supabase/supabase-js@2.106.1";
import {
  type DiarioArtifactDependencies,
  SIGNATURE_ARTIFACT_BUCKET,
  SIGNATURE_MODEL_ASSET_BUCKET,
  type StorageArtifactReference,
} from "./artifact-contracts.ts";
import {
  MAX_CANONICAL_ASSET_BYTES,
  MAX_INLINE_WATERMARK_BYTES,
  parseOwnPublicStorageUrl,
  sha256Hex,
} from "./artifact-assets.ts";
import {
  authenticateBearer,
  normalizeFinalizationPreflight,
  normalizeOriginalPreflight,
} from "./supabase-adapter-normalizers.ts";
import {
  type AdminClient,
  asRecord,
  type ClientFactory,
  type DiarioArtifactRuntimeConfig,
  type OrphanUploadClaim,
  requiredInteger,
  requiredSha256,
  requiredString,
  requiredUuid,
  unavailable,
  unwrapRecord,
} from "./supabase-adapter-support.ts";

export type { DiarioArtifactRuntimeConfig } from "./supabase-adapter-support.ts";
export {
  authenticateBearer,
  normalizeFinalizationPreflight,
  normalizeOriginalPreflight,
} from "./supabase-adapter-normalizers.ts";

export const PREPARE_ORIGINAL_RPC =
  "assinatura_eletronica_internal_preparar_original_diario_seguro";
export const REGISTER_ORIGINAL_RPC =
  "assinatura_eletronica_rpc_publicar_original_diario";
export const START_FINALIZATION_RPC =
  "assinatura_eletronica_rpc_iniciar_finalizacao_diario";
export const REGISTER_FINAL_RPC =
  "assinatura_eletronica_rpc_finalizar_artefatos_diario";
export const RESERVE_UPLOAD_RPC =
  "assinatura_eletronica_internal_reservar_upload_diario";
export const CLAIM_ORPHAN_UPLOADS_RPC =
  "assinatura_eletronica_internal_claim_uploads_orfaos";
export const VALIDATE_ORPHAN_CLAIM_RPC =
  "assinatura_eletronica_internal_validar_claim_orfao";
export const COMPLETE_ORPHAN_CLEANUP_RPC =
  "assinatura_eletronica_internal_concluir_cleanup_upload";
export const REPORT_ORPHAN_CLEANUP_RPC =
  "assinatura_eletronica_internal_reportar_cleanup_upload";

const callRpc = async (
  admin: AdminClient,
  name: string,
  args: Record<string, unknown>,
) => {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
};

const normalizeOrphanUploadClaims = (value: unknown): OrphanUploadClaim[] => {
  if (!Array.isArray(value) || value.length > 50) throw unavailable();
  return value.map((item) => {
    const source = asRecord(item);
    const artifactClass = requiredString(source, "class", 32);
    if (
      artifactClass !== "DOCUMENTO_ORIGINAL" &&
      artifactClass !== "DOCUMENTO_FINAL" &&
      artifactClass !== "COMPROVANTE_EVIDENCIA"
    ) throw unavailable();
    const envelopeId = requiredUuid(source, "envelopeId");
    const storagePath = requiredString(source, "storagePath", 1024);
    const expectedPath = `envelopes/${envelopeId}/${
      artifactClass === "DOCUMENTO_ORIGINAL"
        ? "documento-original.pdf"
        : artifactClass === "DOCUMENTO_FINAL"
        ? "documento-final.pdf"
        : "comprovante-evidencia.pdf"
    }`;
    if (storagePath !== expectedPath) throw unavailable();
    const bucketId = requiredString(source, "bucketId", 100);
    if (bucketId !== SIGNATURE_ARTIFACT_BUCKET) throw unavailable();
    return {
      intentId: requiredUuid(source, "intentId"),
      leaseToken: requiredUuid(source, "leaseToken"),
      envelopeId,
      artifactClass,
      bucketId,
      storagePath,
      byteSize: requiredInteger(source, "byteSize", 1, 50 * 1024 * 1024),
      sha256: requiredSha256(source, "sha256"),
    };
  });
};

const requiredBoolean = (
  source: Record<string, unknown> | null,
  key: string,
) => {
  const value = source?.[key];
  if (typeof value !== "boolean") throw unavailable();
  return value;
};

const downloadObject = async (
  admin: AdminClient,
  reference: Pick<StorageArtifactReference, "bucketId" | "storagePath">,
  maxBytes: number,
) => {
  const { data, error } = await admin.storage.from(reference.bucketId).download(
    reference.storagePath,
  );
  if (error || !data || data.size < 1 || data.size > maxBytes) {
    throw unavailable(error);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength !== data.size) throw unavailable();
  return { bytes, mimeType: String(data.type || "").trim().toLowerCase() };
};

const isExactAllowedOrigin = (
  origin: string,
  allowed: readonly string[],
) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && !parsed.port && !parsed.username &&
      !parsed.password && parsed.pathname === "/" && !parsed.search &&
      !parsed.hash &&
      parsed.origin === origin && allowed.includes(origin);
  } catch {
    return false;
  }
};

const reportCleanupOutcome = async (
  admin: AdminClient,
  claim: OrphanUploadClaim,
  result: "FALHA_TRANSITORIA" | "HASH_DIVERGENTE",
) => {
  await callRpc(admin, REPORT_ORPHAN_CLEANUP_RPC, {
    p_intent_id: claim.intentId,
    p_lease_token: claim.leaseToken,
    p_resultado: result,
  });
};

const reconcileExpiredUploadIntents = async (
  admin: AdminClient,
): Promise<void> => {
  const claims = normalizeOrphanUploadClaims(
    await callRpc(admin, CLAIM_ORPHAN_UPLOADS_RPC, { p_limit: 1 }),
  );
  for (const claim of claims) {
    let bytes: Uint8Array;
    try {
      bytes = (await downloadObject(
        admin,
        claim,
        50 * 1024 * 1024,
      )).bytes;
    } catch {
      // O objeto pode ter desaparecido depois do claim. Nunca inferimos isso a
      // partir do erro HTTP: liberamos a lease e o banco reavalia no próximo TTL.
      await reportCleanupOutcome(
        admin,
        claim,
        "FALHA_TRANSITORIA",
      ).catch(() => undefined);
      continue;
    }
    if (
      bytes.byteLength !== claim.byteSize ||
      await sha256Hex(bytes) !== claim.sha256
    ) {
      // Um path determinístico com bytes diferentes é incidente, não órfão.
      await reportCleanupOutcome(
        admin,
        claim,
        "HASH_DIVERGENTE",
      ).catch(() => undefined);
      continue;
    }

    let validated: Record<string, unknown> | null;
    try {
      validated = unwrapRecord(
        await callRpc(admin, VALIDATE_ORPHAN_CLAIM_RPC, {
          p_intent_id: claim.intentId,
          p_lease_token: claim.leaseToken,
        }),
      );
    } catch {
      await reportCleanupOutcome(
        admin,
        claim,
        "FALHA_TRANSITORIA",
      ).catch(() => undefined);
      continue;
    }
    if (!requiredBoolean(validated, "deleteAllowed")) continue;

    const removed = await admin.storage.from(claim.bucketId).remove([
      claim.storagePath,
    ]);
    if (removed.error) {
      await reportCleanupOutcome(
        admin,
        claim,
        "FALHA_TRANSITORIA",
      ).catch(() => undefined);
      continue;
    }
    try {
      await callRpc(admin, COMPLETE_ORPHAN_CLEANUP_RPC, {
        p_intent_id: claim.intentId,
        p_lease_token: claim.leaseToken,
      });
    } catch {
      // Se a confirmação falhar depois do remove, a intenção permanece
      // fenced. Depois da quarentena, o próximo claim observa storage.objects
      // ausente e encerra a intenção sem liberar cedo o path.
    }
  }
};

export const createSupabaseDiarioArtifactDependencies = (
  config: DiarioArtifactRuntimeConfig,
  factory: ClientFactory = createClient as unknown as ClientFactory,
): DiarioArtifactDependencies => {
  if (
    !config.supabaseUrl || !config.serviceRoleKey ||
    !isExactAllowedOrigin(
      config.validationOrigin,
      config.validationAllowedOrigins,
    )
  ) throw unavailable();
  const admin = factory(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const actorArgs = (input: {
    envelopeId: string;
    userId: string;
    sessionId: string;
    requestId: string;
  }) => ({
    p_envelope_id: input.envelopeId,
    p_actor_auth_user_id: input.userId,
    p_auth_session_id: input.sessionId,
    p_request_id: input.requestId,
  });
  const scheduleBackgroundTask = (task: () => Promise<void>) => {
    const processing = task().catch(() => undefined);
    const edgeRuntime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (typeof edgeRuntime?.waitUntil === "function") {
      edgeRuntime.waitUntil(processing);
    }
    // O fallback local inicia a Promise, mas não a aguarda. Em produção a Edge
    // fornece waitUntil; em testes esta função continua injetável pelo adapter.
  };
  return {
    validationOrigin: config.validationOrigin,
    authenticate: (bearer) => authenticateBearer(admin, bearer),
    prepareOriginal: async (input) =>
      normalizeOriginalPreflight(
        await callRpc(admin, PREPARE_ORIGINAL_RPC, actorArgs(input)),
      ),
    registerOriginal: async (input) => {
      const result = unwrapRecord(
        await callRpc(admin, REGISTER_ORIGINAL_RPC, {
          p_envelope_id: input.envelopeId,
          p_actor_auth_user_id: input.userId,
          p_auth_session_id: input.sessionId,
          p_bucket_id: input.artifact.bucketId,
          p_storage_path: input.artifact.storagePath,
          p_tamanho_bytes: input.artifact.byteSize,
          p_sha256: input.artifact.sha256,
          p_document_snapshot_sha256: input.documentSnapshotSha256,
          p_pdf_asset_manifest: input.pdfAssetManifestSnapshot,
          p_semantic_manifest: input.semanticManifest,
          p_frozen_signature_target: input.frozenSignatureTarget,
          p_geometry_snapshot: input.geometrySnapshot,
          p_request_id: input.requestId,
        }),
      );
      return { status: requiredString(result, "status", 64) };
    },
    startFinalization: async (input) =>
      normalizeFinalizationPreflight(
        await callRpc(admin, START_FINALIZATION_RPC, actorArgs(input)),
      ),
    reserveUploadIntent: async (input) => {
      await callRpc(admin, RESERVE_UPLOAD_RPC, {
        p_envelope_id: input.envelopeId,
        p_actor_auth_user_id: input.userId,
        p_auth_session_id: input.sessionId,
        p_request_id: input.requestId,
        p_classe: input.artifactClass,
        p_bucket_id: input.artifact.bucketId,
        p_storage_path: input.artifact.storagePath,
        p_tamanho_bytes: input.artifact.byteSize,
        p_sha256: input.artifact.sha256,
      });
    },
    reconcileExpiredUploads: () => reconcileExpiredUploadIntents(admin),
    scheduleBackgroundTask,
    artifactCheckpoint: () => Promise.resolve(),
    registerFinal: async (input) => {
      const result = unwrapRecord(
        await callRpc(admin, REGISTER_FINAL_RPC, {
          p_envelope_id: input.envelopeId,
          p_actor_auth_user_id: input.userId,
          p_auth_session_id: input.sessionId,
          p_final_bucket_id: input.finalArtifact.bucketId,
          p_final_storage_path: input.finalArtifact.storagePath,
          p_final_tamanho_bytes: input.finalArtifact.byteSize,
          p_final_sha256: input.finalArtifact.sha256,
          p_receipt_bucket_id: input.receiptArtifact.bucketId,
          p_receipt_storage_path: input.receiptArtifact.storagePath,
          p_receipt_tamanho_bytes: input.receiptArtifact.byteSize,
          p_receipt_sha256: input.receiptArtifact.sha256,
          p_request_id: input.requestId,
        }),
      );
      return { status: requiredString(result, "status", 64) };
    },
    loadCanonicalAsset: (sourceUrl) => {
      const reference = parseOwnPublicStorageUrl(sourceUrl, config.supabaseUrl);
      return downloadObject(admin, reference, MAX_CANONICAL_ASSET_BYTES);
    },
    downloadPrivateObject: async (reference) => {
      if (
        reference.bucketId !== SIGNATURE_ARTIFACT_BUCKET ||
        !/^envelopes\/[0-9a-f-]{36}\/(?:documento-original|documento-final|comprovante-evidencia)\.pdf$/u
          .test(reference.storagePath)
      ) throw unavailable();
      return (await downloadObject(admin, reference, 50 * 1024 * 1024)).bytes;
    },
    downloadModelAsset: async (reference) => {
      if (
        reference.bucketId !== SIGNATURE_MODEL_ASSET_BUCKET ||
        reference.storagePath !== `global/${reference.assetId}.png`
      ) throw unavailable();
      return (await downloadObject(
        admin,
        reference,
        MAX_INLINE_WATERMARK_BYTES,
      )).bytes;
    },
    uploadImmutable: async ({ reference, bytes, contentType }) => {
      if (
        reference.bucketId !== SIGNATURE_ARTIFACT_BUCKET ||
        bytes.byteLength !== reference.byteSize ||
        await sha256Hex(bytes) !== reference.sha256
      ) throw unavailable();
      const bucket = admin.storage.from(reference.bucketId);
      const uploaded = await bucket.upload(reference.storagePath, bytes, {
        contentType,
        cacheControl: "0",
        upsert: false,
      });
      if (!uploaded.error) return "CREATED";
      // Convergência idempotente: conflito de criação só é aceito quando o
      // objeto privado existente possui exatamente os mesmos bytes congelados.
      const existing = await downloadObject(admin, reference, 50 * 1024 * 1024);
      if (
        existing.bytes.byteLength !== reference.byteSize ||
        await sha256Hex(existing.bytes) !== reference.sha256
      ) throw unavailable(uploaded.error);
      return "EXISTING_IDENTICAL";
    },
  };
};
