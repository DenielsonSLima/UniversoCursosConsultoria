import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireGestorAtivo, requireGestorGlobal } from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";

type Environment = "sandbox" | "production";
type PaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
type Modalidade = "EAD" | "TECNICO" | "LIVRE" | "ESPECIALIZACAO" | "OUTROS_CREDITOS";
type ProviderCode = "asaas" | "mercado_pago" | "banese_card";

const GESTOR_ACTIONS = new Set([
  "get-overview",
  "save-credential",
  "save-route",
  "test-connection",
]);

const GLOBAL_ACTIONS = new Set([
  "save-credential",
  "save-route",
  "test-connection",
]);

const PROVIDERS: Record<ProviderCode, {
  supports: PaymentMethod[];
}> = {
  asaas: {
    supports: ["PIX", "BOLETO", "CREDIT_CARD"],
  },
  mercado_pago: {
    supports: ["PIX", "BOLETO", "CREDIT_CARD"],
  },
  banese_card: {
    supports: ["PIX", "BOLETO"],
  },
};

const normalizeEnvironment = (value: unknown): Environment =>
  value === "production" ? "production" : "sandbox";

const normalizeProviderCode = (value: unknown): ProviderCode => {
  const code = String(value || "").trim().toLowerCase();
  if (code === "asaas" || code === "mercado_pago" || code === "banese_card") return code;
  throw new Error("Provedor bancario invalido.");
};

const normalizeMethod = (value: unknown): PaymentMethod => {
  const method = String(value || "").trim().toUpperCase();
  if (method === "PIX" || method === "BOLETO" || method === "CREDIT_CARD") return method;
  if (method === "CARTAO" || method === "CARTÃO") return "CREDIT_CARD";
  throw new Error("Forma de pagamento invalida.");
};

const normalizeModalidade = (value: unknown): Modalidade => {
  const modalidade = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    modalidade === "EAD"
    || modalidade === "TECNICO"
    || modalidade === "LIVRE"
    || modalidade === "ESPECIALIZACAO"
    || modalidade === "OUTROS_CREDITOS"
  ) {
    return modalidade;
  }
  throw new Error("Modalidade invalida.");
};

const secretName = (providerCode: ProviderCode, environment: Environment, kind: string) =>
  `payment_gateway_${providerCode}_${environment}_${kind}`;

const asaasApiSecretName = (environment: Environment) =>
  environment === "production" ? "asaas_production_api_key" : "asaas_sandbox_api_key";

const asaasWebhookSecretName = (environment: Environment) =>
  environment === "production" ? "asaas_production_webhook_token" : "asaas_sandbox_webhook_token";

const asaasBaseUrl = (environment: Environment) =>
  environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

const webhookUrlFor = (supabaseUrl: string, providerCode: ProviderCode) => {
  if (providerCode === "asaas") return `${supabaseUrl}/functions/v1/asaas-webhook`;
  return `${supabaseUrl}/functions/v1/payment-gateway-webhook/${providerCode}`;
};

const credentialWebhookUrlFor = (supabaseUrl: string, providerCode: ProviderCode, environment: Environment) => {
  const baseUrl = webhookUrlFor(supabaseUrl, providerCode);
  if (providerCode === "asaas") return baseUrl;
  return `${baseUrl}?environment=${environment}`;
};

const extractSecretInput = (body: any) => ({
  api_key: String(body.apiKey || "").trim(),
  access_token: String(body.accessToken || "").trim(),
  public_key: String(body.publicKey || "").trim(),
  client_id: String(body.clientId || "").trim(),
  client_secret: String(body.clientSecret || "").trim(),
  crt_access_token: String(body.crtAccessToken || "").trim(),
  webhook_secret: String(body.webhookSecret || "").trim(),
  webhook_token: String(body.webhookToken || "").trim(),
});

