import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerTokenFromRequest, requireGestorAtivo, requireGestorTab } from "../_shared/authz.ts";
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from "../_shared/http.ts";
import { insertWhatsAppMessage, upsertWhatsAppConversation } from "../_shared/whatsapp.ts";

type BirthdayCandidate = {
  aluno_id: string;
  nome_tratamento: string;
  telefone: string;
  message_bank_id: number;
  message_content: string;
};

type BirthdaySettings = {
  enabled?: boolean;
  send_time?: string;
  meta_template_name?: string;
  meta_template_language?: string;
  header_image_url?: string;
  header_image_source_url?: string;
};

const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v23.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
};

const maceioParts = () => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]),
);

const todayIso = () => {
  const parts = maceioParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const currentLocalTime = () => {
  const parts = maceioParts();
  return `${parts.hour}:${parts.minute}`;
};

const safeEqual = (left: string, right: string) => {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

const parseDate = (value: unknown) => {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : todayIso();
};

const birthdayQuoteFromMessage = (message: string) => {
  const marker = "Uma reflexão para o seu novo ciclo:";
  const markerIndex = message.indexOf(marker);
  if (markerIndex < 0) return message.trim();
  return message.slice(markerIndex + marker.length).trim();
};

const buildBirthdayTemplatePayload = (
  candidate: BirthdayCandidate,
  targetPhone: string,
  settings: BirthdaySettings,
  headerImageUrl: string,
) => {
  const templateName = String(settings.meta_template_name || "mensage_de_aniversario").trim();
  const language = String(settings.meta_template_language || "pt_BR").trim();
  if (!templateName || !language || !headerImageUrl) {
    throw new Error("Modelo de aniversario ou imagem do cabecalho nao configurados.");
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: targetPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: "header",
          parameters: [{ type: "image", image: { link: headerImageUrl } }],
        },
        {
          type: "body",
          parameters: [
            {
              type: "text",
              parameter_name: "nome_aluno",
              text: candidate.nome_tratamento,
            },
            {
              type: "text",
              parameter_name: "frase_aniversario",
              text: birthdayQuoteFromMessage(candidate.message_content),
            },
          ],
        },
      ],
    },
  };
};

