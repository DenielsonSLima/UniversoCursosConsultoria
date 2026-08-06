import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, getClientIp, json as sendJson } from "../_shared/http.ts";
import { normalizeCpf, normalizePersonName } from "../_shared/whatsapp-flow/format.ts";

type Action = "bootstrap" | "create-ticket" | "history" | "register-push" | "send-message" | "send-attachment";
type Payload = {
  action?: Action;
  turnstileToken?: string;
  challengeContext?: "web" | "native";
  accessToken?: string;
  name?: string;
  cpf?: string;
  subject?: string;
  message?: string;
  sector?: string;
  poloId?: string | null;
  poloLabel?: string | null;
  notifyReply?: boolean;
  fileName?: string;
  mimeType?: string;
  size?: number;
  fileBase64?: string;
  installationId?: string;
  platform?: "android" | "ios";
  pushToken?: string;
  permissionStatus?: "granted" | "provisional";
  requestId?: string;
};

const ALLOWED_SECTORS = new Set([
  "todos", "pedagogico_coordenacao", "financeiro", "comercial_matriculas",
  "secretaria", "atendimento_geral",
]);
const ALLOWED_HOSTS = new Set(["universocc.com.br", "www.universocc.com.br", "localhost", "127.0.0.1"]);
const NATIVE_APP_ORIGINS = new Set(["capacitor://localhost", "https://localhost"]);
const NATIVE_TURNSTILE_HOSTS = new Set([
  "universocc.com.br",
  "www.universocc.com.br",
  ...String(Deno.env.get("TURNSTILE_NATIVE_ALLOWED_HOSTNAMES") || "")
    .split(/[,\s]+/)
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean),
]);
const TOKEN_MAX_AGE_DAYS = 90;
const ATTACHMENT_BUCKET = "anexos";
const ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;
const ATTACHMENT_URL_TTL_SECONDS = 10 * 60;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav",
]);

const safeFileName = (value: string) => {
  const normalized = value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return normalized || "anexo";
};

const decodeBase64 = (value: string) => {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const randomToken = () => `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const protocol = () => {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `UNI-${date}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
};

const validOrigin = (request: Request) => {
  const rawOrigin = String(request.headers.get("origin") || "").trim();
  if (NATIVE_APP_ORIGINS.has(rawOrigin)) return true;
  try {
    const origin = new URL(rawOrigin);
    return ALLOWED_HOSTS.has(origin.hostname.toLowerCase())
      && (origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.protocol === "https:");
  } catch {
    return false;
  }
};

