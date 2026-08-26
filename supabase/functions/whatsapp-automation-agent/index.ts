import { createClient } from "npm:@supabase/supabase-js@2";
import {
  bearerTokenFromRequest,
  requireGestorAtivo,
  requireGestorTab,
  requireGlobalFinancialTabAccess,
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
  upsertWhatsAppConversation,
} from "../_shared/whatsapp.ts";

type AutomationKey = "due" | "receipt" | "overdue" | "multiple";

type Candidate = {
  automation_key: AutomationKey;
  aluno_id: string;
  aluno_nome: string;
  telefone: string;
  receivable_id: string | null;
  receivable_ids: string[];
  reference_date: string;
  dedupe_key: string;
  message_content: string;
};

type ClaimedCandidate = {
  delivery_id: string;
  automation_key: AutomationKey;
  aluno_id: string;
  aluno_nome: string;
  target_phone: string;
  receivable_id: string | null;
  receivable_ids: string[];
  reference_date: string;
  message_content: string;
};

const senderNames: Record<AutomationKey, string> = {
  due: "Automacao de vencimento",
  receipt: "Automacao de recebimento",
  overdue: "Automacao de atraso",
  multiple: "Automacao de multiplas parcelas",
};

const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v23.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
};

const localDateIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const parseDate = (value: unknown) => {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : localDateIso();
};

