import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireGestorAtivo,
  requireGestorGlobal,
  requireGestorTab,
  requireGlobalFinancialTabAccess,
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

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const allowedModalities = new Set([
  "EAD",
  "TECNICO",
  "LIVRE",
  "ESPECIALIZACAO",
  "SUPERIOR",
]);

const normalizeModality = (value: unknown) => {
  const modality = String(value || "").trim().toUpperCase();
  return modality === "LIVRES" ? "LIVRE" : modality;
};

const normalizeModalities = (value: unknown) => {
  if (!Array.isArray(value)) {
    return ["EAD", "TECNICO", "LIVRE", "ESPECIALIZACAO"];
  }

  const modalities = value
    .map(normalizeModality)
    .filter((item, index, list) =>
      allowedModalities.has(item) && list.indexOf(item) === index
    );

  return modalities.length > 0
    ? modalities
    : ["EAD", "TECNICO", "LIVRE", "ESPECIALIZACAO"];
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
    requireGlobalFinancialTabAccess(gestor, "receber");

    const body = await req.json();

    const { data: currentConfig, error: currentConfigError } = await admin
      .from("mensageria_config")
      .select(
        "wa_provider, wa_instance_name, wa_instance_url, wa_connection_mode, wa_business_account_id, wa_phone_number_id, wa_display_phone_number, wa_graph_version, wa_app_id, wa_embedded_signup_config_id, wa_account_currency, wa_estimated_balance, wa_quality_rating, wa_messaging_limit, wa_enabled, wa_status, wa_due_notice_days, wa_send_due_notice, wa_due_notice_template, wa_send_payment_receipt, wa_payment_receipt_template, wa_send_overdue_notice, wa_overdue_notice_days, wa_default_overdue_template, wa_send_multiple_overdue_notice, wa_multiple_overdue_min_installments, wa_multiple_overdue_template, wa_due_notice_modalities, wa_payment_receipt_modalities, wa_overdue_notice_modalities, wa_multiple_overdue_modalities",
      )
      .eq("tipo", "whatsapp")
      .maybeSingle();
    if (currentConfigError) throw currentConfigError;

    const connectionMode = hasOwn(body, "waConnectionMode")
      ? String(body.waConnectionMode || "")
      : String(currentConfig?.wa_connection_mode || "cloud_api");
    if (connectionMode !== "cloud_api") {
      throw new Error(
        "O salvamento manual aceita somente Cloud API exclusiva. A coexistencia deve ser concluida pelo Embedded Signup.",
      );
    }

    const businessAccountId = hasOwn(body, "waBusinessAccountId")
      ? trimOrNull(body.waBusinessAccountId)
      : trimOrNull(currentConfig?.wa_business_account_id);
    const phoneNumberId = hasOwn(body, "waPhoneNumberId")
      ? trimOrNull(body.waPhoneNumberId)
      : trimOrNull(currentConfig?.wa_phone_number_id);
    const requestedEnabled = hasOwn(body, "waEnabled")
      ? body.waEnabled === true
      : currentConfig?.wa_enabled === true;
    const accessToken = trimOrNull(body.waToken);

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
        wa_provider: hasOwn(body, "waProvider")
          ? trimOrNull(body.waProvider) || "meta_cloud"
          : currentConfig?.wa_provider || "meta_cloud",
        wa_connection_mode: "cloud_api",
        wa_instance_name: hasOwn(body, "waInstanceName")
          ? trimOrNull(body.waInstanceName)
          : currentConfig?.wa_instance_name,
        wa_instance_url: hasOwn(body, "waInstanceUrl")
          ? trimOrNull(body.waInstanceUrl) || "https://graph.facebook.com"
          : currentConfig?.wa_instance_url || "https://graph.facebook.com",
        wa_token: null,
        wa_status: requestedEnabled ? "configurado" : "inativo",
        wa_business_account_id: businessAccountId,
        wa_business_portfolio_id: null,
        wa_phone_number_id: phoneNumberId,
        wa_display_phone_number: hasOwn(body, "waDisplayPhoneNumber")
          ? trimOrNull(body.waDisplayPhoneNumber)
          : currentConfig?.wa_display_phone_number,
        wa_graph_version: hasOwn(body, "waGraphVersion")
          ? normalizeGraphVersion(body.waGraphVersion)
          : normalizeGraphVersion(currentConfig?.wa_graph_version),
        wa_app_id: hasOwn(body, "waAppId")
          ? trimOrNull(body.waAppId)
          : currentConfig?.wa_app_id,
        wa_embedded_signup_config_id: hasOwn(body, "waEmbeddedSignupConfigId")
          ? trimOrNull(body.waEmbeddedSignupConfigId)
          : currentConfig?.wa_embedded_signup_config_id,
        wa_webhook_verify_token: null,
        wa_account_currency: hasOwn(body, "waAccountCurrency")
          ? trimOrNull(body.waAccountCurrency) || "BRL"
          : currentConfig?.wa_account_currency || "BRL",
        wa_estimated_balance: hasOwn(body, "waEstimatedBalance")
          ? numberOrNull(body.waEstimatedBalance)
          : currentConfig?.wa_estimated_balance,
        wa_quality_rating: hasOwn(body, "waQualityRating")
          ? trimOrNull(body.waQualityRating)
          : currentConfig?.wa_quality_rating,
        wa_messaging_limit: hasOwn(body, "waMessagingLimit")
          ? trimOrNull(body.waMessagingLimit)
          : currentConfig?.wa_messaging_limit,
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
        wa_due_notice_days: hasOwn(body, "waDueNoticeDays")
          ? Math.max(Number(body.waDueNoticeDays || 0), 0)
          : Number(currentConfig?.wa_due_notice_days ?? 3),
        wa_send_due_notice: hasOwn(body, "waSendDueNotice")
          ? body.waSendDueNotice === true
          : currentConfig?.wa_send_due_notice === true,
        wa_due_notice_template: (hasOwn(body, "waDueNoticeTemplate")
          ? trimOrNull(body.waDueNoticeTemplate)
          : trimOrNull(currentConfig?.wa_due_notice_template)) ||
          "Ola, {{nome_aluno}}!\n\nEste e um lembrete de que sua mensalidade referente ao curso *{{nome_curso}}*, no valor de *{{valor_fatura}}*, vence em *{{data_vencimento}}*.\n\nIdentificacao do aluno: CPF final *{{cpf_final}}*.\n\nVoce pode realizar o pagamento pelo link abaixo:\n{{link_pagamento}}\n\nCaso o pagamento ja tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.",
        wa_send_payment_receipt: hasOwn(body, "waSendPaymentReceipt")
          ? body.waSendPaymentReceipt === true
          : currentConfig?.wa_send_payment_receipt === true,
        wa_payment_receipt_template:
          (hasOwn(body, "waPaymentReceiptTemplate")
            ? trimOrNull(body.waPaymentReceiptTemplate)
            : trimOrNull(currentConfig?.wa_payment_receipt_template)) ||
          "Ola, {{nome_aluno}}!\n\nSeu pagamento no valor de *{{valor_fatura}}*, referente a mensalidade n. *{{numero_mensalidade}}* do curso *{{nome_curso}}*, foi confirmado com sucesso.\n\nIdentificacao do aluno: CPF final *{{cpf_final}}*.\n\nAgradecemos pela confianca e por fazer parte da Universo Cursos e Consultoria.\n\nSe precisar de suporte, nossa equipe esta a disposicao.\n\nEquipe Universo Cursos e Consultoria.",
        wa_send_overdue_notice: hasOwn(body, "waSendOverdueNotice")
          ? body.waSendOverdueNotice === true
          : currentConfig?.wa_send_overdue_notice === true,
        wa_overdue_notice_days: hasOwn(body, "waOverdueNoticeDays")
          ? Math.max(Number(body.waOverdueNoticeDays || 0), 0)
          : Number(currentConfig?.wa_overdue_notice_days ?? 1),
        wa_default_overdue_template:
          (hasOwn(body, "waDefaultOverdueTemplate")
            ? trimOrNull(body.waDefaultOverdueTemplate)
            : trimOrNull(currentConfig?.wa_default_overdue_template)) ||
          "Ola, {{nome_aluno}}!\n\nIdentificamos que a mensalidade no valor de *{{valor_fatura}}* ainda consta como pendente em nosso sistema.\n\n*Turma:* {{nome_turma}}\n*CPF final:* {{cpf_final}}\n*Vencimento:* {{data_vencimento}}\n\nPara realizar o pagamento, acesse:\n{{link_pagamento}}\n\nCaso o pagamento ja tenha sido efetuado, desconsidere esta mensagem.\n\nEquipe Universo Cursos e Consultoria.",
        wa_send_multiple_overdue_notice: hasOwn(body, "waSendMultipleOverdueNotice")
          ? body.waSendMultipleOverdueNotice === true
          : currentConfig?.wa_send_multiple_overdue_notice === true,
        wa_multiple_overdue_min_installments: Math.max(
          hasOwn(body, "waMultipleOverdueMinInstallments")
            ? Number(body.waMultipleOverdueMinInstallments || 2)
            : Number(currentConfig?.wa_multiple_overdue_min_installments ?? 2),
          2,
        ),
        wa_multiple_overdue_template:
          (hasOwn(body, "waMultipleOverdueTemplate")
            ? trimOrNull(body.waMultipleOverdueTemplate)
            : trimOrNull(currentConfig?.wa_multiple_overdue_template)) ||
          "Ola, {{nome_aluno}}!\n\nIdentificamos parcelas pendentes em seu cadastro.\n\n*Quantidade:* {{quantidade_parcelas}}\n*Valor total:* {{valor_total_atrasado}}\n*Curso:* {{nome_curso}}\n*Turma:* {{nome_turma}}\n*CPF final:* {{cpf_final}}\n\nPara regularizar sua situacao, responda a esta mensagem. Nossa equipe verificara as opcoes disponiveis.\n\nCaso o pagamento ja tenha sido realizado, desconsidere este aviso.\n\nEquipe Universo Cursos e Consultoria.",
        wa_due_notice_modalities: normalizeModalities(
          hasOwn(body, "waDueNoticeModalities")
            ? body.waDueNoticeModalities
            : currentConfig?.wa_due_notice_modalities,
        ),
        wa_payment_receipt_modalities: normalizeModalities(
          hasOwn(body, "waPaymentReceiptModalities")
            ? body.waPaymentReceiptModalities
            : currentConfig?.wa_payment_receipt_modalities,
        ),
        wa_overdue_notice_modalities: normalizeModalities(
          hasOwn(body, "waOverdueNoticeModalities")
            ? body.waOverdueNoticeModalities
            : currentConfig?.wa_overdue_notice_modalities,
        ),
        wa_multiple_overdue_modalities: normalizeModalities(
          hasOwn(body, "waMultipleOverdueModalities")
            ? body.waMultipleOverdueModalities
            : currentConfig?.wa_multiple_overdue_modalities,
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
