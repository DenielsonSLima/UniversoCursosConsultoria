/* global ImageBitmap, TextDecoder, createImageBitmap */

import { createClient } from "npm:@supabase/supabase-js@2.106.1";
import { bearerTokenFromRequest } from "../_shared/authz.ts";
import { buildCorsHeaders, json } from "../_shared/http.ts";

export const SIGNATURE_MODEL_ASSET_BUCKET =
  "assinatura-eletronica-modelo-assets";
export const MAX_PNG_BYTES = 1024 * 1024;
export const MAX_PNG_SIDE = 4096;
export const MAX_PNG_PIXELS = 12_000_000;
export const PREVIEW_EXPIRES_IN_SECONDS = 300;
export const MAX_MULTIPART_BYTES = 1_200_000;
export const MAX_JSON_BODY_BYTES = 16 * 1024;

type ValidatedPng = {
  bytes: Uint8Array;
  mimeType: "image/png";
  width: number;
  height: number;
};

type PublicAssetMetadata = {
  assetId: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

type CleanupCandidate = {
  kind: "ASSET" | "ORPHAN_OBJECT";
  assetId: string;
  bucketId: typeof SIGNATURE_MODEL_ASSET_BUCKET;
  storagePath: string;
};

type StorageCoordinates = PublicAssetMetadata & {
  bucketId: typeof SIGNATURE_MODEL_ASSET_BUCKET;
  storagePath: string;
};

type AssetAdminClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  storage: {
    from: (bucketId: string) => {
      remove: (
        paths: string[],
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

export type AssetReconciliationReport = {
  expiredReservations: number;
  markedAssets: number;
  claimed: number;
  cleaned: number;
  failed: number;
};

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Corpo da requisicao maior que o limite permitido.");
    this.name = "RequestBodyTooLargeError";
  }
}

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const allowedStaticPngChunks = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
]);
const animatedPngChunks = new Set(["acTL", "fcTL", "fdAT"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

export const readBodyBounded = async (
  request: Request,
  maximumBytes: number,
) => {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("request-body-limit");
        throw new RequestBodyTooLargeError();
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return concatBytes(parts);
};

const readUint32 = (bytes: Uint8Array, offset: number) => (
  ((bytes[offset] << 24) >>> 0) +
  (bytes[offset + 1] << 16) +
  (bytes[offset + 2] << 8) +
  bytes[offset + 3]
);

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const assertDimensions = (width: number, height: number) => {
  if (
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 ||
    width > MAX_PNG_SIDE || height > MAX_PNG_SIDE ||
    width * height > MAX_PNG_PIXELS
  ) {
    throw new Error("Dimensoes do PNG fora do limite permitido.");
  }
};

export const sanitizePng = (input: Uint8Array): ValidatedPng => {
  if (
    input.byteLength < 33 ||
    !pngSignature.every((value, index) => input[index] === value)
  ) {
    throw new Error("O arquivo nao e um PNG valido.");
  }

  const parts: Uint8Array[] = [input.slice(0, 8)];
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;

  while (offset + 12 <= input.byteLength) {
    const length = readUint32(input, offset);
    const type = ascii(input, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > input.byteLength) throw new Error("PNG truncado ou corrompido.");

    const expectedCrc = readUint32(input, end - 4);
    const actualCrc = crc32(input.subarray(offset + 4, end - 4));
    if (actualCrc !== expectedCrc) {
      throw new Error("PNG corrompido: checksum invalido.");
    }
    if (animatedPngChunks.has(type)) {
      throw new Error("PNG animado nao e permitido como marca-d'agua.");
    }
    if (
      !allowedStaticPngChunks.has(type) && type[0] === type[0].toUpperCase()
    ) {
      throw new Error("PNG contem um bloco critico desconhecido.");
    }

    if (type === "IHDR") {
      if (sawHeader || length !== 13 || offset !== 8) {
        throw new Error("Cabecalho PNG invalido.");
      }
      width = readUint32(input, offset + 8);
      height = readUint32(input, offset + 12);
      sawHeader = true;
    }
    if (type === "IDAT") {
      if (!sawHeader || length === 0) throw new Error("Dados PNG invalidos.");
      sawImageData = true;
    }

    // A saída é canônica: somente blocos necessários para renderização
    // estática sobrevivem. Metadados e chunks privados/ancilares são removidos.
    if (allowedStaticPngChunks.has(type)) parts.push(input.slice(offset, end));
    offset = end;
    if (type === "IEND") {
      if (length !== 0) throw new Error("Final PNG invalido.");
      sawEnd = true;
      break;
    }
  }

  if (!sawHeader || !sawImageData || !sawEnd || offset !== input.byteLength) {
    throw new Error("Estrutura PNG invalida.");
  }
  assertDimensions(width, height);
  const bytes = concatBytes(parts);
  if (bytes.byteLength > MAX_PNG_BYTES) {
    throw new Error("PNG maior que 1 MiB.");
  }
  return { bytes, mimeType: "image/png", width, height };
};

const assertPngDecodes = async (image: ValidatedPng) => {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(
      new Blob([image.bytes.slice().buffer], { type: image.mimeType }),
    );
    if (bitmap.width !== image.width || bitmap.height !== image.height) {
      throw new Error("Dimensoes decodificadas nao conferem.");
    }
  } catch {
    throw new Error("O PNG esta corrompido ou nao pode ser decodificado.");
  } finally {
    bitmap?.close();
  }
};

export const validateAndSanitizePng = async (input: Uint8Array) => {
  if (input.byteLength < 1) throw new Error("Selecione um PNG valido.");
  if (input.byteLength > MAX_PNG_BYTES) {
    throw new Error("PNG maior que 1 MiB.");
  }
  const validated = sanitizePng(input);
  await assertPngDecodes(validated);
  return validated;
};

export const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readString = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "string" ? String(record[key]) : "";

const readNumber = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "number" && Number.isFinite(record[key])
    ? Number(record[key])
    : Number.NaN;

export const publicMetadata = (value: unknown): PublicAssetMetadata => {
  const record = asRecord(value);
  if (!record) throw new Error("Metadados de asset invalidos.");
  const assetId = readString(record, "id") || readString(record, "assetId");
  const mimeType = readString(record, "mimeType");
  const byteSize = Number.isFinite(readNumber(record, "sizeBytes"))
    ? readNumber(record, "sizeBytes")
    : readNumber(record, "byteSize");
  const width = readNumber(record, "width");
  const height = readNumber(record, "height");
  const sha256 = readString(record, "sha256");
  if (
    !uuidPattern.test(assetId) || mimeType !== "image/png" ||
    !Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_PNG_BYTES ||
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 ||
    width > MAX_PNG_SIDE || height > MAX_PNG_SIDE ||
    width * height > MAX_PNG_PIXELS ||
    !/^[0-9a-f]{64}$/.test(sha256)
  ) {
    throw new Error("Metadados de asset invalidos.");
  }
  return { assetId, mimeType, byteSize, width, height, sha256 };
};

const storageCoordinates = (value: unknown): StorageCoordinates => {
  const record = asRecord(value);
  if (!record) throw new Error("Coordenadas privadas do asset invalidas.");
  const asset = publicMetadata(record);
  const bucketId = readString(record, "bucketId");
  const storagePath = readString(record, "storagePath");
  if (
    bucketId !== SIGNATURE_MODEL_ASSET_BUCKET ||
    storagePath !== `global/${asset.assetId}.png`
  ) {
    throw new Error("Coordenadas privadas do asset invalidas.");
  }
  return {
    ...asset,
    bucketId: SIGNATURE_MODEL_ASSET_BUCKET,
    storagePath,
  };
};

const cleanupCandidate = (value: unknown): CleanupCandidate => {
  const record = asRecord(value);
  if (!record) throw new Error("Candidato de limpeza invalido.");
  const kind = readString(record, "kind");
  const assetId = readString(record, "assetId");
  const bucketId = readString(record, "bucketId");
  const storagePath = readString(record, "storagePath");
  if (
    (kind !== "ASSET" && kind !== "ORPHAN_OBJECT") ||
    !uuidPattern.test(assetId) ||
    bucketId !== SIGNATURE_MODEL_ASSET_BUCKET ||
    storagePath !== `global/${assetId}.png`
  ) {
    throw new Error("Candidato de limpeza invalido.");
  }
  return {
    kind,
    assetId,
    bucketId: SIGNATURE_MODEL_ASSET_BUCKET,
    storagePath,
  };
};

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : Number.NaN;

export const reconcileModelAssets = async (
  admin: AssetAdminClient,
  limit = 5,
): Promise<AssetReconciliationReport> => {
  const { data, error } = await admin.rpc(
    "assinatura_eletronica_modelo_asset_reconciliar_reivindicar",
    { p_limite: limit },
  );
  if (error) throw error;
  const result = asRecord(data);
  const expiredReservations = nonNegativeInteger(
    result?.expiredReservations,
  );
  const markedAssets = nonNegativeInteger(result?.markedAssets);
  const rawItems = result?.items;
  if (
    !Number.isInteger(expiredReservations) ||
    !Number.isInteger(markedAssets) ||
    !Array.isArray(rawItems) || rawItems.length > limit
  ) {
    throw new Error("Resposta de reconciliacao invalida.");
  }

  const candidates = rawItems.map(cleanupCandidate);
  let cleaned = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const { error: removeError } = await admin.storage
      .from(candidate.bucketId)
      .remove([candidate.storagePath]);
    if (removeError) {
      failed += 1;
      console.error(JSON.stringify({
        stage: "signature_model_asset_reconcile_remove",
        outcome: "retry_pending",
        kind: candidate.kind,
        assetId: candidate.assetId,
      }));
      continue;
    }

    if (candidate.kind === "ASSET") {
      const { error: finalizeError } = await admin.rpc(
        "assinatura_eletronica_modelo_asset_cleanup_finalizar",
        { p_asset_id: candidate.assetId },
      );
      if (finalizeError) {
        failed += 1;
        console.error(JSON.stringify({
          stage: "signature_model_asset_reconcile_finalize",
          outcome: "retry_pending",
          kind: candidate.kind,
          assetId: candidate.assetId,
        }));
        continue;
      }
    }
    cleaned += 1;
  }

  return {
    expiredReservations,
    markedAssets,
    claimed: candidates.length,
    cleaned,
    failed,
  };
};