const safeEqual = (left: string, right: string) => {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return respondJson({ error: "Metodo nao permitido." }, 405);
  }

  if (
    isRateLimitExceeded(
      `whatsapp-automation-agent:${getClientIp(req)}`,
      20,
      60000,
    )
  ) {
    return respondJson({ error: "Muitos disparos em curto periodo." }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({
      error: "Ambiente Supabase incompleto para automacoes WhatsApp.",
    }, 500);
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
      requireGlobalFinancialTabAccess(gestor, "receber");
    }

    const body = await req.json().catch(() => ({}));
    const targetDate = parseDate(body.targetDate);
    const dryRun = body.dryRun === true;
    const force = body.force === true;
    const alunoId = String(body.alunoId || "").trim() || null;
    const limit = Math.min(Math.max(Number(body.limit || 500), 1), 500);
    const requestedKeys = Array.isArray(body.keys)
      ? new Set(body.keys.map((key: unknown) => String(key)))
      : null;

    if (!isWorker && !dryRun) {
      throw new Error("Envio real permitido somente para o executor interno.");
    }

    if ((force || targetDate !== localDateIso() || alunoId) && !isWorker) {
      throw new Error("Filtros de teste sao restritos ao executor interno.");
    }

    const { data: config, error: configError } = await admin
      .from("mensageria_config")
      .select(
        "wa_enabled, wa_status, wa_phone_number_id, wa_graph_version, wa_automation_test_mode, wa_automation_test_aluno_id, wa_automation_test_recipient_phone",
      )
      .eq("tipo", "whatsapp")
      .maybeSingle();
    if (configError) throw configError;

    const { data: accessTokenSecret, error: accessTokenError } = await admin
      .rpc(
        "whatsapp_get_secret",
        { p_secret_name: "whatsapp_meta_access_token" },
      );
    if (accessTokenError) throw accessTokenError;

    const accessToken = String(accessTokenSecret || "").trim();
    const phoneNumberId = String(config?.wa_phone_number_id || "").trim();
    const apiActive = config?.wa_enabled === true &&
      config?.wa_status === "configurado" &&
      Boolean(phoneNumberId) &&
      Boolean(accessToken);
    if (!apiActive) {
      throw new Error(
        "WhatsApp API precisa estar configurada e ativa para executar automacoes.",
      );
    }

    const testMode = config?.wa_automation_test_mode === true;
    const testAlunoId =
      String(config?.wa_automation_test_aluno_id || "").trim() || null;
    const testRecipientPhone = normalizeWhatsAppPhone(
      config?.wa_automation_test_recipient_phone,
    );
    if (testMode && (!testAlunoId || !testRecipientPhone)) {
      throw new Error(
        "Modo de teste das automacoes exige aluno e telefone destinatario.",
      );
    }
    const effectiveAlunoId = alunoId || (testMode ? testAlunoId : null);

    const { data: candidateData, error: candidateError } = await admin.rpc(
      "whatsapp_financial_automation_candidates",
      {
        p_target_date: targetDate,
        p_aluno_id: effectiveAlunoId,
        p_limit: limit,
      },
    );
    if (candidateError) throw candidateError;

    const candidates = ((candidateData || []) as Candidate[]).filter((
      candidate,
    ) => !requestedKeys || requestedKeys.has(candidate.automation_key));
    if (dryRun) {
      const byAutomation = candidates.reduce<Record<string, number>>(
        (summary, candidate) => {
          summary[candidate.automation_key] =
            (summary[candidate.automation_key] || 0) + 1;
          return summary;
        },
        {},
      );
      return respondJson({
        ok: true,
        dryRun: true,
        targetDate,
        total: candidates.length,
        byAutomation,
      });
    }

    const graphVersion = normalizeGraphVersion(config?.wa_graph_version);
    let sent = 0;
    let skipped = 0;
    const failures: Array<{ key: string; alunoId: string; error: string }> = [];

    for (const candidate of candidates) {
      const { data: claimData, error: claimError } = await admin.rpc(
        "claim_whatsapp_financial_automation_delivery",
        {
          p_automation_key: candidate.automation_key,
          p_aluno_id: candidate.aluno_id,
          p_reference_date: candidate.reference_date,
          p_candidate_dedupe_key: candidate.dedupe_key,
          p_test_mode: testMode,
          p_target_phone_override: testMode ? testRecipientPhone : null,
        },
      );
      if (claimError) {
        failures.push({
          key: candidate.automation_key,
          alunoId: candidate.aluno_id,
          error: "Falha ao revalidar a cobranca antes do envio.",
        });
        continue;
      }

      const claimed = ((claimData || []) as ClaimedCandidate[])[0];
      if (!claimed) {
        skipped += 1;
        continue;
      }

      const phone = normalizeWhatsAppPhone(claimed.target_phone);
      if (!phone) {
        failures.push({
          key: claimed.automation_key,
          alunoId: claimed.aluno_id,
          error: "Telefone invalido apos a revalidacao.",
        });
        await admin.from("whatsapp_automation_deliveries").update({
          status: "error",
          error: "Telefone invalido apos a revalidacao.",
        }).eq("id", claimed.delivery_id);
        continue;
      }

      // O claim é o ponto de autorização serializado com mudanças do título.
      // Depois dele não há I/O antes da Meta; mensagem já aceita pelo provedor
      // não pode ser desfeita por um trancamento que confirme posteriormente.
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
              to: phone,
              type: "text",
              text: { preview_url: true, body: claimed.message_content },
            }),
          },
        );

        const metaPayload = await metaResponse.json().catch(() => ({}));
        if (!metaResponse.ok) {
          throw new Error(
            metaPayload?.error?.message || "Falha na Meta Cloud API.",
          );
        }

        const aluno = { id: claimed.aluno_id, nome: claimed.aluno_nome };
        const conversation = await upsertWhatsAppConversation(admin, {
          phone,
          aluno,
          lastText: claimed.message_content,
          direction: "saida",
        });
        await insertWhatsAppMessage(admin, {
          conversaId: conversation.id,
          alunoId: claimed.aluno_id,
          metaMessageId: metaPayload?.messages?.[0]?.id || null,
          direction: "saida",
          senderType: "sistema",
          senderName: senderNames[claimed.automation_key],
          content: claimed.message_content,
          messageType: "text",
          status: "sent",
          rawPayload: metaPayload,
          read: true,
        });

        await admin.from("whatsapp_automation_deliveries").update({
          status: "sent",
          meta_message_id: metaPayload?.messages?.[0]?.id || null,
          sent_at: new Date().toISOString(),
          error: null,
        }).eq("id", claimed.delivery_id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Erro inesperado no envio.";
        failures.push({
          key: claimed.automation_key,
          alunoId: claimed.aluno_id,
          error: message,
        });
        await admin.from("whatsapp_automation_deliveries").update({
          status: "error",
          error: message,
        }).eq("id", claimed.delivery_id);
      }
    }

    return respondJson({
      ok: failures.length === 0,
      targetDate,
      total: candidates.length,
      sent,
      skipped,
      failures,
      testMode,
    });
  } catch (error) {
    console.error("whatsapp-automation-agent error:", error);
    return respondJson({
      error: error instanceof Error
        ? error.message
        : "Erro inesperado nas automacoes WhatsApp.",
    }, 400);
  }
});
