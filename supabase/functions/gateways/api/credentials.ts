import {
  type Environment,
  type PaymentMethod,
  type ProviderCode,
  normalizeEnvironment,
} from "./config.ts";

const secretName = (
  providerCode: ProviderCode,
  environment: Environment,
  kind: string,
) => `payment_gateway_${providerCode}_${environment}_${kind}`;

const asaasApiSecretName = (environment: Environment) =>
  environment === "production"
    ? "asaas_production_api_key"
    : "asaas_sandbox_api_key";

const asaasWebhookSecretName = (environment: Environment) =>
  environment === "production"
    ? "asaas_production_webhook_token"
    : "asaas_sandbox_webhook_token";

const asaasBaseUrl = (environment: Environment) =>
  environment === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

export const getCredential = async (
  admin: any,
  providerCode: ProviderCode,
  environment: Environment,
) => {
  const { data, error } = await admin
    .from("payment_gateway_credentials")
    .select("*")
    .eq("provider_code", providerCode)
    .eq("environment", environment)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const getGatewaySecret = async (
  admin: any,
  providerCode: ProviderCode,
  environment: Environment,
  kind: string,
) => {
  const { data, error } = await admin.rpc("payment_gateway_get_secret", {
    p_secret_name: secretName(providerCode, environment, kind),
  });
  if (error) throw error;
  return data as string | null;
};

export const setGatewaySecret = async (
  admin: any,
  providerCode: ProviderCode,
  environment: Environment,
  kind: string,
  value: string,
) => {
  const { error } = await admin.rpc("payment_gateway_set_secret", {
    p_secret_name: secretName(providerCode, environment, kind),
    p_secret_value: value,
  });
  if (error) throw error;
};

export const setAsaasLegacySecret = async (
  admin: any,
  environment: Environment,
  kind: "api_key" | "webhook_token",
  value: string,
) => {
  const name = kind === "api_key"
    ? asaasApiSecretName(environment)
    : asaasWebhookSecretName(environment);
  const { error } = await admin.rpc("asaas_set_secret", {
    p_secret_name: name,
    p_secret_value: value,
  });
  if (error) throw error;
  if (environment === "sandbox" && kind === "webhook_token") {
    const { error: legacyError } = await admin.rpc("asaas_set_secret", {
      p_secret_name: "asaas_webhook_token",
      p_secret_value: value,
    });
    if (legacyError) throw legacyError;
  }
};

const getAsaasLegacySecret = async (
  admin: any,
  environment: Environment,
  kind: "api_key" | "webhook_token",
) => {
  const name = kind === "api_key"
    ? asaasApiSecretName(environment)
    : asaasWebhookSecretName(environment);
  const { data, error } = await admin.rpc("asaas_get_secret", {
    p_secret_name: name,
  });
  if (error) throw error;
  return data as string | null;
};

const hasAsaasLegacySecret = async (
  admin: any,
  environment: Environment,
  kind: "api_key" | "webhook_token",
) => {
  const value = await getAsaasLegacySecret(admin, environment, kind).catch(() =>
    null
  );
  return Boolean(String(value || "").trim());
};

export const mergeAsaasLegacyCredential = async (
  admin: any,
  credential: any,
) => {
  if (credential?.provider_code !== "asaas") return credential;
  const environment = normalizeEnvironment(credential.environment);
  const apiKeyConfigured = credential.api_key_configured === true ||
    await hasAsaasLegacySecret(admin, environment, "api_key");
  const webhookSecretConfigured =
    credential.webhook_secret_configured === true ||
    await hasAsaasLegacySecret(admin, environment, "webhook_token");

  return {
    ...credential,
    configured: apiKeyConfigured && webhookSecretConfigured,
    api_key_configured: apiKeyConfigured,
    webhook_secret_configured: webhookSecretConfigured,
  };
};

export const isCredentialConfiguredForProvider = (
  providerCode: ProviderCode,
  credential: any,
) => {
  if (!credential) return false;
  if (providerCode === "asaas") {
    return credential.api_key_configured === true &&
      credential.webhook_secret_configured === true;
  }
  if (providerCode === "mercado_pago") {
    return credential.access_token_configured === true &&
      credential.public_key_configured === true &&
      credential.webhook_secret_configured === true;
  }
  return false;
};

export const isCredentialConfiguredForRoute = async (
  admin: any,
  providerCode: ProviderCode,
  _environment: Environment,
  _paymentMethod: PaymentMethod,
  credential: any,
) => {
  const checkedCredential = providerCode === "asaas" && credential
    ? await mergeAsaasLegacyCredential(admin, credential)
    : credential;
  return isCredentialConfiguredForProvider(providerCode, checkedCredential);
};

export const updateAsaasLegacyConfig = async (
  admin: any,
  environment: Environment,
  metadata: Record<string, unknown>,
  result: { status: string; message: string },
) => {
  const { data: config, error: configError } = await admin
    .from("asaas_config")
    .select(
      "id, notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled",
    )
    .maybeSingle();
  if (configError) throw configError;

  const walletId = typeof metadata.walletId === "string"
    ? metadata.walletId
    : null;
  const { error } = await admin.from("asaas_config").upsert({
    id: config?.id || "a1111111-1111-1111-1111-111111111111",
    environment,
    wallet_id: walletId,
    api_key: null,
    configured: result.status === "OK",
    notifications_enabled: config?.notifications_enabled === true,
    notification_whatsapp_enabled:
      config?.notification_whatsapp_enabled === true,
    notification_email_enabled: config?.notification_email_enabled === true,
    notification_sms_enabled: config?.notification_sms_enabled === true,
    last_test_at: new Date().toISOString(),
    last_test_status: result.status,
    last_test_message: result.message,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
};

const testAsaas = async (apiKey: string, environment: Environment) => {
  const response = await fetch(
    `${asaasBaseUrl(environment)}/customers?limit=1`,
    {
      headers: {
        "Content-Type": "application/json",
        access_token: apiKey,
      },
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "O Asaas recusou a chave informada.");
  }
  return { status: "OK", message: "Conexao validada com sucesso." };
};

const testMercadoPago = async (accessToken: string) => {
  const response = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "O Mercado Pago recusou o token informado.");
  }
  return { status: "OK", message: "Conexao validada com sucesso." };
};

export const testProvider = async (
  admin: any,
  providerCode: ProviderCode,
  environment: Environment,
  providedSecrets: Record<string, string> = {},
) => {
  if (providerCode === "asaas") {
    const apiKey = providedSecrets.api_key ||
      await getGatewaySecret(admin, providerCode, environment, "api_key") ||
      await getAsaasLegacySecret(admin, environment, "api_key");
    if (!apiKey) throw new Error("Informe a chave de API do Asaas.");
    return testAsaas(apiKey, environment);
  }

  if (providerCode === "mercado_pago") {
    const accessToken = providedSecrets.access_token ||
      await getGatewaySecret(admin, providerCode, environment, "access_token");
    if (!accessToken) {
      throw new Error("Informe o access token do Mercado Pago.");
    }
    return testMercadoPago(accessToken);
  }

  const clientId = providedSecrets.client_id ||
    await getGatewaySecret(admin, providerCode, environment, "client_id");
  const clientSecret = providedSecrets.client_secret ||
    await getGatewaySecret(admin, providerCode, environment, "client_secret");
  if (!clientId || !clientSecret) {
    throw new Error("Informe Client ID e Client Secret do Banese.");
  }
  return {
    status: "PENDING_MANUAL",
    message:
      "Credenciais armazenadas. Pix/Boleto Banese precisam de homologacao manual antes de ativar checkout real.",
  };
};
