import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  findAlunoByPhone,
  normalizeWhatsAppPhone,
  textFromWhatsAppMessage,
  insertWhatsAppMessage,
  upsertWhatsAppConversation,
} from "../_shared/whatsapp.ts";
import { processWhatsAppFlow } from "../_shared/whatsapp-flow/engine.ts";

type FlowTask = () => Promise<void>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const text = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });

const createAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Ambiente Supabase incompleto para webhook WhatsApp.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const getVerifyToken = async (admin: any) => {
  const { data, error } = await admin.rpc("whatsapp_get_secret", {
    p_secret_name: "whatsapp_webhook_verify_token",
  });
  if (error) throw error;
  return String(data || "").trim();
};

const processFlowSafely = async (
  admin: any,
  input: {
    conversation: any;
    aluno: any | null;
    phone: string;
    content: string;
  },
) => {
  try {
    await processWhatsAppFlow(admin, {
      conversation: input.conversation,
      alunoByPhone: input.aluno,
      phone: input.phone,
      content: input.content,
    });
  } catch (flowError) {
    console.error("whatsapp-flow error:", flowError);
    await admin.from("whatsapp_flow_events").insert({
      conversa_id: input.conversation.id,
      aluno_id: input.aluno?.id || null,
      event_type: "flow_error",
      details: {
        message: flowError instanceof Error ? flowError.message : "Erro inesperado no fluxo WhatsApp.",
      },
    });
  }
};

const scheduleFlowTasks = async (tasks: FlowTask[]) => {
  const run = async () => {
    for (const task of tasks) await task();
  };
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil(run());
    return;
  }
  await run();
};

const processMessage = async (admin: any, message: any, contact: any): Promise<FlowTask | null> => {
  const phone = normalizeWhatsAppPhone(message?.from);
  if (!phone) return null;

  const aluno = await findAlunoByPhone(admin, phone);
  const content = textFromWhatsAppMessage(message);
  const conversation = await upsertWhatsAppConversation(admin, {
    phone,
    aluno,
    contactName: contact?.profile?.name || aluno?.nome || phone,
    lastText: content,
    direction: "entrada",
  });

  const insertedMessage = await insertWhatsAppMessage(admin, {
    conversaId: conversation.id,
    alunoId: aluno?.id || null,
    metaMessageId: message?.id || null,
    direction: "entrada",
    senderType: "aluno",
    senderName: aluno?.nome || contact?.profile?.name || phone,
    content,
    messageType: String(message?.type || "text"),
    status: "received",
    rawPayload: message,
    read: false,
  });

  if (!insertedMessage) return null;
  return () => processFlowSafely(admin, { conversation, aluno, phone, content });
};

const processStatus = async (admin: any, status: any) => {
  const messageId = String(status?.id || "").trim();
  if (!messageId) return;

  await admin
    .from("whatsapp_mensagens")
    .update({
      status: String(status?.status || "status"),
      raw_payload: status,
    })
    .eq("meta_message_id", messageId);
};

Deno.serve(async (req: Request) => {
  try {
    const admin = createAdmin();

    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expected = await getVerifyToken(admin);

      if (mode === "subscribe" && token && token === expected && challenge) {
        return text(challenge);
      }
      return text("Token de verificacao invalido.", 403);
    }

    if (req.method !== "POST") return json({ error: "Metodo nao permitido." }, 405);

    const payload = await req.json();
    const firstChange = payload?.entry?.[0]?.changes?.[0];
    const { data: eventRow, error: eventError } = await admin
      .from("whatsapp_webhook_events")
      .insert({
        event_key: firstChange?.value?.metadata?.phone_number_id || payload?.object || null,
        field: firstChange?.field || null,
        payload,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;

    try {
      const flowTasks: FlowTask[] = [];
      for (const entry of payload?.entry || []) {
        for (const change of entry?.changes || []) {
          const value = change?.value || {};
          const contactsByWaId = new Map(
            (value.contacts || []).map((contact: any) => [String(contact.wa_id || ""), contact]),
          );

          for (const message of value.messages || []) {
            const task = await processMessage(admin, message, contactsByWaId.get(String(message?.from || "")));
            if (task) flowTasks.push(task);
          }

          for (const status of value.statuses || []) {
            await processStatus(admin, status);
          }
        }
      }

      await admin
        .from("whatsapp_webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", eventRow.id);

      await scheduleFlowTasks(flowTasks);
    } catch (error) {
      await admin
        .from("whatsapp_webhook_events")
        .update({
          error: error instanceof Error ? error.message : "Erro inesperado no webhook WhatsApp.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventRow.id);
      throw error;
    }

    return json({ received: true });
  } catch (error) {
    console.error("whatsapp-webhook error:", error);
    return json({
      error: error instanceof Error ? error.message : "Erro inesperado no webhook WhatsApp.",
    }, 400);
  }
});
