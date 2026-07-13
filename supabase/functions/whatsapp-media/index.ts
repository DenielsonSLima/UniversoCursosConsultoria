import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireGestorAtivo } from "../_shared/authz.ts";
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from "../_shared/http.ts";
import { insertWhatsAppMessage, normalizeWhatsAppPhone, upsertWhatsAppConversation } from "../_shared/whatsapp.ts";

type MediaKind = "image" | "audio" | "document";
type MediaFile = { base64?: string; type?: string; name?: string };

const trim = (value: unknown) => String(value || "").trim();
const allowedKinds = new Set(["image", "audio", "document"]);

const normalizeGraphVersion = (value: unknown) => {
  const version = trim(value) || "v23.0";
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const metaJson = async (url: string, accessToken: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Falha na Meta Cloud API.");
  return payload;
};

const createAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Ambiente Supabase incompleto para midias WhatsApp.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

const getContext = async (admin: any) => {
  const { data: config, error: configError } = await admin
    .from("mensageria_config")
    .select("wa_enabled, wa_status, wa_phone_number_id, wa_graph_version")
    .eq("tipo", "whatsapp")
    .maybeSingle();
  if (configError) throw configError;

  const { data: accessTokenSecret, error: secretError } = await admin.rpc(
    "whatsapp_get_secret",
    { p_secret_name: "whatsapp_meta_access_token" },
  );
  if (secretError) throw secretError;

  const accessToken = trim(accessTokenSecret);
  const phoneNumberId = trim(config?.wa_phone_number_id);
  if (config?.wa_enabled !== true || config?.wa_status !== "configurado" || !accessToken || !phoneNumberId) {
    throw new Error("API WhatsApp nao configurada ou token ausente.");
  }

  return { accessToken, phoneNumberId, graphVersion: normalizeGraphVersion(config?.wa_graph_version) };
};

const uploadMedia = async (
  context: Awaited<ReturnType<typeof getContext>>,
  file: MediaFile,
) => {
  const mime = trim(file.type) || "application/octet-stream";
  const bytes = decodeBase64(trim(file.base64));
  if (bytes.byteLength <= 0) throw new Error("Arquivo de midia invalido.");
  if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("Arquivo muito grande para envio pelo WhatsApp.");

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([bytes], { type: mime }), trim(file.name) || "arquivo");

  const payload = await metaJson(
    `https://graph.facebook.com/${context.graphVersion}/${context.phoneNumberId}/media`,
    context.accessToken,
    { method: "POST", body: form },
  );
  if (!payload?.id) throw new Error("A Meta nao retornou o ID da midia.");
  return String(payload.id);
};

const sendMedia = async (admin: any, req: Request, body: any) => {
  const gestor = await requireGestorAtivo(req, admin);
  const context = await getContext(admin);
  const kind = trim(body.kind) as MediaKind;
  if (!allowedKinds.has(kind)) throw new Error("Tipo de midia invalido.");

  const alunoId = trim(body.alunoId);
  const to = normalizeWhatsAppPhone(body.to);
  if (!alunoId) throw new Error("Aluno obrigatorio para envio de midia.");
  if (!to) throw new Error("Telefone/WhatsApp invalido.");

  const { data: aluno, error: alunoError } = await admin
    .from("parceiros")
    .select("id,nome,tipo,telefone")
    .eq("id", alunoId)
    .eq("tipo", "Aluno")
    .maybeSingle();
  if (alunoError) throw alunoError;
  if (!aluno) throw new Error("Aluno nao encontrado.");

  const caption = trim(body.caption);
  const file = body.file || {};
  const mediaId = await uploadMedia(context, file);
  const mediaObject: Record<string, unknown> = { id: mediaId };
  if (kind === "image" && caption) mediaObject.caption = caption;
  if (kind === "document") {
    mediaObject.filename = trim(file.name) || "documento.pdf";
    if (caption) mediaObject.caption = caption;
  }

  const metaPayload = await metaJson(
    `https://graph.facebook.com/${context.graphVersion}/${context.phoneNumberId}/messages`,
    context.accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: kind,
        [kind]: mediaObject,
      }),
    },
  );

  const content = caption || (kind === "audio" ? "[audio]" : kind === "image" ? "[imagem]" : trim(file.name) || "[documento]");
  const conversation = await upsertWhatsAppConversation(admin, { phone: to, aluno, lastText: content, direction: "saida" });
  await insertWhatsAppMessage(admin, {
    conversaId: conversation.id,
    alunoId: aluno.id,
    metaMessageId: metaPayload?.messages?.[0]?.id || null,
    direction: "saida",
    senderType: "gestor",
    senderName: gestor.email || "Gestor",
    content,
    messageType: kind,
    status: "sent",
    read: true,
    rawPayload: { type: kind, media: { id: mediaId, mime_type: trim(file.type), filename: trim(file.name), caption }, meta: metaPayload },
  });

  return { ok: true, conversaId: conversation.id, meta: metaPayload };
};