const removeStorageObject = async (
  admin: AssetAdminClient,
  bucketId: typeof SIGNATURE_MODEL_ASSET_BUCKET,
  storagePath: string,
) => {
  const { error } = await admin.storage.from(bucketId).remove([storagePath]);
  if (error) throw error;
};

const cleanupTrackedAsset = async (
  admin: AssetAdminClient,
  assetId: string,
) => {
  const { data, error } = await admin.rpc(
    "assinatura_eletronica_modelo_asset_cleanup_resolver_storage",
    { p_asset_id: assetId },
  );
  if (error || !data) {
    throw error || new Error("Falha ao resolver o asset para limpeza.");
  }
  const coordinates = storageCoordinates(data);
  await removeStorageObject(
    admin,
    coordinates.bucketId,
    coordinates.storagePath,
  );
  const { error: finalizeError } = await admin.rpc(
    "assinatura_eletronica_modelo_asset_cleanup_finalizar",
    { p_asset_id: assetId },
  );
  if (finalizeError) throw finalizeError;
};

const authorizeTrackedCleanup = async (
  admin: AssetAdminClient,
  assetId: string,
) => {
  const { error } = await admin.rpc(
    "assinatura_eletronica_modelo_asset_cleanup_autorizar",
    { p_asset_id: assetId },
  );
  if (error) throw error;
};