const pickMetadata = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const allowed = [
    "walletId",
    "merchantId",
    "baneseConvenio",
    "baneseBoletoConvenio",
    "baneseBeneficiarioInscricao",
    "banesePixConvenio",
    "banesePixChave",
    "baneseCarteira",
    "baneseAgencia",
    "baneseConta",
    "notes",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => raw[key] !== undefined)
      .map((key) => [key, raw[key]]),
  );
};

const getCredential = async (admin: any, providerCode: ProviderCode, environment: Environment) => {
  const { data, error } = await admin
    .from("payment_gateway_credentials")
    .select("*")
    .eq("provider_code", providerCode)
    .eq("environment", environment)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const getGenericSecret = async (admin: any, providerCode: ProviderCode, environment: Environment, kind: string) => {
  const { data, error } = await admin.rpc("payment_gateway_get_secret", {
    p_secret_name: secretName(providerCode, environment, kind),
  });
  if (error) throw error;
  return data as string | null;
};

const setGenericSecret = async (admin: any, providerCode: ProviderCode, environment: Environment, kind: string, value: string) => {
  const { error } = await admin.rpc("payment_gateway_set_secret", {
    p_secret_name: secretName(providerCode, environment, kind),
    p_secret_value: value,
  });
  if (error) throw error;
};

const setAsaasLegacySecret = async (admin: any, environment: Environment, kind: "api_key" | "webhook_token", value: string) => {
  const name = kind === "api_key" ? asaasApiSecretName(environment) : asaasWebhookSecretName(environment);
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

const getAsaasLegacySecret = async (admin: any, environment: Environment, kind: "api_key" | "webhook_token") => {
  const name = kind === "api_key" ? asaasApiSecretName(environment) : asaasWebhookSecretName(environment);
  const { data, error } = await admin.rpc("asaas_get_secret", { p_secret_name: name });
  if (error) throw error;
  return data as string | null;
};

const hasAsaasLegacySecret = async (admin: any, environment: Environment, kind: "api_key" | "webhook_token") => {
  const value = await getAsaasLegacySecret(admin, environment, kind).catch(() => null);
  return Boolean(String(value || "").trim());
};

const mergeAsaasLegacyCredential = async (admin: any, credential: any) => {
  if (credential?.provider_code !== "asaas") return credential;
  const environment = normalizeEnvironment(credential.environment);
  const apiKeyConfigured = credential.api_key_configured === true
    || await hasAsaasLegacySecret(admin, environment, "api_key");
  const webhookSecretConfigured = credential.webhook_secret_configured === true
    || await hasAsaasLegacySecret(admin, environment, "webhook_token");

  return {
    ...credential,
    configured: apiKeyConfigured && webhookSecretConfigured,
    api_key_configured: apiKeyConfigured,
    webhook_secret_configured: webhookSecretConfigured,
  };
};

const metadataHasValue = (metadata: Record<string, unknown> | undefined, key: string) =>
  String(metadata?.[key] || "").trim().length > 0;

const metadataHasFlag = (metadata: Record<string, unknown> | undefined, key: string) =>
  metadata?.[key] === true;

const isCredentialConfiguredForProvider = (
  providerCode: ProviderCode,
  credential: any,
) => {
  if (!credential) return false;
  const metadata = credential.metadata || {};

  if (providerCode === "asaas") {
    return credential.api_key_configured === true
      && credential.webhook_secret_configured === true;
  }

  if (providerCode === "mercado_pago") {
    return credential.access_token_configured === true
      && credential.public_key_configured === true
      && credential.webhook_secret_configured === true;
  }

  return credential.client_id_configured === true
    && credential.client_secret_configured === true
    && (metadataHasValue(metadata, "baneseBoletoConvenio") || metadataHasValue(metadata, "baneseConvenio"))
    && metadataHasValue(metadata, "banesePixConvenio")
    && metadataHasValue(metadata, "banesePixChave")
    && metadataHasFlag(metadata, "baneseCrtAccessTokenConfigured");
};

const isCredentialConfiguredForRoute = async (
  admin: any,
  providerCode: ProviderCode,
  environment: Environment,
  paymentMethod: PaymentMethod,
  credential: any,
) => {
  const checkedCredential = providerCode === "asaas" && credential
    ? await mergeAsaasLegacyCredential(admin, credential)
    : credential;
  if (!checkedCredential) return false;
  const metadata = checkedCredential.metadata || {};

  if (providerCode === "asaas") {
    return checkedCredential.api_key_configured === true
      && checkedCredential.webhook_secret_configured === true;
  }

  if (providerCode === "mercado_pago") {
    return checkedCredential.access_token_configured === true
      && checkedCredential.public_key_configured === true
      && checkedCredential.webhook_secret_configured === true;
  }

  if (providerCode === "banese_card") {
    const hasOauth = checkedCredential.client_id_configured === true
      && checkedCredential.client_secret_configured === true;
    if (!hasOauth) return false;
    if (paymentMethod === "BOLETO") {
      return metadataHasValue(metadata, "baneseBoletoConvenio")
        || metadataHasValue(metadata, "baneseConvenio");
    }
    if (paymentMethod === "PIX") {
      return metadataHasValue(metadata, "banesePixConvenio")
        && metadataHasValue(metadata, "banesePixChave")
        && metadataHasFlag(metadata, "baneseCrtAccessTokenConfigured");
    }
  }

  return false;
};

const updateAsaasLegacyConfig = async (
  admin: any,
  environment: Environment,
  metadata: Record<string, unknown>,
  result: { status: string; message: string },
) => {
  const { data: config, error: configError } = await admin
    .from("asaas_config")
    .select("id, notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled")
    .maybeSingle();
  if (configError) throw configError;

  const walletId = typeof metadata.walletId === "string" ? metadata.walletId : null;
  const { error } = await admin.from("asaas_config").upsert({
    id: config?.id || "a1111111-1111-1111-1111-111111111111",
    environment,
    wallet_id: walletId,
    api_key: null,
    configured: result.status === "OK",
    notifications_enabled: config?.notifications_enabled === true,
    notification_whatsapp_enabled: config?.notification_whatsapp_enabled === true,
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
  const response = await fetch(`${asaasBaseUrl(environment)}/customers?limit=1`, {
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "O Asaas recusou a chave informada.");
  }
  return { status: "OK", message: "Conexao validada com sucesso." };
};

const testMercadoPago = async (accessToken: string) => {
  const response = await fetch("https://api.mercadopago.com/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "O Mercado Pago recusou o token informado.");
  }
  return { status: "OK", message: "Conexao validada com sucesso." };
};

const testProvider = async (
  admin: any,
  providerCode: ProviderCode,
  environment: Environment,
  providedSecrets: Record<string, string> = {},
) => {
  if (providerCode === "asaas") {
    const apiKey = providedSecrets.api_key || await getGenericSecret(admin, providerCode, environment, "api_key") || await getAsaasLegacySecret(admin, environment, "api_key");
    if (!apiKey) throw new Error("Informe a chave de API do Asaas.");
    return testAsaas(apiKey, environment);
  }

  if (providerCode === "mercado_pago") {
    const accessToken = providedSecrets.access_token || await getGenericSecret(admin, providerCode, environment, "access_token");
    if (!accessToken) throw new Error("Informe o access token do Mercado Pago.");
    return testMercadoPago(accessToken);
  }

  const clientId = providedSecrets.client_id || await getGenericSecret(admin, providerCode, environment, "client_id");
  const clientSecret = providedSecrets.client_secret || await getGenericSecret(admin, providerCode, environment, "client_secret");
  if (!clientId || !clientSecret) throw new Error("Informe Client ID e Client Secret do Banese Card.");
  return {
    status: "PENDING_MANUAL",
    message: "Credenciais armazenadas. A homologacao Banese deve ser validada com o manual/contrato credenciado.",
  };
};

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (isRateLimitExceeded(`payment-gateway-api:${getClientIp(req)}`, 180, 60000)) {
    return new Response(JSON.stringify({ error: "Muitas requisicoes em curto periodo. Aguarde alguns instantes." }), {
      status: 429,
      headers: { ...corsHeadersForRequest, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersForRequest });
  if (req.method !== "POST") return respondJson({ error: "Metodo nao permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const gestor = GESTOR_ACTIONS.has(action) ? await requireGestorAtivo(req, admin) : null;
    if (gestor && GLOBAL_ACTIONS.has(action)) requireGestorGlobal(gestor);

    if (action === "get-overview") {
      const [providersResult, credentialsResult, routesResult, configResult] = await Promise.all([
        admin.from("payment_gateway_providers").select("*").order("name", { ascending: true }),
        admin.from("payment_gateway_credentials").select("*").order("provider_code", { ascending: true }).order("environment", { ascending: true }),
        admin.from("payment_gateway_routes").select("*").order("modalidade", { ascending: true }).order("payment_method", { ascending: true }).order("environment", { ascending: true }),
        admin.from("asaas_config").select("environment").maybeSingle(),
      ]);
      if (providersResult.error) throw providersResult.error;
      if (credentialsResult.error) throw credentialsResult.error;
      if (routesResult.error) throw routesResult.error;
      if (configResult.error) throw configResult.error;

      const credentials = await Promise.all((credentialsResult.data || []).map(async (credential: any) => {
        const mergedCredential = await mergeAsaasLegacyCredential(admin, credential);
        return {
          ...mergedCredential,
          webhook_url: mergedCredential.webhook_url || credentialWebhookUrlFor(
            supabaseUrl,
            mergedCredential.provider_code,
            mergedCredential.environment,
          ),
        };
      }));

      return respondJson({
        providers: providersResult.data || [],
        credentials,
        routes: routesResult.data || [],
        activeEnvironment: normalizeEnvironment(configResult.data?.environment),
        webhookUrls: {
          asaas: webhookUrlFor(supabaseUrl, "asaas"),
          mercado_pago: webhookUrlFor(supabaseUrl, "mercado_pago"),
          banese_card: webhookUrlFor(supabaseUrl, "banese_card"),
        },
      });
    }

    if (action === "save-credential") {
      const providerCode = normalizeProviderCode(body.providerCode);
      const environment = normalizeEnvironment(body.environment);
      const metadata = pickMetadata(body.metadata);
      const current = await getCredential(admin, providerCode, environment);
      const checkedCurrent = current ? await mergeAsaasLegacyCredential(admin, current) : current;
      const secrets = extractSecretInput(body);
      const currentMetadata = current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata
        : {};
      const metadataWithSecretFlags = {
        ...metadata,
        ...(secrets.crt_access_token ? { baneseCrtAccessTokenConfigured: true } : {}),
      };

      const nextFlags = {
        api_key_configured: checkedCurrent?.api_key_configured === true,
        access_token_configured: checkedCurrent?.access_token_configured === true,
        public_key_configured: checkedCurrent?.public_key_configured === true,
        client_id_configured: checkedCurrent?.client_id_configured === true,
        client_secret_configured: checkedCurrent?.client_secret_configured === true,
        webhook_secret_configured: checkedCurrent?.webhook_secret_configured === true,
      };

      for (const [kind, value] of Object.entries(secrets)) {
        if (!value) continue;
        if (kind === "api_key") nextFlags.api_key_configured = true;
        if (kind === "access_token") nextFlags.access_token_configured = true;
        if (kind === "public_key") nextFlags.public_key_configured = true;
        if (kind === "client_id") nextFlags.client_id_configured = true;
        if (kind === "client_secret") nextFlags.client_secret_configured = true;
        if (kind === "webhook_secret" || kind === "webhook_token") nextFlags.webhook_secret_configured = true;
      }

      const nextMetadata = {
        ...currentMetadata,
        ...metadataWithSecretFlags,
      };
      const configured = isCredentialConfiguredForProvider(providerCode, {
        ...nextFlags,
        metadata: nextMetadata,
      });

      const testResult = configured
        ? await testProvider(admin, providerCode, environment, secrets)
        : { status: "PENDING", message: "Credenciais salvas parcialmente." };

      for (const [kind, value] of Object.entries(secrets)) {
        if (!value) continue;
        await setGenericSecret(admin, providerCode, environment, kind, value);
        if (providerCode === "asaas" && kind === "api_key") {
          await setAsaasLegacySecret(admin, environment, "api_key", value);
        }
        if (providerCode === "asaas" && (kind === "webhook_token" || kind === "webhook_secret")) {
          await setAsaasLegacySecret(admin, environment, "webhook_token", value);
        }
      }

      const { data, error } = await admin
        .from("payment_gateway_credentials")
        .upsert({
          id: current?.id,
          provider_code: providerCode,
          environment,
          label: body.label || current?.label || null,
          configured,
          ...nextFlags,
          webhook_url: body.webhookUrl || credentialWebhookUrlFor(supabaseUrl, providerCode, environment),
          metadata: nextMetadata,
          last_test_at: new Date().toISOString(),
          last_test_status: testResult.status,
          last_test_message: testResult.message,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      if (providerCode === "asaas") {
        await updateAsaasLegacyConfig(admin, environment, metadata, testResult);
      }

      return respondJson({
        success: true,
        credential: {
          ...data,
          webhook_url: data.webhook_url || credentialWebhookUrlFor(supabaseUrl, providerCode, environment),
        },
      });
    }

    if (action === "save-route") {
      const providerCode = normalizeProviderCode(body.providerCode);
      const environment = normalizeEnvironment(body.environment);
      const modalidade = normalizeModalidade(body.modalidade);
      const paymentMethod = normalizeMethod(body.paymentMethod);

      if (!PROVIDERS[providerCode].supports.includes(paymentMethod)) {
        throw new Error("Este provedor nao atende a forma de pagamento selecionada.");
      }

      let credentialId = body.credentialId ? String(body.credentialId) : null;
      let configuredCredential: any = null;
      if (credentialId) {
        const { data: credential, error: credentialError } = await admin
          .from("payment_gateway_credentials")
          .select("*")
          .eq("id", credentialId)
          .maybeSingle();
        if (credentialError) throw credentialError;
        if (!credential || credential.provider_code !== providerCode || credential.environment !== environment) {
          throw new Error("A credencial selecionada nao pertence a este provedor e ambiente.");
        }
        configuredCredential = credential;
      } else {
        const credential = await getCredential(admin, providerCode, environment);
        configuredCredential = credential;
        credentialId = credential?.id || null;
      }
      const credentialConfigured = await isCredentialConfiguredForRoute(
        admin,
        providerCode,
        environment,
        paymentMethod,
        configuredCredential,
      );
      if (!configuredCredential?.id || !credentialConfigured) {
        throw new Error("Cadastre as chaves deste provedor e ambiente antes de ativar a rota.");
      }

      const { data, error } = await admin
        .from("payment_gateway_routes")
        .upsert({
          modalidade,
          payment_method: paymentMethod,
          environment,
          provider_code: providerCode,
          credential_id: credentialId,
          enabled: body.enabled !== false,
          notes: body.notes || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "modalidade,payment_method,environment",
        })
        .select()
        .single();
      if (error) throw error;
      return respondJson({ success: true, route: data });
    }

    if (action === "test-connection") {
      const providerCode = normalizeProviderCode(body.providerCode);
      const environment = normalizeEnvironment(body.environment);
      const secrets = extractSecretInput(body);
      const result = await testProvider(admin, providerCode, environment, secrets);
      const current = await getCredential(admin, providerCode, environment);
      if (current?.id) {
        const { error } = await admin
          .from("payment_gateway_credentials")
          .update({
            last_test_at: new Date().toISOString(),
            last_test_status: result.status,
            last_test_message: result.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", current.id);
        if (error) throw error;
      }
      return respondJson({ success: true, ...result });
    }

    return respondJson({ error: "Acao nao reconhecida." }, 400);
  } catch (error) {
    console.error("Erro na integracao bancaria:", error);
    return respondJson({ error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
