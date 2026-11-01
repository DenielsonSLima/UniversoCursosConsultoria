import { createClient } from "npm:@supabase/supabase-js@2.106.1";
import {
  requireGestorAtivo,
  requireGestorForWhatsAppRoute,
  requireGestorTab,
} from "../_shared/authz.ts";
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from "../_shared/http.ts";
import { insertWhatsAppMessage, normalizeWhatsAppPhone, phoneBelongsToAluno, upsertWhatsAppConversation } from "../_shared/whatsapp.ts";
import { getWhatsAppMetaContext } from "../_shared/whatsapp-connection.ts";
import { requireTranscriptionApproval, transcribeApprovedAudio, TranscriptionError } from "./transcription.ts";

type MediaKind = "image" | "audio" | "document";
type MediaFile = { base64?: string; type?: string; name?: string };

const trim = (value: unknown) => String(value || "").trim();
const allowedKinds = new Set(["image", "audio", "document"]);

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
  if (!response.ok) {
    const code = Number(payload?.error?.code || 0);
    const message = trim(payload?.error?.message);
    if (
      code === 190 ||
      /authentication error|access token|token.*expir/i.test(message)
    ) {
      throw new Error(
        "O token temporário da Meta expirou ou foi invalidado. Gere um novo token no painel da Meta e salve-o em Configurações > WhatsApp.",
      );
    }
    throw new Error(message || "Falha na Meta Cloud API.");
  }
  return payload;
};

const createAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Ambiente Supabase incompleto para midias WhatsApp.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