const verifyTurnstile = async (
  request: Request,
  token: string,
  challengeContext: "web" | "native",
) => {
  if (!validOrigin(request) || !token || token.length > 2048) return false;
  const rawOrigin = String(request.headers.get("origin") || "").trim();
  const native = challengeContext === "native";
  if (native && !NATIVE_APP_ORIGINS.has(rawOrigin)) return false;
  if (!native && NATIVE_APP_ORIGINS.has(rawOrigin)) return false;
  const hostname = new URL(rawOrigin).hostname.toLowerCase();
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const secretName = native
    ? "TURNSTILE_NATIVE_SECRET_KEY"
    : local
      ? "TURNSTILE_LOCAL_SECRET_KEY"
      : "TURNSTILE_SECRET_KEY";
  const secret = String(
    Deno.env.get(secretName) ||
      (native ? Deno.env.get("TURNSTILE_SECRET_KEY") : "") ||
      "",
  ).trim();
  if (!secret) return false;
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  form.set("remoteip", getClientIp(request));
  form.set("idempotency_key", crypto.randomUUID());
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: controller.signal });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
    const verifiedHostname = String(result.hostname || "").toLowerCase();
    const hostnameAccepted = native
      ? NATIVE_TURNSTILE_HOSTS.has(verifiedHostname)
      : verifiedHostname === hostname;
    return result.success === true && hostnameAccepted && result.action === "support";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const rateLimit = async (admin: any, bucketKey: string, limit: number) => {
  const bucketHash = await sha256(`public-support:${bucketKey}`);
  const { data, error } = await admin.rpc("consume_portal_auth_rate_limit", {
    p_bucket_key: `public-support:${bucketHash}`,
    p_limit: limit,
    p_window_seconds: 900,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.allowed === true;
};

const resolvePolo = async (admin: any, poloId?: string | null, poloLabel?: string | null) => {
  let query = admin.from("polos").select("id,nome,cidade,estado,is_matriz").eq("status", "ativo");
  if (poloId) query = query.eq("id", poloId);
  else if (poloLabel) query = query.ilike("nome", String(poloLabel).trim());
  else query = query.eq("is_matriz", true);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
};

const loadBootstrap = async (admin: any) => {
  const [polosResult, connectionResult] = await Promise.all([
    admin.from("polos").select("id,nome,cidade,estado,is_matriz").eq("status", "ativo").order("is_matriz", { ascending: false }).order("nome"),
    admin.from("whatsapp_conexoes").select("id").eq("status", "ativo").eq("is_matriz_financeira", true).limit(1).maybeSingle(),
  ]);
  if (polosResult.error) throw polosResult.error;
  let flow = null;
  if (connectionResult.data?.id) {
    const { data } = await admin.from("whatsapp_flow_settings").select("routing_config,flow_type").eq("conexao_id", connectionResult.data.id).maybeSingle();
    flow = data?.routing_config?.flow_builder || null;
  }
  const poloIds = (polosResult.data || []).map((item: any) => item.id);
  const { data: configs, error: configError } = poloIds.length
    ? await admin.from("comunicacao_atendimento_config").select("polo_id,status_modo,permite_chat_publico,permite_novo_chamado,solicitar_notificacao_resposta,tempo_medio_resposta_minutos,mensagem_online,mensagem_offline,texto_notificacao_optin,horarios").in("polo_id", poloIds)
    : { data: [], error: null };
  if (configError) throw configError;
  return { polos: polosResult.data || [], configs: configs || [], flow };
};

Deno.serve(async (request: Request) => {
  const cors = buildCorsHeaders(request);
  const json = (body: unknown, status = 200) => sendJson(body, status, request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST" || !validOrigin(request)) return json({ error: "Requisição não permitida." }, 403);

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  if (!supabaseUrl || !serviceRole) return json({ error: "Serviço temporariamente indisponível." }, 503);
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  let payload: Payload;
  try { payload = await request.json(); } catch { return json({ error: "Dados inválidos." }, 400); }
  const action = payload.action;
  if (!action || !["bootstrap", "create-ticket", "history", "register-push", "send-message", "send-attachment"].includes(action)) return json({ error: "Ação inválida." }, 400);

  try {
    const ipLimit = action === "bootstrap" ? 180 : action === "create-ticket" ? 40 : 600;
    if (!await rateLimit(admin, `ip:${action}:${getClientIp(request)}`, ipLimit)) {
      return json({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429);
    }

    if (action === "bootstrap") return json(await loadBootstrap(admin));

    if (action === "create-ticket") {
      const providedName = normalizePersonName(payload.name);
      const rawCpf = String(payload.cpf || "").trim();
      const cpf = rawCpf ? normalizeCpf(rawCpf) : "";
      const subject = String(payload.subject || "").trim().slice(0, 180);
      const message = String(payload.message || "").trim().slice(0, 4000);
      const sector = ALLOWED_SECTORS.has(String(payload.sector)) ? String(payload.sector) : "atendimento_geral";
      const requestId = String(payload.requestId || "").trim().toLowerCase();
      const requestedAccessToken = String(payload.accessToken || "").trim().toLowerCase();
      if (requestId && !UUID_PATTERN.test(requestId)) return json({ error: "Identificador da solicitação inválido." }, 400);
      if (requestedAccessToken && !ACCESS_TOKEN_PATTERN.test(requestedAccessToken)) {
        return json({ error: "Token do atendimento inválido." }, 400);
      }
      if (!providedName) return json({ error: "Informe seu nome completo, sem números ou abreviações." }, 400);
      if (rawCpf && !cpf) return json({ error: "Informe um CPF válido. Confira os 11 números e tente novamente." }, 400);
      if (subject.length < 2 || message.length < 2) return json({ error: "Informe o assunto e a mensagem do chamado." }, 400);
      const challengeContext = payload.challengeContext === "native" ? "native" : "web";
      if (!await verifyTurnstile(request, String(payload.turnstileToken || ""), challengeContext)) return json({ error: "Confirme a verificação de segurança novamente." }, 400);
      const requestedPoloId = payload.poloId || null;
      const polo = await resolvePolo(admin, requestedPoloId, payload.poloLabel);
      if (!polo) return json({ error: "Polo não encontrado." }, 400);
      const { data: config } = await admin.from("comunicacao_atendimento_config").select("permite_chat_publico,permite_novo_chamado,tempo_medio_resposta_minutos,mensagem_online,mensagem_offline,status_modo,horarios").eq("polo_id", polo.id).maybeSingle();
      if (config && (!config.permite_chat_publico || !config.permite_novo_chamado)) return json({ error: "A abertura de chamados está temporariamente indisponível para este polo." }, 409);

      // O cliente atual persiste um bearer de 256 bits antes do invoke. O
      // caminho derivado mantém compatibilidade temporária com builds que já
      // enviavam requestId sem accessToken; clientes anteriores, sem requestId,
      // continuam recebendo um token aleatório do servidor.
      const accessToken = requestedAccessToken
        || (requestId ? await sha256(`legacy-public-support-access:${requestId}`) : randomToken());
      const accessHash = await sha256(accessToken);
      const expiresAt = new Date(Date.now() + TOKEN_MAX_AGE_DAYS * 86400000).toISOString();
      const ticketProtocol = protocol();
      const requesterName = providedName;
      const requesterType = "Visitante";
      const requesterId = null;
      const { data: createdRows, error: createError } = await admin.rpc(
        "create_public_support_ticket_idempotent",
        {
          p_request_id: requestId || null,
          p_requester_id: requesterId,
          p_requester_name: requesterName,
          p_requester_type: requesterType,
          p_polo_id: polo.id,
          p_sector: sector,
          p_subject: subject,
          p_protocol: ticketProtocol,
          p_message: message,
          p_notify_reply: Boolean(payload.notifyReply),
          p_access_hash: accessHash,
          p_expires_at: expiresAt,
        },
      );
      if (createError) throw createError;
      const createdRow = Array.isArray(createdRows) ? createdRows[0] : createdRows;
      if (!createdRow || createdRow.public_access_hash !== accessHash) {
        return json({ error: "Não foi possível confirmar a abertura do atendimento." }, 409);
      }
      const chat = {
        id: createdRow.id,
        status: createdRow.status,
        protocolo: createdRow.protocolo,
        created_at: createdRow.created_at,
      };
      return json({
        chat,
        accessToken,
        polo,
        averageResponseMinutes: config?.tempo_medio_resposta_minutos || 120,
      }, createdRow.created ? 201 : 200);
    }

    const accessToken = String(payload.accessToken || "").trim();
    if (accessToken.length !== 64) return json({ error: "Atendimento não encontrado." }, 404);
    const accessHash = await sha256(accessToken);
    const { data: chat, error: chatError } = await admin.from("comunicacao_chats")
      .select("id,remetente_id,remetente_nome,status,origem,polo_id,setor,assunto,protocolo,ultima_data,created_at,primeira_resposta_em,encerrado_em,public_access_expires_at")
      .eq("public_access_hash", accessHash).eq("origem", "publico").gt("public_access_expires_at", new Date().toISOString()).maybeSingle();
    if (chatError) throw chatError;
    if (!chat) return json({ error: "Atendimento não encontrado ou expirado." }, 404);

    const accessLimits: Record<Exclude<Action, "bootstrap" | "create-ticket">, number> = {
      history: 180,
      "register-push": 60,
      "send-message": 90,
      "send-attachment": 30,
    };
    const accessAction = action as Exclude<Action, "bootstrap" | "create-ticket">;
    if (!await rateLimit(admin, `access:${accessAction}:${accessHash}`, accessLimits[accessAction])) {
      return json({ error: "Muitas tentativas neste atendimento. Aguarde alguns minutos." }, 429);
    }

    if (action === "register-push") {
      const installationId = String(payload.installationId || "").trim();
      const pushToken = String(payload.pushToken || "").trim();
      const platform = payload.platform;
      const permissionStatus = payload.permissionStatus;
      if (installationId.length < 8 || installationId.length > 255
        || pushToken.length < 8 || pushToken.length > 4096
        || !platform || !["android", "ios"].includes(platform)
        || !permissionStatus || !["granted", "provisional"].includes(permissionStatus)) {
        return json({ error: "Não foi possível registrar este aparelho para notificações." }, 400);
      }
      const { error: registrationError } = await admin.from("public_support_push_devices").upsert({
        chat_id: chat.id,
        installation_id: installationId,
        platform,
        push_token: pushToken,
        permission_status: permissionStatus,
        active: true,
        expires_at: chat.public_access_expires_at,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "chat_id,installation_id" });
      if (registrationError) throw registrationError;
      const { error: notificationError } = await admin.from("comunicacao_chats")
        .update({ notificar_resposta: true })
        .eq("id", chat.id);
      if (notificationError) throw notificationError;
      return json({ registered: true });
    }

    if (action === "send-message") {
      if (chat.status !== "pendente") return json({ error: "Este atendimento já foi encerrado. Abra um novo chamado." }, 409);
      const message = String(payload.message || "").trim().slice(0, 4000);
      if (message.length < 1) return json({ error: "Escreva uma mensagem." }, 400);
      const { error } = await admin.from("comunicacao_mensagens").insert({ chat_id: chat.id, remetente_id: null, remetente_nome: chat.remetente_nome, remetente_tipo: "aluno", conteudo: message });
      if (error) throw error;
      await admin.from("comunicacao_chats").update({ ultimo_texto: message, ultima_data: new Date().toISOString() }).eq("id", chat.id);
    }

    if (action === "send-attachment") {
      if (chat.status !== "pendente") return json({ error: "Este atendimento já foi encerrado. Abra um novo chamado." }, 409);
      const fileName = safeFileName(String(payload.fileName || ""));
      const mimeType = String(payload.mimeType || "").trim().toLowerCase();
      const declaredSize = Number(payload.size);
      const fileBase64 = String(payload.fileBase64 || "");
      const maxBase64Length = Math.ceil(ATTACHMENT_MAX_BYTES / 3) * 4 + 4;
      if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType)) return json({ error: "Este tipo de arquivo não é permitido." }, 400);
      if (!Number.isInteger(declaredSize) || declaredSize < 1 || declaredSize > ATTACHMENT_MAX_BYTES || fileBase64.length > maxBase64Length) {
        return json({ error: "O anexo deve ter no máximo 12 MB." }, 400);
      }

      let bytes: Uint8Array;
      try { bytes = decodeBase64(fileBase64); } catch { return json({ error: "O arquivo enviado é inválido." }, 400); }
      if (bytes.byteLength !== declaredSize || bytes.byteLength > ATTACHMENT_MAX_BYTES) return json({ error: "O arquivo enviado é inválido." }, 400);

      const attachmentPath = `comunicacao/chats/${chat.id}/public/${crypto.randomUUID()}-${fileName}`;
      const { error: uploadError } = await admin.storage.from(ATTACHMENT_BUCKET).upload(attachmentPath, bytes, {
        cacheControl: "3600",
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const content = mimeType.startsWith("audio/") ? "🎙️ Mensagem de voz" : `📎 ${fileName}`;
      const { error: messageError } = await admin.from("comunicacao_mensagens").insert({
        chat_id: chat.id,
        remetente_id: chat.remetente_id,
        remetente_nome: chat.remetente_nome,
        remetente_tipo: "aluno",
        conteudo: content,
        anexo_path: attachmentPath,
        anexo_url: null,
      });
      if (messageError) {
        await admin.storage.from(ATTACHMENT_BUCKET).remove([attachmentPath]);
        throw messageError;
      }
      await admin.from("comunicacao_chats").update({ ultimo_texto: content, ultima_data: new Date().toISOString() }).eq("id", chat.id);
    }

    const { data: messages, error: messagesError } = await admin.from("comunicacao_mensagens")
      .select("id,remetente_nome,remetente_tipo,conteudo,anexo_path,anexo_url,lida,created_at")
      .eq("chat_id", chat.id).order("created_at", { ascending: true });
    if (messagesError) throw messagesError;
    const attachmentPaths = [...new Set((messages || []).map((message: any) => message.anexo_path).filter(Boolean))] as string[];
    const signedUrls = new Map<string, string>();
    if (attachmentPaths.length > 0) {
      const { data: signed, error: signedError } = await admin.storage.from(ATTACHMENT_BUCKET)
        .createSignedUrls(attachmentPaths, ATTACHMENT_URL_TTL_SECONDS);
      if (signedError) console.warn("public-student-support signed attachments", signedError.message);
      (signed || []).forEach((item: any) => {
        if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
      });
    }
    return json({
      chat: { ...chat, remetente_id: undefined, remetente_nome: "Você" },
      messages: (messages || []).map((message: any) => ({
        ...message,
        remetente_nome: message.remetente_tipo === "aluno" ? "Você" : message.remetente_nome,
        anexo_url: message.anexo_path ? signedUrls.get(message.anexo_path) || null : null,
      })),
    });
  } catch (error) {
    console.error("public-student-support", action, error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível concluir o atendimento agora. Tente novamente." }, 500);
  }
});
