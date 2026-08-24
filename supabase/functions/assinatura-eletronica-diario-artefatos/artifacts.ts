/* global TextDecoder */

import { buildCorsHeaders } from "../_shared/http.ts";
import {
  asRecord,
  type DiarioArtifactDependencies,
  type DiarioArtifactRequest,
  MAX_REQUEST_BYTES,
  PublicHttpError,
} from "./artifact-contracts.ts";
import { prepareOriginal } from "./artifact-original.ts";
import { finalize } from "./artifact-finalization.ts";

export * from "./artifact-contracts.ts";
export {
  reserveAndUploadFinalArtifactPair,
  uploadFinalArtifactPair,
} from "./artifact-original.ts";
export {
  asCanonicalImage,
  assertFinalParticipants,
  loadFrozenModelAsset,
} from "./artifact-participant-validation.ts";
export { normalizeFrozenSignatureGeometry } from "./artifact-signature-geometry.ts";
export {
  assertFrozenCustomWatermarksCompatible,
  assertFrozenV3InstitutionalWatermark,
  loadFrozenInstitutionalWatermark,
  resolveReceiptWatermarkSettings,
} from "./artifact-final-assets.ts";
export type { FrozenSnapshotIntegrity } from "./snapshot-integrity.ts";
export { verifyFrozenDocumentSnapshot } from "./snapshot-integrity.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const exactKeys = (
  source: Record<string, unknown>,
  allowed: readonly string[],
) =>
  Object.keys(source).length === allowed.length &&
  Object.keys(source).every((key) => allowed.includes(key));

const invalidRequest = () =>
  new PublicHttpError(
    400,
    "INVALID_REQUEST",
    "Os dados enviados para preparar o documento são inválidos.",
  );

const requiredUuid = (source: Record<string, unknown>, key: string) => {
  const value = typeof source[key] === "string"
    ? source[key].trim().toLowerCase()
    : "";
  if (!UUID_PATTERN.test(value)) throw invalidRequest();
  return value;
};

export const parseDiarioArtifactRequest = (
  value: unknown,
): DiarioArtifactRequest => {
  const source = asRecord(value);
  if (!source || !exactKeys(source, ["action", "envelopeId", "requestId"])) {
    throw invalidRequest();
  }
  if (source.action !== "PREPARE_ORIGINAL" && source.action !== "FINALIZE") {
    throw invalidRequest();
  }
  return {
    action: source.action,
    envelopeId: requiredUuid(source, "envelopeId"),
    requestId: requiredUuid(source, "requestId"),
  };
};

const readBodyBounded = async (request: Request) => {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new PublicHttpError(
      413,
      "REQUEST_BODY_TOO_LARGE",
      "A solicitação ultrapassa o limite permitido.",
    );
  }
  if (!request.body) throw invalidRequest();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel("request-body-limit");
        throw new PublicHttpError(
          413,
          "REQUEST_BODY_TOO_LARGE",
          "A solicitação ultrapassa o limite permitido.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

const bearerFromRequest = (request: Request) => {
  const match = /^Bearer\s+([^\s]{1,8192})$/iu.exec(
    String(request.headers.get("authorization") || "").trim(),
  );
  return match?.[1] || "";
};

const responseHeaders = (request: Request) => ({
  ...buildCorsHeaders(request),
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
});

const jsonResponse = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });

export const publicErrorFromUnknown = (error: unknown) => {
  if (error instanceof PublicHttpError) return error;
  const record = asRecord(error);
  const internal = [record?.code, record?.message]
    .map((value) => String(value || ""))
    .join(" ")
    .toUpperCase();
  if (
    internal.includes("ASSINATURA_SESSAO_INVALIDA") ||
    internal.includes("SESSION_INVALID")
  ) {
    return new PublicHttpError(
      401,
      "SESSION_INVALID",
      "Sua sessão não é mais válida.",
    );
  }
  if (
    internal.includes("42501") || internal.includes("ACCESS_DENIED") ||
    internal.includes("NAO_AUTORIZADO") ||
    internal.includes("VINCULO_INVALIDO") ||
    internal.includes("ENVELOPE_NAO_ENCONTRADO")
  ) {
    return new PublicHttpError(
      403,
      "ACCESS_DENIED",
      "Você não pode preparar este documento.",
    );
  }
  if (internal.includes("IDEMPOTENCIA_DIVERGENTE")) {
    return new PublicHttpError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "A tentativa repetida não corresponde à operação original.",
    );
  }
  if (
    internal.includes("ESTADO_INVALIDO") || internal.includes("ORIGINAL_") ||
    internal.includes("PARTICIPANTES_") || internal.includes("EVENTOS_") ||
    internal.includes("POLITICA_NAO_HABILITADA")
  ) {
    return new PublicHttpError(
      409,
      "ARTIFACT_STATE_CONFLICT",
      "O documento ainda não está no estado permitido para esta operação.",
    );
  }
  return new PublicHttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "O serviço de documentos está temporariamente indisponível.",
  );
};

export const createDiarioArtifactHandler =
  (dependencies: DiarioArtifactDependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: buildCorsHeaders(request) });
    }
    if (request.method !== "POST") {
      return jsonResponse(request, {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." },
      }, 405);
    }
    let authenticated = false;
    let response: Response;
    try {
      const bearer = bearerFromRequest(request);
      if (!bearer) {
        throw new PublicHttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Autenticação obrigatória.",
        );
      }
      const identity = await dependencies.authenticate(bearer);
      authenticated = true;
      const contentType = String(request.headers.get("content-type") || "")
        .toLowerCase();
      if (!contentType.startsWith("application/json")) throw invalidRequest();
      let parsed: unknown;
      try {
        parsed = JSON.parse(
          new TextDecoder().decode(await readBodyBounded(request)),
        );
      } catch (error) {
        if (error instanceof PublicHttpError) throw error;
        throw invalidRequest();
      }
      const body = parseDiarioArtifactRequest(parsed);
      const result = body.action === "PREPARE_ORIGINAL"
        ? await prepareOriginal(dependencies, body, identity)
        : await finalize(dependencies, body, identity);
      response = jsonResponse(request, result);
    } catch (error) {
      const safe = publicErrorFromUnknown(error);
      response = jsonResponse(request, {
        ok: false,
        error: { code: safe.code, message: safe.message },
      }, safe.status);
    }
    if (authenticated && response.ok) {
      // O cleanup é oportunístico e sempre pós-operação. O scheduler de
      // produção usa EdgeRuntime.waitUntil; portanto download/hash/remove nunca
      // entram na latência da resposta legítima. Falhas permanecem fail-closed.
      try {
        dependencies.scheduleBackgroundTask(() =>
          dependencies.reconcileExpiredUploads().catch(() => undefined)
        );
      } catch {
        // A resposta canônica não depende de uma tarefa oportunística.
      }
    }
    return response;
  };
