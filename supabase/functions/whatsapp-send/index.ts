import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireGestorAtivo, requireGestorTab } from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import {
  insertWhatsAppMessage,
  phoneBelongsToAluno,
  upsertWhatsAppConversation,
} from "../_shared/whatsapp.ts";

const normalizePhone = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
};

const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v23.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);

  if (isRateLimitExceeded(`whatsapp-send:${getClientIp(req)}`, 60, 60000)) {
    return respondJson({ error: "Muitas mensagens em curto periodo. Aguarde alguns instantes." }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({ error: "Ambiente Supabase incompleto para envio WhatsApp." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");

    const body = await req.json();
    const alunoId = String(body.alunoId || "").trim();
    const to = normalizePhone(body.to);
    const message = String(body.message || "").trim();

    if (!alunoId) throw new Error("Aluno obrigatorio para iniciar conversa WhatsApp.");
    if (!to) throw new Error("Telefone/WhatsApp do aluno invalido.");
    if (!message) throw new Error("Mensagem obrigatoria para envio WhatsApp.");
    if (message.length > 4096) throw new Error("Mensagem WhatsApp muito longa.");

    const { data: aluno, error: alunoError } = await admin
      .from("parceiros")
      .select("id, nome, tipo, telefone")
      .eq("id", alunoId)
      .eq("tipo", "Aluno")
      .maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno) throw new Error("Aluno nao encontrado.");

    const allowedPhone = await phoneBelongsToAluno(admin, aluno.id, to);
    if (!allowedPhone) {
      throw new Error("Telefone informado nao pertence ao aluno nem ao responsavel financeiro cadastrado na ficha.");
    }

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

    const enabled = config?.wa_enabled === true && config?.wa_status === "configurado";
    const accessToken = String(accessTokenSecret || "").trim();
    const phoneNumberId = String(config?.wa_phone_number_id || "").trim();
    if (!enabled || !accessToken || !phoneNumberId) {
      throw new Error("API WhatsApp nao configurada ou token ausente.");
    }

    const graphVersion = normalizeGraphVersion(config?.wa_graph_version);
    const metaResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            preview_url: true,
            body: message,
          },
        }),
      },
    );

    const metaPayload = await metaResponse.json().catch(() => ({}));
    if (!metaResponse.ok) {
      const metaMessage = metaPayload?.error?.message || "Falha na Meta Cloud API.";
      throw new Error(metaMessage);
    }

    const conversation = await upsertWhatsAppConversation(admin, {
      phone: to,
      aluno,
      lastText: message,
      direction: "saida",
    });
    await insertWhatsAppMessage(admin, {
      conversaId: conversation.id,
      alunoId: aluno.id,
      metaMessageId: metaPayload?.messages?.[0]?.id || null,
      direction: "saida",
      senderType: "gestor",
      senderName: gestor.email || "Gestor",
      content: message,
      messageType: "text",
      status: "sent",
      rawPayload: metaPayload,
      read: true,
    });

    return respondJson({
      ok: true,
      conversaId: conversation.id,
      alunoId: aluno.id,
      to,
      meta: {
        messageId: metaPayload?.messages?.[0]?.id || null,
      },
    });
  } catch (error) {
    console.error("whatsapp-send error:", error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro inesperado no envio WhatsApp.",
    }, 400);
  }
});