const ensureBirthdayHeaderImage = async (admin: any, settings: BirthdaySettings) => {
  const bucket = "whatsapp-assets";
  const folder = "aniversario";
  const filename = "aniversario-universo.png";
  const objectPath = `${folder}/${filename}`;
  const { data: existing, error: listError } = await admin.storage
    .from(bucket)
    .list(folder, { search: filename, limit: 1 });
  if (listError) throw listError;

  if (!existing?.some((item: any) => item.name === filename)) {
    const sourceUrl = String(settings.header_image_source_url || "").trim();
    if (!sourceUrl) throw new Error("Fonte da imagem de aniversario nao configurada.");
    const sourceResponse = await fetch(sourceUrl);
    const contentType = String(sourceResponse.headers.get("content-type") || "").toLowerCase();
    if (!sourceResponse.ok || !contentType.startsWith("image/")) {
      throw new Error("Nao foi possivel preparar a imagem do modelo de aniversario.");
    }
    const bytes = await sourceResponse.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(objectPath, bytes, { contentType, upsert: true, cacheControl: "31536000" });
    if (uploadError) throw uploadError;
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
  return String(data?.publicUrl || settings.header_image_url || "").trim();
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
    const { data: workerSecret, error: workerSecretError } = await admin.rpc(
      "whatsapp_get_automation_worker_secret",
    );
    if (workerSecretError) throw workerSecretError;

    const bearer = bearerTokenFromRequest(req);
    const isWorker = safeEqual(bearer, String(workerSecret || ""));
    if (!isWorker) {
      const gestor = await requireGestorAtivo(req, admin);
      requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");
    }

    const body = await req.json().catch(() => ({}));
    const targetDate = parseDate(body.targetDate);
    const dryRun = body.dryRun === true;
    const force = body.force === true;
    const alunoId = String(body.alunoId || "").trim() || null;
    const limit = Math.min(Math.max(Number(body.limit || 100), 1), 500);
    if (!isWorker && !dryRun) {
      throw new Error("Envio real permitido somente para o executor interno.");
    }
    if ((force || targetDate !== todayIso() || alunoId) && !isWorker) {
      throw new Error("Filtros de teste sao restritos ao executor interno.");
    }
    if (!dryRun && targetDate !== todayIso() && !force) {
      throw new Error("Envio real de aniversario permitido somente na data do aniversario.");
    }

    const { data: birthdaySettings, error: birthdaySettingsError } = await admin
      .from("whatsapp_birthday_settings")
      .select("enabled, send_time, meta_template_name, meta_template_language, header_image_url, header_image_source_url")
      .eq("id", true)
      .maybeSingle();
    if (birthdaySettingsError) throw birthdaySettingsError;
    if (birthdaySettings?.enabled !== true) {
      return respondJson({ ok: true, targetDate, sent: 0, skipped: 0, reason: "birthday_agent_disabled" });
    }
    const configuredTime = String(birthdaySettings?.send_time || "09:00").slice(0, 5);
    if (!force && targetDate === todayIso() && currentLocalTime() < configuredTime) {
      return respondJson({ ok: true, targetDate, sent: 0, skipped: 0, reason: "before_send_time" });
    }
    const headerImageUrl = await ensureBirthdayHeaderImage(admin, birthdaySettings || {});
    if (body.prepareMedia === true && isWorker) {
      return respondJson({ ok: true, prepared: true, headerImageUrl });
    }

    const { data: candidates, error: candidatesError } = await admin.rpc(
      "whatsapp_birthday_due_messages",
      { p_target_date: targetDate, p_limit: limit },
    );
    if (candidatesError) throw candidatesError;

    const { data: config, error: configError } = await admin
      .from("mensageria_config")
      .select("wa_enabled, wa_status, wa_phone_number_id, wa_graph_version, wa_automation_test_mode, wa_automation_test_aluno_id, wa_automation_test_recipient_phone")
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
      throw new Error("WhatsApp API precisa estar configurada e ativa para executar automacoes.");
    }

    const testMode = config?.wa_automation_test_mode === true;
    const testAlunoId = String(config?.wa_automation_test_aluno_id || "").trim() || null;
    const testRecipientPhone = String(config?.wa_automation_test_recipient_phone || "").replace(/\D/g, "");
    if (testMode && (!testAlunoId || !testRecipientPhone)) {
      throw new Error("Modo de teste das automacoes exige aluno e telefone destinatario.");
    }
    const effectiveAlunoId = alunoId || (testMode ? testAlunoId : null);
    const rows = ((candidates || []) as BirthdayCandidate[]).filter((candidate) =>
      !effectiveAlunoId || candidate.aluno_id === effectiveAlunoId
    );
    if (dryRun) {
      return respondJson({
        ok: true,
        targetDate,
        dryRun: true,
        testMode,
        total: rows.length,
      });
    }

    const graphVersion = normalizeGraphVersion(config?.wa_graph_version);
    let sent = 0;
    let skipped = 0;
    const failures: Array<{ alunoId: string; error: string }> = [];

    for (const candidate of rows) {
      const targetPhone = testMode ? testRecipientPhone : candidate.telefone;
      let deliveryId: string | null = null;
      if (!testMode) {
        const { data: delivery, error: deliveryError } = await admin
          .from("whatsapp_birthday_deliveries")
          .insert({
            aluno_id: candidate.aluno_id,
            message_bank_id: candidate.message_bank_id,
            birthday_date: targetDate,
            target_phone: targetPhone,
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
        deliveryId = String(delivery?.id || "") || null;
      }

      try {
        const requestPayload = buildBirthdayTemplatePayload(candidate, targetPhone, birthdaySettings || {}, headerImageUrl);
        const metaResponse = await fetch(
          `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
          },
        );

        const metaPayload = await metaResponse.json().catch(() => ({}));
        if (!metaResponse.ok) {
          throw new Error(metaPayload?.error?.message || "Falha na Meta Cloud API.");
        }

        const conversation = await upsertWhatsAppConversation(admin, {
          phone: targetPhone,
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
          messageType: "image",
          status: "sent",
          rawPayload: {
            type: "image",
            media: {
              link: headerImageUrl,
              mime_type: "image/png",
              filename: "aniversario-universo.png",
              caption: candidate.message_content,
            },
            template: requestPayload.template,
            meta: metaPayload,
          },
          read: true,
        });

        if (deliveryId) {
          await admin
            .from("whatsapp_birthday_deliveries")
            .update({
              status: "sent",
              meta_message_id: metaPayload?.messages?.[0]?.id || null,
              sent_at: new Date().toISOString(),
            })
            .eq("id", deliveryId);
        }
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro inesperado no envio.";
        failures.push({ alunoId: candidate.aluno_id, error: message });
        if (deliveryId) {
          await admin
            .from("whatsapp_birthday_deliveries")
            .update({ status: "error", error: message })
            .eq("id", deliveryId);
        }
      }
    }

    return respondJson({ ok: true, targetDate, total: rows.length, sent, skipped, failures, testMode });
  } catch (error) {
    console.error("whatsapp-birthday-agent error:", error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro inesperado no agente de aniversario.",
    }, 400);
  }
});
