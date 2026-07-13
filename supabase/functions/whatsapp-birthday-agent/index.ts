import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerTokenFromRequest, requireGestorAtivo } from "../_shared/authz.ts";
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from "../_shared/http.ts";
import { insertWhatsAppMessage, upsertWhatsAppConversation } from "../_shared/whatsapp.ts";

type BirthdayCandidate = {
  aluno_id: string;
  nome_tratamento: string;
  telefone: string;
  message_bank_id: number;
  message_content: string;
};

const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v23.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const parseDate = (value: unknown) => {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : todayIso();
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);

  if (isRateLimitExceeded(`whatsapp-birthday-agent:${getClientIp(req)}`, 8, 60000)) {
    return respondJson({ error: "Muitos disparos em curto periodo. Aguarde alguns instantes." }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({ error: "Ambiente Supabase incompleto para o agente de aniversario." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const bearer = bearerTokenFromRequest(req);
    if (bearer !== serviceRoleKey) await requireGestorAtivo(req, admin);

    const body = await req.json().catch(() => ({}));
    const targetDate = parseDate(body.targetDate);
    const dryRun = body.dryRun === true;
    const limit = Math.min(Math.max(Number(body.limit || 100), 1), 500);
    if (!dryRun && targetDate !== todayIso() && body.force !== true) {
      throw new Error("Envio real de aniversario permitido somente na data do aniversario.");
    }

    const { data: candidates, error: candidatesError } = await admin.rpc(
      "whatsapp_birthday_due_messages",
      { p_target_date: targetDate, p_limit: limit },
    );
    if (candidatesError) throw candidatesError;

    const rows = (candidates || []) as BirthdayCandidate[];
    if (dryRun) return respondJson({ ok: true, targetDate, dryRun: true, candidates: rows });

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
    let sent = 0;
    let skipped = 0;
    const failures: Array<{ alunoId: string; error: string }> = [];

    for (const candidate of rows) {
      const { data: delivery, error: deliveryError } = await admin
        .from("whatsapp_birthday_deliveries")
        .insert({
          aluno_id: candidate.aluno_id,
          message_bank_id: candidate.message_bank_id,
          birthday_date: targetDate,
          target_phone: candidate.telefone,
          content: candidate.message_content,
          status: "processing",
        })
        .select("id")
        .maybeSingle();

      if (deliveryError) {
        if (deliveryError.code === "23505") skipped += 1;
        else failures.push({ alunoId: candidate.aluno_id, error: deliveryError.message });
        continue;
      }

      try {
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
              to: candidate.telefone,
              type: "text",
              text: { preview_url: false, body: candidate.message_content },
            }),
          },
        );

        const metaPayload = await metaResponse.json().catch(() => ({}));
        if (!metaResponse.ok) {
          throw new Error(metaPayload?.error?.message || "Falha na Meta Cloud API.");
        }

        const conversation = await upsertWhatsAppConversation(admin, {
          phone: candidate.telefone,
          aluno: { id: candidate.aluno_id, nome: candidate.nome_tratamento },
          lastText: candidate.message_content,
          direction: "saida",
        });
        await insertWhatsAppMessage(admin, {
          conversaId: conversation.id,
          alunoId: candidate.aluno_id,
          metaMessageId: metaPayload?.messages?.[0]?.id || null,
          direction: "saida",
          senderType: "sistema",
          senderName: "Agente aniversario",
          content: candidate.message_content,
          messageType: "text",
          status: "sent",
          rawPayload: metaPayload,
          read: true,
        });

        await admin
          .from("whatsapp_birthday_deliveries")
          .update({
            status: "sent",
            meta_message_id: metaPayload?.messages?.[0]?.id || null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", delivery?.id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro inesperado no envio.";
        failures.push({ alunoId: candidate.aluno_id, error: message });
        await admin
          .from("whatsapp_birthday_deliveries")
          .update({ status: "error", error: message })
          .eq("id", delivery?.id);
      }
    }

    return respondJson({ ok: true, targetDate, total: rows.length, sent, skipped, failures });
  } catch (error) {
    console.error("whatsapp-birthday-agent error:", error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro inesperado no agente de aniversario.",
    }, 400);
  }
});
