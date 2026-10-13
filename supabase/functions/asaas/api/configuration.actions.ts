import { callAsaas } from "./asaas-http.ts";
import { apiSecretName, baseUrlFor, normalizeEnvironment, webhookSecretName } from "./shared.ts";

import type { AsaasApiContext, AsaasApiResponder } from "./request-context.ts";

export async function handleAsaasConfigurationAction(action: string, context: AsaasApiContext, respondJson: AsaasApiResponder): Promise<Response | null> {
  const { admin, body, supabaseUrl, preflightEnrollmentCharge, getConfig, getSecret, getWebhookToken, anyNotificationChannelEnabled, getRuntimeForAction, ensureWebhookToken } = context;
  if (action === "preflight-enrollment-charge") {
    return respondJson({
      success: true,
      ...await preflightEnrollmentCharge(
        String(body.turmaId || ""),
        body.paymentMethod,
      ),
    });
  }

  if (action === "get-config") {
    const config = await getConfig();
    const environment = normalizeEnvironment(
      body.environment || config.environment,
    );
    const apiKey = await getSecret(apiSecretName(environment));
    const webhookToken = await getWebhookToken(environment);
    return respondJson({
      ...config,
      environment,
      configured: Boolean(apiKey),
      apiConfigured: Boolean(apiKey),
      webhookConfigured: Boolean(webhookToken),
      notificationsEnabled: anyNotificationChannelEnabled(config),
      notificationWhatsappEnabled:
        config.notification_whatsapp_enabled === true,
      notificationEmailEnabled: config.notification_email_enabled === true,
      notificationSmsEnabled: config.notification_sms_enabled === true,
      webhookUrl: `${supabaseUrl}/functions/v1/asaas-webhook`,
    });
  }

  if (action === "save-config") {
    const environment = normalizeEnvironment(body.environment);
    const apiKey = String(body.apiKey || "").trim();
    const webhookToken = String(body.webhookToken || "").trim();
    const existingApiKey = await getSecret(apiSecretName(environment));
    const apiKeyToUse = apiKey || existingApiKey;
    if (!apiKeyToUse) throw new Error("Informe a chave da API.");

    await callAsaas({
      config: { environment },
      apiKey: apiKeyToUse,
      environment,
      baseUrl: baseUrlFor(environment),
    } as any, "/customers?limit=1");

    if (apiKey) {
      const { error: secretError } = await admin.rpc("asaas_set_secret", {
        p_secret_name: apiSecretName(environment),
        p_secret_value: apiKey,
      });
      if (secretError) throw secretError;
    }

    if (webhookToken) {
      const { error: webhookSecretError } = await admin.rpc(
        "asaas_set_secret",
        {
          p_secret_name: webhookSecretName(environment),
          p_secret_value: webhookToken,
        },
      );
      if (webhookSecretError) throw webhookSecretError;
      if (environment === "sandbox") {
        await admin.rpc("asaas_set_secret", {
          p_secret_name: "asaas_webhook_token",
          p_secret_value: webhookToken,
        });
      }
    }

    const config = await getConfig();
    const notificationWhatsappEnabled =
      body.notificationWhatsappEnabled === true;
    const notificationEmailEnabled = body.notificationEmailEnabled === true;
    const notificationSmsEnabled = body.notificationSmsEnabled === true;
    const { error: configError } = await admin.from("asaas_config").upsert({
      id: config.id,
      environment,
      wallet_id: body.walletId || null,
      notifications_enabled: notificationWhatsappEnabled ||
        notificationEmailEnabled || notificationSmsEnabled ||
        body.notificationsEnabled === true,
      notification_whatsapp_enabled: notificationWhatsappEnabled,
      notification_email_enabled: notificationEmailEnabled,
      notification_sms_enabled: notificationSmsEnabled,
      notifications_updated_at: new Date().toISOString(),
      api_key: null,
      configured: true,
      last_test_at: new Date().toISOString(),
      last_test_status: "OK",
      last_test_message: "Conexão validada com sucesso.",
      updated_at: new Date().toISOString(),
    });
    if (configError) throw configError;
    return respondJson({ success: true });
  }

  if (action === "save-notification-preferences") {
    const config = await getConfig();
    const notificationWhatsappEnabled =
      body.notificationWhatsappEnabled === true;
    const notificationEmailEnabled = body.notificationEmailEnabled === true;
    const notificationSmsEnabled = body.notificationSmsEnabled === true;
    const { error: configError } = await admin.from("asaas_config").upsert({
      id: config.id,
      environment: config.environment || "sandbox",
      wallet_id: config.wallet_id || null,
      configured: config.configured === true,
      notifications_enabled: notificationWhatsappEnabled ||
        notificationEmailEnabled || notificationSmsEnabled,
      notification_whatsapp_enabled: notificationWhatsappEnabled,
      notification_email_enabled: notificationEmailEnabled,
      notification_sms_enabled: notificationSmsEnabled,
      notifications_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (configError) throw configError;
    return respondJson({ success: true });
  }

  if (action === "test-connection") {
    const runtime = await getRuntimeForAction();
    await callAsaas(runtime, "/customers?limit=1");
    await admin.from("asaas_config").update({
      last_test_at: new Date().toISOString(),
      last_test_status: "OK",
      last_test_message: "Conexão validada com sucesso.",
    }).eq("id", runtime.config.id);
    return respondJson({ success: true });
  }

  if (action === "ensure-webhook") {
    const runtime = await getRuntimeForAction();
    const webhookUrl = `${supabaseUrl}/functions/v1/asaas-webhook`;
    const webhookToken = await ensureWebhookToken(runtime.environment);
    const events = [
      "PAYMENT_CREATED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_DELETED",
      "PAYMENT_REFUNDED",
      "PAYMENT_CHARGEBACK_REQUESTED",
    ];
    const payload = {
      name: `Universo Cursos - ${runtime.environment}`,
      url: webhookUrl,
      email: String(body.email || "gestor@universo.com"),
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: webhookToken,
      sendType: "SEQUENTIALLY",
      events,
    };

    const list = await callAsaas(runtime, "/webhooks?limit=100");
    const existing = (list?.data || []).find((item: any) =>
      item.url === webhookUrl
    );
    const webhook = existing
      ? await callAsaas(runtime, `/webhooks/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
      : await callAsaas(runtime, "/webhooks", {
        method: "POST",
        body: JSON.stringify(payload),
      });

    return respondJson({
      success: true,
      webhook: {
        id: webhook.id,
        url: webhook.url,
        enabled: webhook.enabled,
        interrupted: webhook.interrupted,
        events: webhook.events,
      },
    });
  }

  return null;
}
