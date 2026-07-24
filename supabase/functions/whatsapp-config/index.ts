import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireGestorAtivo,
  requireGestorGlobal,
  requireGestorTab,
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

const allowedModalities = new Set([
  "EAD",
  "TECNICO",
  "LIVRES",
  "ESPECIALIZACAO",
  "SUPERIOR",
]);

const normalizeModalities = (value: unknown) => {
  if (!Array.isArray(value)) {
    return ["EAD", "TECNICO", "LIVRES", "ESPECIALIZACAO"];
  }

  const modalities = value
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item, index, list) =>
      allowedModalities.has(item) && list.indexOf(item) === index
    );

  return modalities.length > 0
    ? modalities
    : ["EAD", "TECNICO", "LIVRES", "ESPECIALIZACAO"];
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

  if (isRateLimitExceeded(`whatsapp-config:${getClientIp(req)}`, 20, 60000)) {
    return respondJson({
      error: "Muitas alteracoes em curto periodo. Aguarde alguns instantes.",
    }, 429);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson({
      error: "Ambiente Supabase incompleto para configurar WhatsApp.",
    }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorTab(gestor, "comunicacao", "comunicacao-whatsapp");
    requireGestorGlobal(gestor);

    const body = await req.json();
    if (body.waConnectionMode !== "cloud_api") {
      throw new Error(
        "O salvamento manual aceita somente Cloud API exclusiva. A coexistencia deve ser concluida pelo Embedded Signup.",
      );
    }

    const businessAccountId = trimOrNull(body.waBusinessAccountId);
    const phoneNumberId = trimOrNull(body.waPhoneNumberId);
    const requestedEnabled = body.waEnabled === true;
    const accessToken = trimOrNull(body.waToken);

    const { data: currentConfig, error: currentConfigError } = await admin
      .from("mensageria_config")
      .select(
        "wa_connection_mode, wa_business_account_id, wa_phone_number_id, wa_status",
      )
      .eq("tipo", "whatsapp")
      .maybeSingle();
    if (currentConfigError) throw currentConfigError;

    const identityChanged =
      String(currentConfig?.wa_business_account_id || "") !==
        String(businessAccountId || "") ||
      String(currentConfig?.wa_phone_number_id || "") !==
        String(phoneNumberId || "");
    const canReuseStoredToken = currentConfig?.wa_connection_mode ===
        "cloud_api" &&
      currentConfig?.wa_status === "configurado" &&
      !identityChanged;

    if (requestedEnabled && (!businessAccountId || !phoneNumberId)) {
      throw new Error(
        "Informe WABA ID e Phone Number ID para ativar a Cloud API exclusiva.",
      );
    }
    if (requestedEnabled && !accessToken && !canReuseStoredToken) {
      throw new Error(
        "Informe o access token correspondente ao numero que sera ativado na Cloud API.",
      );
    }

    if (accessToken) {
      const { error: tokenError } = await admin.rpc("whatsapp_set_secret", {
        p_secret_name: "whatsapp_meta_access_token",
        p_secret_value: accessToken,
      });
      if (tokenError) throw tokenError;
    }

    const verifyToken = trimOrNull(body.waWebhookVerifyToken);
    if (verifyToken) {
      const { error: verifyTokenError } = await admin.rpc(
        "whatsapp_set_secret",
        {
          p_secret_name: "whatsapp_webhook_verify_token",
          p_secret_value: verifyToken,
        },
      );
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
        wa_connection_mode: "cloud_api",
        wa_instance_name: trimOrNull(body.waInstanceName),
        wa_instance_url: trimOrNull(body.waInstanceUrl) ||
          "https://graph.facebook.com",
        wa_token: null,
        wa_status: requestedEnabled ? "configurado" : "inativo",
        wa_business_account_id: businessAccountId,
        wa_business_portfolio_id: null,
        wa_phone_number_id: phoneNumberId,
        wa_display_phone_number: trimOrNull(body.waDisplayPhoneNumber),
        wa_graph_version: normalizeGraphVersion(body.waGraphVersion),
        wa_app_id: trimOrNull(body.waAppId),
        wa_embedded_signup_config_id: trimOrNull(body.waEmbeddedSignupConfigId),
        wa_webhook_verify_token: null,
        wa_account_currency: trimOrNull(body.waAccountCurrency) || "BRL",
        wa_estimated_balance: numberOrNull(body.waEstimatedBalance),
        wa_quality_rating: trimOrNull(body.waQualityRating),
        wa_messaging_limit: trimOrNull(body.waMessagingLimit),
        wa_enabled: requestedEnabled,
        wa_last_health_check_at: new Date().toISOString(),
        wa_coexistence_verified_at: null,
        wa_contacts_sync_status: "not_requested",
        wa_contacts_sync_request_id: null,
        wa_history_sync_status: "not_requested",
        wa_history_sync_request_id: null,
        wa_history_sync_progress: null,
        wa_last_account_event: "CLOUD_API_CONFIG_SAVED",
        wa_last_account_event_at: new Date().toISOString(),
        wa_due_notice_days: Number(body.waDueNoticeDays || 3),
        wa_send_due_notice: body.waSendDueNotice !== false,
        wa_due_notice_template: trimOrNull(body.waDueNoticeTemplate) ||
          "Ola, {{nome_aluno}}!\n\nEste e um lembrete de que sua mensalidade referente ao curso *{{nome_curso}}*, no valor de *{{valor_fatura}}*, vence em *{{data_vencimento}}*.\n\nIdentificacao do aluno: CPF final *{{cpf_final}}*.\n\nVoce pode realizar o pagamento pelo link abaixo:\n{{link_pagamento}}\n\nCaso o pagamento ja tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.",
        wa_send_payment_receipt: body.waSendPaymentReceipt !== false,
        wa_payment_receipt_template:
          trimOrNull(body.waPaymentReceiptTemplate) ||
          "Ola, {{nome_aluno}}!\n\nSeu pagamento no valor de *{{valor_fatura}}*, referente a mensalidade n. *{{numero_mensalidade}}* do curso *{{nome_curso}}*, foi confirmado com sucesso.\n\nIdentificacao do aluno: CPF final *{{cpf_final}}*.\n\nAgradecemos pela confianca e por fazer parte da Universo Cursos e Consultoria.\n\nSe precisar de suporte, nossa equipe esta a disposicao.\n\nEquipe Universo Cursos e Consultoria.",
        wa_send_overdue_notice: body.waSendOverdueNotice !== false,
        wa_overdue_notice_days: Number(body.waOverdueNoticeDays || 1),
        wa_default_overdue_template:
          trimOrNull(body.waDefaultOverdueTemplate) ||
          "Ola, {{nome_aluno}}!\n\nIdentificamos que a mensalidade no valor de *{{valor_fatura}}* ainda consta como pendente em nosso sistema.\n\n*Turma:* {{nome_turma}}\n*CPF final:* {{cpf_final}}\n*Vencimento:* {{data_vencimento}}\n\nPara realizar o pagamento, acesse:\n{{link_pagamento}}\n\nCaso o pagamento ja tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.",
        wa_send_multiple_overdue_notice:
          body.waSendMultipleOverdueNotice !== false,
        wa_multiple_overdue_min_installments: Math.max(
          Number(body.waMultipleOverdueMinInstallments || 2),
          2,
        ),
        wa_multiple_overdue_template:
          trimOrNull(body.waMultipleOverdueTemplate) ||
          "Ola, {{nome_aluno}}!\n\nIdentificamos parcelas pendentes em seu cadastro.\n\n*Quantidade:* {{quantidade_parcelas}}\n*Valor total:* {{valor_total_atrasado}}\n*Curso:* {{nome_curso}}\n*Turma:* {{nome_turma}}\n*CPF final:* {{cpf_final}}\n\nPara regularizar sua situacao, responda a esta mensagem. Nossa equipe verificara as opcoes disponiveis.\n\nCaso o pagamento ja tenha sido realizado, desconsidere este aviso.\n\nEquipe Universo Cursos e Consultoria.",
        wa_due_notice_modalities: normalizeModalities(
          body.waDueNoticeModalities,
        ),
        wa_payment_receipt_modalities: normalizeModalities(
          body.waPaymentReceiptModalities,
        ),
        wa_overdue_notice_modalities: normalizeModalities(
          body.waOverdueNoticeModalities,
        ),
        wa_multiple_overdue_modalities: normalizeModalities(
          body.waMultipleOverdueModalities,
        ),
      }, { onConflict: "tipo" });
    if (upsertError) throw upsertError;

    return respondJson({ ok: true });
  } catch (error) {
    console.error("whatsapp-config error:", error);
    return respondJson({
      error: error instanceof Error
        ? error.message
        : "Erro inesperado ao configurar WhatsApp.",
    }, 400);
  }
});
