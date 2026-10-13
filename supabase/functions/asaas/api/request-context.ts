import { createAsaasBillingService } from "./billing.service.ts";
import { createAsaasCarnetService } from "./carnet.service.ts";
import { createAsaasOnlineService } from "./online.service.ts";
import { requireGestorForPolo, type GestorAutorizado } from "./authz.ts";
import { assertStoredProviderAdapterReady, normalizeProviderCode } from "../../gateways/api/config.ts";
import { getCredential, isCredentialConfiguredForRoute } from "../../gateways/api/credentials.ts";
import { buildEnrollmentReceivablePaymentPatch } from "./gateway-routing-guard.ts";
import { resolveExistingAsaasEnvironment } from "./receivable-runtime.ts";
import { apiSecretName, baseUrlFor, normalizeEnvironment, UUID_RE, webhookSecretName } from "./shared.ts";
import type { Environment } from "./shared.ts";

export type AsaasApiResponder = (body: unknown, status?: number) => Response;

export function createAsaasApiContext(admin: any, body: any, gestor: GestorAutorizado | null, supabaseUrl: string) {
  const getConfig = async () => {
    const { data, error } = await admin
      .from("asaas_config")
      .select(
        "id, environment, wallet_id, configured, last_test_at, last_test_status, last_test_message, notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled",
      )
      .maybeSingle();
    if (error) throw error;
    return data || {
      id: "a1111111-1111-1111-1111-111111111111",
      environment: "sandbox",
      wallet_id: null,
      configured: false,
      notifications_enabled: false,
      notification_whatsapp_enabled: false,
      notification_email_enabled: false,
      notification_sms_enabled: false,
    };
  };

  const anyNotificationChannelEnabled = (config: any) =>
    config?.notification_whatsapp_enabled === true ||
    config?.notification_email_enabled === true ||
    config?.notification_sms_enabled === true ||
    config?.notifications_enabled === true;

  const getSecret = async (name: string) => {
    const { data, error } = await admin.rpc("asaas_get_secret", {
      p_secret_name: name,
    });
    if (error) throw error;
    return data as string | null;
  };

  const getWebhookToken = async (environment: Environment) => {
    const token = await getSecret(webhookSecretName(environment));
    if (token || environment === "production") return token;
    return getSecret("asaas_webhook_token");
  };

  const ensureWebhookToken = async (environment: Environment) => {
    const existing = await getWebhookToken(environment);
    if (existing) return existing;

    const token =
      `universo-${environment}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const { error } = await admin.rpc("asaas_set_secret", {
      p_secret_name: webhookSecretName(environment),
      p_secret_value: token,
    });
    if (error) throw error;
    if (environment === "sandbox") {
      const { error: legacyError } = await admin.rpc("asaas_set_secret", {
        p_secret_name: "asaas_webhook_token",
        p_secret_value: token,
      });
      if (legacyError) throw legacyError;
    }
    return token;
  };

  const getGatewayRuntime = async (requestedEnvironment?: Environment) => {
    const config = await getConfig();
    const environment = requestedEnvironment ||
      normalizeEnvironment(config.environment);
    const apiKey = await getSecret(apiSecretName(environment));
    return {
      config,
      apiKey: apiKey || "",
      environment,
      baseUrl: baseUrlFor(environment),
    };
  };

  const getRuntime = async (requestedEnvironment?: Environment) => {
    const runtime = await getGatewayRuntime(requestedEnvironment);
    const { apiKey, environment } = runtime;
    if (!apiKey) {
      throw new Error(
        `A chave do ambiente ${environment} ainda não foi configurada.`,
      );
    }
    return runtime;
  };

  type EnrollmentPaymentOptionCandidate = {
    paymentMethod: "PIX" | "BOLETO" | "CREDIT_CARD";
    providerCode: "asaas" | "mercado_pago" | "banco_inter" | "banese_card";
    credentialId: string;
    environment: Environment;
  };

  const normalizedEnvironmentLabel = (environment: Environment) =>
    environment === "production" ? "producao" : "sandbox";

  const paymentMethodPreferredEnvironments = (
    paymentMethod: EnrollmentPaymentOptionCandidate["paymentMethod"],
  ): Environment[] =>
    paymentMethod === "CREDIT_CARD"
      ? ["sandbox", "production"]
      : ["production", "sandbox"];

  const resolveEnrollmentPaymentOption = async (
    modalidade: string,
    paymentMethod: EnrollmentPaymentOptionCandidate["paymentMethod"],
    strict = false,
  ): Promise<EnrollmentPaymentOptionCandidate | null> => {
    const { data: routesData, error } = await admin
      .from("payment_gateway_routes")
      .select("provider_code, credential_id, enabled, environment")
      .eq("modalidade", modalidade)
      .eq("payment_method", paymentMethod)
      .neq("enabled", false);
    if (error) throw error;

    const routes = (routesData || []).map((route: any) => ({
      ...route,
      environment: normalizeEnvironment(route?.environment),
    }));
    const availableEnvironments = [
      ...new Set<Environment>(routes.map((route: any) => route.environment)),
    ].map((value) => normalizedEnvironmentLabel(value));

    for (const environment of paymentMethodPreferredEnvironments(paymentMethod)) {
      const envRoutes = routes.filter(
        (route: any) => route.environment === environment,
      );
      if (envRoutes.length === 0) continue;
      if (envRoutes.length > 1) {
        throw new Error(
          `Configuracao duplicada para ${paymentMethod} de ${modalidade} em ${
            normalizedEnvironmentLabel(environment)
          }. Corrija para manter apenas uma rota ativa por ambiente.`,
        );
      }

      const route = envRoutes[0];
      try {
        assertStoredProviderAdapterReady(
          route.provider_code,
          paymentMethod,
          route.environment,
        );

        let credentialData: any = null;
        if (route.credential_id) {
          const { data, error } = await admin
            .from("payment_gateway_credentials")
            .select("*")
            .eq("id", route.credential_id)
            .maybeSingle();
          if (error) throw error;
          if (
            data?.provider_code === route.provider_code &&
            normalizeEnvironment(data?.environment) === route.environment
          ) {
            credentialData = data;
          }
        }
        if (!credentialData) {
          credentialData = await getCredential(
            admin,
            route.provider_code,
            route.environment,
          );
        }
        if (
          !credentialData?.id ||
          credentialData.provider_code !== route.provider_code ||
          normalizeEnvironment(credentialData.environment) !== route.environment ||
          !await isCredentialConfiguredForRoute(
            admin,
            route.provider_code,
            route.environment,
            paymentMethod,
            credentialData,
          )
        ) {
          if (strict) {
            throw new Error(
              `Rota ${paymentMethod} de ${modalidade} em ${
                normalizedEnvironmentLabel(environment)
              } nao possui credencial pronta.`,
            );
          }
          continue;
        }

        return {
          paymentMethod,
          providerCode: normalizeProviderCode(route.provider_code),
          credentialId: credentialData.id,
          environment,
        };
      } catch (error) {
        if (!strict) {
          continue;
        }
        throw error instanceof Error
          ? error
          : new Error("Nao foi possivel validar a rota bancaria.");
      }
    }

    if (strict) {
      throw new Error(
        `Rota ${paymentMethod} de ${modalidade} nao esta ativa. ${
          availableEnvironments.length > 0
            ? `Rota ativa em: ${availableEnvironments.join(", ")}.`
            : "Nao foram encontradas rotas ativas."
        }`,
      );
    }
    return null;
  };

  const billing = createAsaasBillingService(
    admin,
    anyNotificationChannelEnabled,
  );
  const {
    mapBillingType,
    refreshReceivableStatus,
    syncReceivable,
  } = billing;
  const online = createAsaasOnlineService(admin, mapBillingType);
  const carnet = createAsaasCarnetService(admin, syncReceivable);

  const preflightEnrollmentCharge = async (
    turmaId: string,
    requestedPaymentMethod?: unknown,
  ) => {
    if (!UUID_RE.test(turmaId)) throw new Error("Turma inválida.");
    const { data: turma, error: turmaError } = await admin
      .from("turmas")
      .select("id, polo_id, cursos(modalidade)")
      .eq("id", turmaId)
      .maybeSingle();
    if (turmaError) throw turmaError;
    if (!turma) throw new Error("Turma não encontrada.");
    if (gestor) requireGestorForPolo(gestor, turma.polo_id);

    const course = Array.isArray(turma.cursos)
      ? turma.cursos[0]
      : turma.cursos;
    const modalidade = String(course?.modalidade || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (
      modalidade &&
      !["EAD", "TECNICO", "LIVRE", "ESPECIALIZACAO", "OUTROS_CREDITOS"]
        .includes(modalidade)
    ) {
      throw new Error(
        "A pré-validação de cobrança de matrícula não possui suporte para esta modalidade.",
      );
    }

    const requestedMethod = requestedPaymentMethod === undefined ||
      requestedPaymentMethod === null || requestedPaymentMethod === ""
      ? null
      : buildEnrollmentReceivablePaymentPatch(requestedPaymentMethod)
        .gateway_payment_method;
    const methodsToResolve: Array<
      "PIX" | "BOLETO" | "CREDIT_CARD"
    > = requestedMethod ? [requestedMethod] : ["PIX", "BOLETO", "CREDIT_CARD"];
    const options = (
      await Promise.all(
        methodsToResolve.map((method) =>
          resolveEnrollmentPaymentOption(modalidade, method, false)
        ),
      )
    )
      .filter((option): option is EnrollmentPaymentOptionCandidate =>
        option !== null
      )
      .map((option) => ({
        paymentMethod: option.paymentMethod,
        providerCode: option.providerCode,
        credentialId: option.credentialId,
        environment: option.environment,
      }));

    if (
      requestedMethod &&
      !options.some((item) => item.paymentMethod === requestedMethod)
    ) {
      const available = options.map((item) => item.paymentMethod).join(", ");
      throw new Error(
        available
          ? `O método ${requestedMethod} não possui rota ativa e credencial pronta. Disponíveis: ${available}.`
          : "Nenhum método possui rota ativa e credencial pronta para esta turma e ambiente.",
      );
    }

    const environment = options.find((item) => item.environment === "production")
      ?.environment || "sandbox";

    return { environment, modalidade, options };
  };

  const getRuntimeForAction = () =>
    getRuntime(
      body.environment ? normalizeEnvironment(body.environment) : undefined,
    );
  const getRuntimeForMovement = () => getRuntime();
  const getGatewayRuntimeForMovement = () => getGatewayRuntime();
  const getRuntimeForReceivableMovement = (receivable: any) =>
    getRuntime(resolveExistingAsaasEnvironment(receivable) || undefined);
  const getGatewayRuntimeForReceivableMovement = (receivable: any) =>
    getGatewayRuntime(
      resolveExistingAsaasEnvironment(receivable) || undefined,
    );

  return { admin, body, gestor, supabaseUrl, getConfig, getSecret, getWebhookToken,
    ensureWebhookToken, getGatewayRuntime, getRuntime, anyNotificationChannelEnabled,
    preflightEnrollmentCharge, syncReceivable, refreshReceivableStatus, online, carnet,
    getRuntimeForAction, getRuntimeForMovement, getGatewayRuntimeForMovement,
    getRuntimeForReceivableMovement, getGatewayRuntimeForReceivableMovement };
}

export type AsaasApiContext = ReturnType<typeof createAsaasApiContext>;