const isRpcError = (error: unknown, pattern: RegExp) => {
  const record = asRecord(error);
  return pattern.test(
    [readString(record || {}, "message"), readString(record || {}, "code")]
      .join(" "),
  );
};

export const handleRequest = async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json({ error: "Metodo nao permitido." }, 405, request);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: "Ambiente Supabase incompleto." }, 500, request);
  }

  const bearer = bearerTokenFromRequest(request);
  if (!bearer) {
    return json({ error: "Autenticacao obrigatoria." }, 401, request);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(
      bearer,
    );
    if (authError || !authData.user) {
      return json({ error: "Sessao invalida." }, 401, request);
    }

    // A autorização de negócio ocorre antes de qualquer leitura/parse do
    // corpo, inclusive para multipart sem Content-Length confiável.
    const { data: accessAllowed, error: accessError } = await userClient.rpc(
      "assinatura_eletronica_modelo_asset_autorizar_acesso",
    );
    if (accessError || accessAllowed !== true) {
      return json(
        { error: "Acesso nao autorizado para a marca-d'agua personalizada." },
        403,
        request,
      );
    }

    let opportunisticReconciliation: AssetReconciliationReport | null = null;
    try {
      opportunisticReconciliation = await reconcileModelAssets(admin, 5);
      if (opportunisticReconciliation.failed > 0) {
        console.error(JSON.stringify({
          stage: "signature_model_asset_reconcile",
          outcome: "retry_pending",
          failed: opportunisticReconciliation.failed,
        }));
      }
    } catch {
      // A manutenção é repetida na próxima chamada. A falha é observável, mas
      // não indisponibiliza edição/upload de um gestor autorizado.
      console.error(JSON.stringify({
        stage: "signature_model_asset_reconcile_claim",
        outcome: "retry_pending",
      }));
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
      const boundedBody = await readBodyBounded(request, MAX_MULTIPART_BYTES);
      const boundedHeaders = new Headers(request.headers);
      boundedHeaders.delete("content-length");
      boundedHeaders.delete("transfer-encoding");
      const boundedRequest = new Request(request.url, {
        method: "POST",
        headers: boundedHeaders,
        body: boundedBody.slice().buffer,
      });
      const form = await boundedRequest.formData();
      const action = String(form.get("action") || "upload").trim();
      const file = form.get("file");
      if (action !== "upload") {
        return json({ error: "Acao multipart invalida." }, 400, request);
      }
      if (!(file instanceof File) || file.type !== "image/png") {
        return json({ error: "Selecione um arquivo PNG." }, 400, request);
      }
      if (file.size < 1 || file.size > MAX_PNG_BYTES) {
        return json(
          { error: "O PNG deve ter entre 1 byte e 1 MiB." },
          400,
          request,
        );
      }

      const requestIdInput = String(form.get("requestId") || "").trim();
      if (requestIdInput && !uuidPattern.test(requestIdInput)) {
        return json(
          { error: "Identificador de envio invalido." },
          400,
          request,
        );
      }
      const requestId = requestIdInput || crypto.randomUUID();
      const { data: reservation, error: reservationError } = await userClient
        .rpc(
          "assinatura_eletronica_modelo_asset_reservar",
          { p_request_id: requestId },
        );
      const reservationRecord = asRecord(reservation);
      const reservationId = reservationRecord
        ? readString(reservationRecord, "reservationId")
        : "";
      if (reservationError || !uuidPattern.test(reservationId)) {
        const limited = isRpcError(
          reservationError,
          /RATE_LIMITED|QUOTA_EXCEEDED/i,
        );
        return json(
          {
            error: limited
              ? "Limite de uploads atingido. Aguarde antes de tentar novamente."
              : "Acesso nao autorizado para a marca-d'agua personalizada.",
          },
          limited ? 429 : 403,
          request,
        );
      }

      const validated = await validateAndSanitizePng(
        new Uint8Array(await file.arrayBuffer()),
      );
      const assetId = crypto.randomUUID();
      const storagePath = `global/${assetId}.png`;
      const sha256 = await sha256Hex(validated.bytes);

      const { error: uploadError } = await admin.storage
        .from(SIGNATURE_MODEL_ASSET_BUCKET)
        .upload(storagePath, validated.bytes, {
          contentType: "image/png",
          cacheControl: "31536000, immutable",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const registrationPayload = {
        p_reserva_id: reservationId,
        p_asset_id: assetId,
        p_storage_path: storagePath,
        p_mime_type: "image/png",
        p_tamanho_bytes: validated.bytes.byteLength,
        p_largura: validated.width,
        p_altura: validated.height,
        p_sha256: sha256,
      };
      let registration = await admin.rpc(
        "assinatura_eletronica_modelo_asset_registrar",
        registrationPayload,
      );
      if (registration.error || !registration.data) {
        // O primeiro retorno pode ter se perdido depois do COMMIT. A RPC é
        // idempotente para a mesma reserva e os mesmos metadados.
        registration = await admin.rpc(
          "assinatura_eletronica_modelo_asset_registrar",
          registrationPayload,
        );
      }

      let registered: unknown = registration.data;
      if (registration.error || !registered) {
        // Se ambos os retornos falharam, diferencia timeout pós-COMMIT de
        // rejeição real antes de remover o objeto recém-enviado.
        const recovery = await admin.rpc(
          "assinatura_eletronica_modelo_asset_resolver_storage",
          { p_asset_id: assetId },
        );
        if (!recovery.error && recovery.data) registered = recovery.data;
      }
      if (!registered) {
        await removeStorageObject(
          admin,
          SIGNATURE_MODEL_ASSET_BUCKET,
          storagePath,
        );
        throw registration.error ||
          new Error("Falha ao registrar a marca-d'agua.");
      }

      const metadata = publicMetadata(registered);
      if (
        metadata.assetId !== assetId ||
        metadata.mimeType !== "image/png" ||
        metadata.byteSize !== validated.bytes.byteLength ||
        metadata.width !== validated.width ||
        metadata.height !== validated.height ||
        metadata.sha256 !== sha256
      ) {
        await authorizeTrackedCleanup(admin, assetId);
        await cleanupTrackedAsset(admin, assetId);
        throw new Error("Metadados divergentes da marca-d'agua registrada.");
      }
      const { data: signed, error: signedError } = await admin.storage
        .from(SIGNATURE_MODEL_ASSET_BUCKET)
        .createSignedUrl(storagePath, PREVIEW_EXPIRES_IN_SECONDS);
      if (signedError || !signed?.signedUrl) {
        await authorizeTrackedCleanup(admin, assetId);
        await cleanupTrackedAsset(admin, assetId);
        throw signedError || new Error("Falha ao gerar a previa privada.");
      }

      return json(
        {
          ...metadata,
          signedUrl: signed.signedUrl,
          expiresIn: PREVIEW_EXPIRES_IN_SECONDS,
        },
        200,
        request,
      );
    }

    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Conteudo da requisicao invalido." }, 400, request);
    }
    const jsonBody = await readBodyBounded(request, MAX_JSON_BODY_BYTES);
    let decodedBody: unknown;
    try {
      decodedBody = JSON.parse(new TextDecoder().decode(jsonBody));
    } catch {
      return json({ error: "Conteudo da requisicao invalido." }, 400, request);
    }
    const body = asRecord(decodedBody);
    const action = body ? readString(body, "action") : "";

    if (action === "reconcile") {
      const report = await reconcileModelAssets(admin, 25);
      if (report.failed > 0) {
        return json(
          {
            error: "A reconciliacao ficou pendente e sera repetida.",
            reconciliation: report,
          },
          503,
          request,
        );
      }
      return json({ reconciliation: report }, 200, request);
    }

    const assetId = body ? readString(body, "assetId") : "";
    if (!uuidPattern.test(assetId)) {
      return json({ error: "Asset invalido." }, 400, request);
    }

    if (action === "resolve-preview") {
      const { data: authorized, error: authorizationError } = await userClient
        .rpc("assinatura_eletronica_modelo_asset_resolver", {
          p_asset_id: assetId,
        });
      if (authorizationError || !authorized) {
        return json(
          { error: "Marca-d'agua indisponivel ou nao autorizada." },
          isRpcError(authorizationError, /NOT_FOUND|P0002/i) ? 404 : 403,
          request,
        );
      }
      const publicAsset = publicMetadata(authorized);
      const { data: privateData, error: privateError } = await admin.rpc(
        "assinatura_eletronica_modelo_asset_resolver_storage",
        { p_asset_id: assetId },
      );
      if (privateError || !privateData) {
        throw privateError || new Error(
          "Falha ao resolver a marca-d'agua.",
        );
      }
      const coordinates = storageCoordinates(privateData);
      if (
        coordinates.sha256 !== publicAsset.sha256 ||
        coordinates.byteSize !== publicAsset.byteSize
      ) {
        throw new Error("Metadados divergentes da marca-d'agua.");
      }
      const { data: signed, error: signedError } = await admin.storage
        .from(coordinates.bucketId)
        .createSignedUrl(
          coordinates.storagePath,
          PREVIEW_EXPIRES_IN_SECONDS,
        );
      if (signedError || !signed?.signedUrl) {
        throw signedError || new Error("Falha ao gerar a previa privada.");
      }
      return json(
        {
          ...publicAsset,
          signedUrl: signed.signedUrl,
          expiresIn: PREVIEW_EXPIRES_IN_SECONDS,
        },
        200,
        request,
      );
    }

    if (action === "cleanup") {
      const { error: cleanupAuthorizationError } = await userClient.rpc(
        "assinatura_eletronica_modelo_asset_cleanup_autorizar",
        { p_asset_id: assetId },
      );
      if (cleanupAuthorizationError) {
        if (isRpcError(cleanupAuthorizationError, /REFERENCIADO|23503/i)) {
          return json(
            { error: "A marca-d'agua ja pertence a uma versao salva." },
            409,
            request,
          );
        }
        return json(
          { error: "Limpeza de asset nao autorizada." },
          403,
          request,
        );
      }

      try {
        await cleanupTrackedAsset(admin, assetId);
      } catch (cleanupError) {
        if (isRpcError(cleanupError, /REFERENCIADO|23503/i)) {
          return json(
            { error: "A marca-d'agua ja pertence a uma versao salva." },
            409,
            request,
          );
        }
        throw cleanupError;
      }
      return json({ assetId, cleaned: true }, 200, request);
    }

    return json({ error: "Acao invalida." }, 400, request);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Falha ao processar a marca-d'agua.";
    const status = error instanceof RequestBodyTooLargeError
      ? 413
      : /PNG|imagem|dimens|checksum|truncad|corromp|arquivo/i.test(message)
      ? 400
      : 500;
    console.error(JSON.stringify({
      stage: "signature_model_asset",
      outcome: "failed",
      message,
    }));
    return json(
      {
        error: status === 400 || status === 413
          ? message
          : "Nao foi possivel processar a marca-d'agua personalizada.",
      },
      status,
      request,
    );
  }
};

if (import.meta.main) Deno.serve(handleRequest);