const mediaIdFromMessage = (message: any) => {
  const raw = message?.raw_payload || {};
  const type = trim(message?.message_type || raw?.type);
  return trim(raw?.[type]?.id || raw?.media?.id || raw?.media_id);
};

const downloadMedia = async (context: Awaited<ReturnType<typeof getContext>>, mediaId: string) => {
  if (!mediaId) throw new Error("Mensagem sem midia vinculada.");
  const metadata = await metaJson(`https://graph.facebook.com/${context.graphVersion}/${mediaId}`, context.accessToken);
  const response = await fetch(metadata.url, { headers: { Authorization: `Bearer ${context.accessToken}` } });
  if (!response.ok) throw new Error("Nao foi possivel baixar a midia da Meta.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    base64: btoa(binary),
    mime: metadata.mime_type || response.headers.get("content-type") || "application/octet-stream",
    filename: metadata.filename || `${mediaId}`,
    bytes,
  };
};

const getMessage = async (admin: any, messageId: string) => {
  const { data, error } = await admin
    .from("whatsapp_mensagens")
    .select("id,message_type,raw_payload")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mensagem nao encontrada.");
  return data;
};

const transcribeAudio = async (admin: any, context: Awaited<ReturnType<typeof getContext>>, message: any) => {
  if (trim(message.message_type) !== "audio") throw new Error("Apenas mensagens de audio podem ser transcritas.");
  const media = await downloadMedia(context, mediaIdFromMessage(message));
  const apiKey = trim(Deno.env.get("OPENAI_API_KEY"));
  if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada para transcricao.");

  const form = new FormData();
  form.append("model", trim(Deno.env.get("OPENAI_TRANSCRIBE_MODEL")) || "gpt-4o-mini-transcribe");
  form.append("file", new Blob([media.bytes], { type: media.mime }), media.filename || "audio.ogg");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Falha ao transcrever audio.");

  const transcription = trim(payload.text);
  await admin
    .from("whatsapp_mensagens")
    .update({ raw_payload: { ...(message.raw_payload || {}), transcription } })
    .eq("id", message.id);
  return transcription;
};

Deno.serve(async (req: Request) => {
  const respondJson = (body: unknown, status = 200) => json(body, status, req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);
  if (isRateLimitExceeded(`whatsapp-media:${getClientIp(req)}`, 60, 60000)) {
    return respondJson({ error: "Muitas operacoes de midia em curto periodo. Aguarde instantes." }, 429);
  }

  try {
    const admin = createAdmin();
    await requireGestorAtivo(req, admin);
    const body = await req.json();
    const action = trim(body.action);
    if (action === "send") return respondJson(await sendMedia(admin, req, body));

    const context = await getContext(admin);
    const message = await getMessage(admin, trim(body.messageId));
    if (action === "download") {
      const { bytes: _bytes, ...media } = await downloadMedia(context, mediaIdFromMessage(message));
      return respondJson({ ok: true, media });
    }
    if (action === "transcribe") {
      return respondJson({ ok: true, transcription: await transcribeAudio(admin, context, message) });
    }
    return respondJson({ error: "Acao invalida." }, 400);
  } catch (error) {
    console.error("whatsapp-media error:", error);
    return respondJson({ error: error instanceof Error ? error.message : "Erro inesperado em midia WhatsApp." }, 400);
  }
});
