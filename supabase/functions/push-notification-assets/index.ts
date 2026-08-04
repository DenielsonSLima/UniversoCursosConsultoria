/* global ImageBitmap, createImageBitmap */

import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerTokenFromRequest } from "../_shared/authz.ts";
import { buildCorsHeaders, json } from "../_shared/http.ts";

export const PUSH_IMAGE_BUCKET = "push-notification-images";
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGE_SIDE = 4096;
export const MAX_IMAGE_PIXELS = 12_000_000;

type ImagePurpose = "campaign" | "birthday";
type ValidatedImage = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  width: number;
  height: number;
};

const allowedPurposes = new Set<ImagePurpose>(["campaign", "birthday"]);
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const strippedPngChunks = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
const jpegSofMarkers = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

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
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
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
    !Number.isInteger(width) || !Number.isInteger(height) || width < 1 ||
    height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("Dimensoes da imagem fora do limite permitido.");
  }
};

export const sanitizePng = (input: Uint8Array): ValidatedImage => {
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

    if (type === "IHDR") {
      if (sawHeader || length !== 13 || offset !== 8) {
        throw new Error("Cabecalho PNG invalido.");
      }
      width = readUint32(input, offset + 8);
      height = readUint32(input, offset + 12);
      sawHeader = true;
    }

    if (type === "IDAT") {
      if (!sawHeader || length === 0) {
        throw new Error("Dados PNG invalidos.");
      }
      sawImageData = true;
    }

    if (!strippedPngChunks.has(type)) parts.push(input.slice(offset, end));
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
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Imagem maior que 1 MB.");
  }
  return { bytes, mimeType: "image/png", extension: "png", width, height };
};

export const sanitizeJpeg = (input: Uint8Array): ValidatedImage => {
  if (
    input.byteLength < 4 || input[0] !== 0xff || input[1] !== 0xd8 ||
    input[input.byteLength - 2] !== 0xff || input[input.byteLength - 1] !== 0xd9
  ) {
    throw new Error("O arquivo nao e um JPEG valido.");
  }

  const parts: Uint8Array[] = [input.slice(0, 2)];
  let offset = 2;
  let width = 0;
  let height = 0;

  while (offset < input.byteLength) {
    if (input[offset] !== 0xff) throw new Error("Estrutura JPEG invalida.");
    const markerStart = offset;
    while (offset < input.byteLength && input[offset] === 0xff) offset += 1;
    if (offset >= input.byteLength) throw new Error("JPEG truncado.");
    const marker = input[offset];

    if (marker === 0xd9) {
      parts.push(input.slice(markerStart));
      break;
    }
    if (marker === 0xda) {
      parts.push(input.slice(markerStart));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.slice(markerStart, offset + 1));
      offset += 1;
      continue;
    }
    if (offset + 2 >= input.byteLength) throw new Error("JPEG truncado.");

    const length = (input[offset + 1] << 8) + input[offset + 2];
    if (length < 2) throw new Error("Segmento JPEG invalido.");
    const end = offset + 1 + length;
    if (end > input.byteLength) throw new Error("JPEG truncado.");

    if (jpegSofMarkers.has(marker)) {
      if (length < 7) throw new Error("Dimensoes JPEG invalidas.");
      height = (input[offset + 4] << 8) + input[offset + 5];
      width = (input[offset + 6] << 8) + input[offset + 7];
    }

    const shouldStrip = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!shouldStrip) parts.push(input.slice(markerStart, end));
    offset = end;
  }

  assertDimensions(width, height);
  const bytes = concatBytes(parts);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Imagem maior que 1 MB.");
  }
  return { bytes, mimeType: "image/jpeg", extension: "jpg", width, height };
};

const assertImageDecodes = async (image: ValidatedImage) => {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(
      new Blob([image.bytes.slice().buffer], { type: image.mimeType }),
    );
    if (bitmap.width !== image.width || bitmap.height !== image.height) {
      throw new Error("Dimensoes decodificadas nao conferem.");
    }
  } catch {
    throw new Error("A imagem esta corrompida ou nao pode ser decodificada.");
  } finally {
    bitmap?.close();
  }
};