const getContext = getWhatsAppMetaContext;

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
  requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");
  const connectionId = trim(body.conexaoId || body.connectionId);
  if (!connectionId) throw new Error("Selecione a linha que enviará a mídia.");
  const context = await getContext(admin, connectionId);
  const kind = trim(body.kind) as MediaKind;
  if (!allowedKinds.has(kind)) throw new Error("Tipo de midia invalido.");

  const conversationId = trim(body.conversaId || body.conversationId);
  let alunoId = trim(body.alunoId);
  let to = normalizeWhatsAppPhone(body.to);
  let currentConversation: any | null = null;
  if (conversationId) {
    const { data, error } = await admin
      .from("whatsapp_conversas")
      .select(
        "id,conexao_id,telefone,aluno_id,contato_nome,setor,polo_id,status_atendimento,data_inicio_atendimento",
      )
      .eq("id", conversationId)
      .eq("conexao_id", connectionId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Conversa nao encontrada nesta linha.");
    currentConversation = data;
    to = normalizeWhatsAppPhone(data.telefone);
    alunoId = trim(data.aluno_id || alunoId);
  }
  if (!to) throw new Error("Telefone/WhatsApp invalido.");
  if (!conversationId && !alunoId) {
    throw new Error("Aluno obrigatorio para iniciar um novo envio de midia.");
  }

  let aluno: any | null = null;
  if (alunoId) {
    const { data, error } = await admin
      .from("parceiros")
      .select("id,nome,tipo,telefone,polo_id")
      .eq("id", alunoId)
      .eq("tipo", "Aluno")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Aluno nao encontrado.");
    aluno = data;
    if (!conversationId) {
      const allowedPhone = await phoneBelongsToAluno(admin, aluno.id, to);
      if (!allowedPhone) {
        throw new Error(
          "Telefone informado nao pertence ao aluno nem ao responsavel financeiro cadastrado na ficha.",
        );
      }
    }
  }
  if (!currentConversation) {
    const { data, error } = await admin
      .from("whatsapp_conversas")
      .select(
        "id,conexao_id,telefone,aluno_id,contato_nome,setor,polo_id,status_atendimento,data_inicio_atendimento",
      )
      .eq("conexao_id", connectionId)
      .eq("telefone", to)
      .maybeSingle();
    if (error) throw error;
    currentConversation = data;
  }
  requireGestorForWhatsAppRoute(
    gestor,
    currentConversation?.setor || "atendimento_geral",
    currentConversation?.polo_id || aluno?.polo_id || null,
  );

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
  const conversation = await upsertWhatsAppConversation(admin, {
    connectionId,
    phone: to,
    aluno,
    contactName: currentConversation?.contato_nome || aluno?.nome || to,
    lastText: content,
    direction: "saida",
  });
  await insertWhatsAppMessage(admin, {
    conversaId: conversation.id,
    alunoId: aluno?.id || conversation.aluno_id || null,
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

  if (
    ["bot_triagem", "pendente_setor"].includes(
      trim(currentConversation?.status_atendimento),
    )
  ) {
    const startedAt = new Date().toISOString();
    const { error: assignmentError } = await admin
      .from("whatsapp_conversas")
      .update({
        atendente_id: gestor.id,
        status_atendimento: "em_atendimento",
        data_inicio_atendimento:
          currentConversation?.data_inicio_atendimento || startedAt,
        updated_at: startedAt,
      })
      .eq("id", conversation.id);
    if (assignmentError) throw assignmentError;
    const { error: pauseFlowError } = await admin
      .from("whatsapp_flow_sessions")
      .update({
        status: "handoff",
        handoff_required: true,
        updated_at: startedAt,
      })
      .eq("conversa_id", conversation.id);
    if (pauseFlowError) throw pauseFlowError;
  }

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
    .select("id,message_type,raw_payload,whatsapp_conversas!inner(conexao_id,setor,polo_id)")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mensagem nao encontrada.");
  return data;
};

Deno.serve(async (req: Request) => {
  let transcribing = false;
  const respondJson = (body: unknown, status = 200) => json(body, status, req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);
  if (isRateLimitExceeded(`whatsapp-media:${getClientIp(req)}`, 60, 60000)) {
    return respondJson({ error: "Muitas operacoes de midia em curto periodo. Aguarde instantes." }, 429);
  }

  try {
    const admin = createAdmin();
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");
    const body = await req.json();
    const action = trim(body.action);
    transcribing = action === "transcribe";
    if (action === "send") return respondJson(await sendMedia(admin, req, body));
    if (action === "transcribe") {
      // Fecha antes de ler a mensagem, a conexão ou baixar qualquer áudio.
      requireTranscriptionApproval((name) => Deno.env.get(name), body);
    }

    const message = await getMessage(admin, trim(body.messageId));
    const conversation = Array.isArray(message.whatsapp_conversas)
      ? message.whatsapp_conversas[0]
      : message.whatsapp_conversas;
    const connectionId = trim(
      conversation?.conexao_id || body.conexaoId || body.connectionId,
    );
    if (!connectionId) throw new Error("Mensagem sem linha WhatsApp vinculada.");
    requireGestorForWhatsAppRoute(
      gestor,
      conversation?.setor,
      conversation?.polo_id,
    );
    const context = await getContext(admin, connectionId);
    if (action === "download") {
      const { bytes: _bytes, ...media } = await downloadMedia(context, mediaIdFromMessage(message));
      return respondJson({ ok: true, media });
    }
    if (action === "transcribe") {
      const transcription = await transcribeApprovedAudio({
        messageType: message.message_type,
        readEnvironment: (name) => Deno.env.get(name),
        acknowledgement: body,
        download: () => downloadMedia(context, mediaIdFromMessage(message)),
      });
      return respondJson({ ok: true, transcription });
    }
    return respondJson({ error: "Acao invalida." }, 400);
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return respondJson({ error: error.message, code: error.code }, error.status);
    }
    if (transcribing) {
      // Inclui falhas de consulta/credencial anteriores ao download; não ecoa
      // mensagens do banco, da Meta ou conteúdo do áudio em resposta/log.
      return respondJson({ error: "Não foi possível transcrever este áudio agora. Tente novamente mais tarde.", code: "transcription_failed" }, 502);
    }
    console.error("whatsapp-media error:", error);
    return respondJson({ error: error instanceof Error ? error.message : "Erro inesperado em midia WhatsApp." }, 400);
  }
});
