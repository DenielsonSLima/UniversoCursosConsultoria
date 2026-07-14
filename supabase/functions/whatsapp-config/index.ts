import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireGestorAtivo,
  requireGestorGlobal,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";

const trimOrNull = (value: unknown) => {
  const text = String(value || "").trim();
  return text || null;
};

const normalizeGraphVersion = (value: unknown) => {
  const version = String(value || "v25.0").trim();
  return /^v\d+\.\d+$/.test(version) ? version : "v25.0";
};

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const allowedModalities = new Set(["EAD", "TECNICO", "LIVRES", "ESPECIALIZACAO", "SUPERIOR"]);

const normalizeModalities = (value: unknown) => {
  if (!Array.isArray(value)) return ["EAD", "TECNICO", "LIVRES", "ESPECIALIZACAO"];

  const modalities = value
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item, index, list) => allowedModalities.has(item) && list.indexOf(item) === index);

  return modalities.length > 0 ? modalities : ["EAD", "TECNICO", "LIVRES", "ESPECIALIZACAO"];
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);

  if (isRateLimitExceeded(`whatsapp-config:${getClientIp(req)}`, 20, 60000)) {
    return respondJson({ error: "Muitas alteracoes em curto periodo. Aguarde alguns instantes." }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({ error: "Ambiente Supabase incompleto para configurar WhatsApp." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorGlobal(gestor);

    const body = await req.json();
    const accessToken = trimOrNull(body.waToken);
    if (accessToken) {
      const { error: tokenError } = await admin.rpc("whatsapp_set_secret", {
        p_secret_name: "whatsapp_meta_access_token",
        p_secret_value: accessToken,
      });
      if (tokenError) throw tokenError;
    }

    const verifyToken = trimOrNull(body.waWebhookVerifyToken);
    if (verifyToken) {
      const { error: verifyTokenError } = await admin.rpc("whatsapp_set_secret", {
        p_secret_name: "whatsapp_webhook_verify_token",
        p_secret_value: verifyToken,
      });
      if (verifyTokenError) throw verifyTokenError;
    }

    const appSecret = trimOrNull(body.waAppSecret);
    if (appSecret) {
      const { error: appSecretError } = await admin.rpc("whatsapp_set_secret", {
        p_secret_name: "whatsapp_app_secret",
        p_secret_value: appSecret,
      });
      if (appSecretError) throw appSecretError;
    }

    const { error: upsertError } = await admin
      .from("mensageria_config")
      .upsert({
        tipo: "whatsapp",
        wa_provider: trimOrNull(body.waProvider) || "meta_cloud",
        wa_instance_name: trimOrNull(body.waInstanceName),
        wa_instance_url: trimOrNull(body.waInstanceUrl) || "https://graph.facebook.com",
        wa_token: null,
        wa_status: trimOrNull(body.waStatus) || (body.waEnabled ? "configurado" : "inativo"),
        wa_business_account_id: trimOrNull(body.waBusinessAccountId),
        wa_phone_number_id: trimOrNull(body.waPhoneNumberId),
        wa_display_phone_number: trimOrNull(body.waDisplayPhoneNumber),
        wa_graph_version: normalizeGraphVersion(body.waGraphVersion),
        wa_app_id: trimOrNull(body.waAppId),
        wa_embedded_signup_config_id: trimOrNull(body.waEmbeddedSignupConfigId),
        wa_webhook_verify_token: null,
        wa_account_currency: trimOrNull(body.waAccountCurrency) || "BRL",
        wa_estimated_balance: numberOrNull(body.waEstimatedBalance),
        wa_quality_rating: trimOrNull(body.waQualityRating),
        wa_messaging_limit: trimOrNull(body.waMessagingLimit),
        wa_enabled: body.waEnabled === true,
        wa_last_health_check_at: new Date().toISOString(),
        wa_due_notice_days: Number(body.waDueNoticeDays || 3),
        wa_send_due_notice: body.waSendDueNotice !== false,
        wa_due_notice_template: trimOrNull(body.waDueNoticeTemplate) ||
          "Ola, {{nome_aluno}}. Passando para lembrar que sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para facilitar, o pagamento pode ser feito por este link: {{link_pagamento}}. Se voce ja realizou o pagamento, por favor desconsidere esta mensagem.",
        wa_send_payment_receipt: body.waSendPaymentReceipt !== false,
        wa_payment_receipt_template: trimOrNull(body.waPaymentReceiptTemplate) ||
          "Ola, {{nome_aluno}}. Confirmamos o recebimento do pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado por manter tudo em dia com a Universo Cursos.",
        wa_send_overdue_notice: body.waSendOverdueNotice !== false,
        wa_overdue_notice_days: Number(body.waOverdueNoticeDays || 1),
        wa_default_overdue_template: trimOrNull(body.waDefaultOverdueTemplate) ||
          "Ola, {{nome_aluno}}. Verificamos uma parcela de {{valor_fatura}} com vencimento em {{data_vencimento}} ainda em aberto. Para regularizar, voce pode usar este link: {{link_pagamento}}. Se o pagamento ja foi feito, por favor desconsidere esta mensagem.",
        wa_send_multiple_overdue_notice: body.waSendMultipleOverdueNotice !== false,
        wa_multiple_overdue_min_installments: Math.max(Number(body.waMultipleOverdueMinInstallments || 2), 2),
        wa_multiple_overdue_template: trimOrNull(body.waMultipleOverdueTemplate) ||
          "Ola, {{nome_aluno}}. Identificamos {{quantidade_parcelas}} parcelas em aberto no seu cadastro, totalizando {{valor_total_atrasado}}. Queremos ajudar voce a regularizar sua situacao com tranquilidade. Responda esta mensagem para nossa equipe verificar uma condicao especial para deixar tudo em dia. Se voce ja regularizou, por favor desconsidere esta mensagem.",
        wa_due_notice_modalities: normalizeModalities(body.waDueNoticeModalities),
        wa_payment_receipt_modalities: normalizeModalities(body.waPaymentReceiptModalities),
        wa_overdue_notice_modalities: normalizeModalities(body.waOverdueNoticeModalities),
        wa_multiple_overdue_modalities: normalizeModalities(body.waMultipleOverdueModalities),
      }, { onConflict: "tipo" });
    if (upsertError) throw upsertError;

    return respondJson({ ok: true });
  } catch (error) {
    console.error("whatsapp-config error:", error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro inesperado ao configurar WhatsApp.",
    }, 400);
  }
});
