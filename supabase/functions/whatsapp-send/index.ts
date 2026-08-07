import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireGestorAtivo,
  requireGestorForWhatsAppRoute,
  requireGestorTab,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import {
  insertWhatsAppMessage,
  normalizeWhatsAppPhone,
  phoneBelongsToAluno,
  upsertWhatsAppConversation,
} from "../_shared/whatsapp.ts";
import { getWhatsAppMetaContext } from "../_shared/whatsapp-connection.ts";

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
    const connectionId = String(body.conexaoId || body.connectionId || "")
      .trim();
    const conversationId = String(
      body.conversaId || body.conversationId || "",
    ).trim();
    let alunoId = String(body.alunoId || "").trim();
    let to = normalizeWhatsAppPhone(body.to);
    const message = String(body.message || "").trim();

    if (!connectionId) throw new Error("Selecione a linha que enviará a mensagem.");
    if (!message) throw new Error("Mensagem obrigatoria para envio WhatsApp.");
    if (message.length > 4096) throw new Error("Mensagem WhatsApp muito longa.");

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
      alunoId = String(data.aluno_id || alunoId || "").trim();
    }
    if (!to) throw new Error("Telefone/WhatsApp invalido.");
    if (!conversationId && !alunoId) {
      throw new Error("Aluno obrigatorio para iniciar uma nova conversa WhatsApp.");
    }

    let aluno: any | null = null;
    if (alunoId) {
      const { data, error } = await admin
        .from("parceiros")
        .select("id, nome, tipo, telefone, polo_id")
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

    const meta = await getWhatsAppMetaContext(admin, connectionId);
    const metaResponse = await fetch(
      `https://graph.facebook.com/${meta.graphVersion}/${meta.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${meta.accessToken}`,
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
      connectionId,
      phone: to,
      aluno,
      contactName: currentConversation?.contato_nome || aluno?.nome || to,
      lastText: message,
      direction: "saida",
    });
    await insertWhatsAppMessage(admin, {
      conversaId: conversation.id,
      alunoId: aluno?.id || conversation.aluno_id || null,
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

    if (
      ["bot_triagem", "pendente_setor"].includes(
        String(currentConversation?.status_atendimento || ""),
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

    return respondJson({
      ok: true,
      conversaId: conversation.id,
      alunoId: aluno?.id || conversation.aluno_id || null,
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