export const validateAndSanitizeImage = async (input: Uint8Array) => {
  if (input.byteLength < 1) throw new Error("Selecione uma imagem valida.");
  if (input.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Imagem maior que 1 MB.");
  }
  const validated = pngSignature.every((value, index) => input[index] === value)
    ? sanitizePng(input)
    : input[0] === 0xff && input[1] === 0xd8
    ? sanitizeJpeg(input)
    : null;
  if (!validated) throw new Error("Use uma imagem JPG ou PNG valida.");
  await assertImageDecodes(validated);
  return validated;
};

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const publicImageUrl = (supabaseUrl: string, objectPath: string) =>
  `${
    new URL(supabaseUrl).origin
  }/storage/v1/object/public/${PUSH_IMAGE_BUCKET}/${objectPath}`;

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

    const form = await request.formData();
    const purpose = String(form.get("purpose") || "").trim() as ImagePurpose;
    const file = form.get("file");
    if (!allowedPurposes.has(purpose)) {
      return json({ error: "Finalidade de imagem invalida." }, 400, request);
    }
    if (!(file instanceof File)) {
      return json({ error: "Selecione uma imagem JPG ou PNG." }, 400, request);
    }
    // Refuse oversized multipart parts before allocating another ArrayBuffer.
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      return json(
        { error: "A imagem deve ter entre 1 byte e 1 MB." },
        400,
        request,
      );
    }

    const { data: authorization, error: authorizationError } = await userClient
      .rpc("comunicacao_push_asset_upload_autorizar_v2", {
        p_purpose: purpose,
      });
    const reservationId = authorization &&
        typeof authorization === "object" &&
        typeof (authorization as Record<string, unknown>).reservationId ===
          "string"
      ? String((authorization as Record<string, unknown>).reservationId)
      : "";
    if (authorizationError || !reservationId) {
      const limited = /RATE_LIMITED|QUOTA_EXCEEDED/i.test(
        authorizationError?.message || "",
      );
      return json(
        {
          error: limited
            ? "Limite de imagens atingido. Aguarde antes de tentar novamente."
            : "Acesso nao autorizado para imagens de push.",
        },
        limited ? 429 : 403,
        request,
      );
    }

    const validated = await validateAndSanitizeImage(
      new Uint8Array(await file.arrayBuffer()),
    );
    const assetId = crypto.randomUUID();
    const folder = purpose === "campaign" ? "campaigns" : "birthday";
    const objectPath = `${folder}/${assetId}.${validated.extension}`;
    const sha256 = await sha256Hex(validated.bytes);

    const { error: uploadError } = await admin.storage
      .from(PUSH_IMAGE_BUCKET)
      .upload(objectPath, validated.bytes, {
        contentType: validated.mimeType,
        cacheControl: "31536000, immutable",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: registeredAsset, error: insertError } = await admin.rpc(
      "comunicacao_push_asset_upload_registrar",
      {
        p_reservation_id: reservationId,
        p_asset_id: assetId,
        p_object_path: objectPath,
        p_mime_type: validated.mimeType,
        p_size_bytes: validated.bytes.byteLength,
        p_width: validated.width,
        p_height: validated.height,
        p_sha256: sha256,
      },
    );
    if (insertError || !registeredAsset) {
      await admin.storage.from(PUSH_IMAGE_BUCKET).remove([objectPath]);
      throw insertError || new Error("Falha ao registrar a imagem enviada.");
    }

    return json(
      {
        asset: {
          id: assetId,
          purpose,
          objectPath,
          publicUrl: publicImageUrl(supabaseUrl, objectPath),
          mimeType: validated.mimeType,
          sizeBytes: validated.bytes.byteLength,
          width: validated.width,
          height: validated.height,
        },
      },
      200,
      request,
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Falha ao preparar a imagem.";
    const status =
      /maior|inval|dimens|selecione|JPG|PNG|truncad|corromp/i.test(message)
        ? 400
        : 500;
    console.error(
      JSON.stringify({
        stage: "push_asset_upload",
        outcome: "failed",
        message,
      }),
    );
    return json(
      {
        error: status === 400
          ? message
          : "Nao foi possivel armazenar a imagem de notificacao.",
      },
      status,
      request,
    );
  }
};

if (import.meta.main) Deno.serve(handleRequest);
