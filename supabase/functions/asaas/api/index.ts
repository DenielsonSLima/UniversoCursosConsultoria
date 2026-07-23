import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createAsaasBillingService } from "./billing.service.ts";
import { createAsaasCarnetService } from "./carnet.service.ts";
import { createAsaasOnlineService } from "./online.service.ts";
import { callAsaas } from "./asaas-http.ts";
import {
  requireFinanceWriteAccess,
  requireGestorAtivo,
  requireGestorForPolo,
  requireGestorGlobal,
  requireOtherCreditsWriteAccess,
  requireReceivablesSettlementAccess,
} from "./authz.ts";
import type { Environment } from "./shared.ts";
import { reconcileBaneseReceivable } from "../../gateways/api/banese.ts";
import {
  assertStoredProviderAdapterReady,
  normalizeProviderCode,
} from "../../gateways/api/config.ts";
import {
  getCredential,
  isCredentialConfiguredForRoute,
} from "../../gateways/api/credentials.ts";
import {
  applyReceivableSnapshotFields,
  applyRemoteIdentitySnapshot,
  assertAsaasReceivableCancellationAllowed,
  hasRemoteTitleReference,
} from "../../gateways/checkout/remote-title-guard.ts";
import {
  buildEnrollmentReceivablePaymentPatch,
  decideEnrollmentPaymentPatch,
  resolveManualSettlementReversalGateway,
} from "./gateway-routing-guard.ts";
import { syncRouteAwareFutureInstallments } from "./route-aware-future-sync.ts";
import { executeManualSettlementAction } from "./manual-settlement.action.ts";
import {
  resolveExistingAsaasEnvironment,
  resolveExistingAsaasEnvironmentForMany,
} from "./receivable-runtime.ts";
import {
  apiSecretName,
  baseUrlFor,
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
  normalizeEnvironment,
  UUID_RE,
  webhookSecretName,
} from "./shared.ts";
import {
  createOtherCreditServerSide,
  normalizeOtherCreditRequest,
} from "./other-credit.service.ts";

const GESTOR_ACTIONS = new Set([
  "get-config",
  "save-config",
  "save-notification-preferences",
  "sync-enrollment",
  "preflight-enrollment-charge",
  "test-connection",
  "ensure-webhook",
  "reconcile-online-payment",
  "create-other-credit",
  "sync-receivable",
  "cancel-receivable",
  "generate-official-carnet",
  "refresh-receivable-status",
  "manual-settlement",
  "reverse-manual-settlement",
  "create-course-link",
]);

const GLOBAL_CONFIG_ACTIONS = new Set([
  "save-config",
  "save-notification-preferences",
  "test-connection",
  "ensure-webhook",
  "create-course-link",
]);

const FINANCE_WRITE_ACTIONS = new Set([
  "reconcile-online-payment",
  "create-other-credit",
  "sync-enrollment",
  "sync-receivable",
  "refresh-receivable-status",
  "cancel-receivable",
  "generate-official-carnet",
  "reverse-manual-settlement",
]);

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (isRateLimitExceeded(`asaas-api:${getClientIp(req)}`, 180, 60000)) {
    return new Response(
      JSON.stringify({
        error: "Muitas requisições em curto período. Aguarde alguns instantes.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeadersForRequest,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest });
  }
  if (req.method !== "POST") {
    return respondJson({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const gestor = GESTOR_ACTIONS.has(action)
      ? await requireGestorAtivo(req, admin)
      : null;
    if (gestor && GLOBAL_CONFIG_ACTIONS.has(action)) {
      requireGestorGlobal(gestor);
    }
    if (gestor && FINANCE_WRITE_ACTIONS.has(action)) {
      requireFinanceWriteAccess(gestor);
    }
    if (gestor && action === "manual-settlement") {
      requireReceivablesSettlementAccess(gestor);
    }
    if (gestor && action === "create-other-credit") {
      requireOtherCreditsWriteAccess(gestor);
    }

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
        ...new Set(routes.map((route) => route.environment)),
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
      syncFutureInstallments,
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

    if (action === "sync-enrollment") {
      const matriculaId = String(body.matriculaId || "");
      const { data: matricula, error: matriculaError } = await admin
        .from("matriculas")
        .select(`
          id,
          financeiro_herdado,
          gerar_cobranca_inicial,
          sincronizar_asaas,
          turmas(
            id,
            polo_id,
            origem_financeira,
            financeiro_herdado,
            sincronizar_asaas_futuro
          )
        `)
        .eq("id", matriculaId)
        .maybeSingle();
      if (matriculaError) throw matriculaError;
      if (!matricula) throw new Error("Matrícula não encontrada.");

      const turma = Array.isArray(matricula.turmas)
        ? matricula.turmas[0]
        : matricula.turmas;
      if (gestor) requireGestorForPolo(gestor, turma?.polo_id);
      const origem = String(turma?.origem_financeira || "NORMAL").toUpperCase();
      const financeiroHerdado = matricula.financeiro_herdado === true ||
        turma?.financeiro_herdado === true ||
        origem === "LEGADO";
      const gerarInicial = matricula.gerar_cobranca_inicial ??
        !financeiroHerdado;
      const syncEnabled = matricula.sincronizar_asaas ??
        turma?.sincronizar_asaas_futuro ?? true;

      if (gerarInicial === false) {
        return respondJson({
          success: true,
          skipped: true,
          skippedReason:
            "Cobrança inicial bloqueada por regra de financeiro legado.",
        });
      }

      const paymentPatch = buildEnrollmentReceivablePaymentPatch(
        body.paymentMethod,
      );
      let selectedEnvironment: Environment | null = null;
      if (syncEnabled !== false) {
        const preflight = await preflightEnrollmentCharge(
          String(body.turmaId || turma?.id || ""),
          body.paymentMethod,
        );
        selectedEnvironment =
          preflight.options.find((option) =>
            option.paymentMethod === paymentPatch.gateway_payment_method
          )?.environment || preflight.environment;
      }

      const { data, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("matricula_id", matriculaId)
        .eq("tipo_lancamento", "MATRICULA")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Cobrança de matrícula não encontrada.");

      const patchDecision = decideEnrollmentPaymentPatch({
        receivable: data,
        requestedMethod: body.paymentMethod,
        hasRemoteReference: hasRemoteTitleReference(data),
      });
      let updatedReceivable = data;
      if (patchDecision === "apply") {
        let updateQuery = admin
          .from("contas_receber")
          .update({
            ...paymentPatch,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id)
          .eq("status", data.status);
        updateQuery = data.forma_pagamento === null ||
            data.forma_pagamento === undefined
          ? updateQuery.is("forma_pagamento", null)
          : updateQuery.eq("forma_pagamento", data.forma_pagamento);
        updateQuery = data.gateway_payment_method === null ||
            data.gateway_payment_method === undefined
          ? updateQuery.is("gateway_payment_method", null)
          : updateQuery.eq(
            "gateway_payment_method",
            data.gateway_payment_method,
          );
        updateQuery = applyRemoteIdentitySnapshot(updateQuery, data);
        updateQuery = applyReceivableSnapshotFields(updateQuery, data, [
          "asaas_status",
          "gateway_status",
          "updated_at",
        ]);
        const { data: patchedReceivable, error: updateError } =
          await updateQuery.select().maybeSingle();
        if (updateError) throw updateError;
        if (!patchedReceivable) {
          throw new Error(
            "A cobrança mudou durante a definição do método. Atualize a tela e tente novamente.",
          );
        }
        updatedReceivable = patchedReceivable;
      }

      if (syncEnabled === false) {
        return respondJson({
          success: true,
          receivable: updatedReceivable,
          skipped: true,
          skippedReason:
            "Sincronização no gateway desativada na matrícula/turma.",
        });
      }

      if (String(updatedReceivable.status || "").toUpperCase() === "PAGO") {
        return respondJson({
          success: true,
          receivable: updatedReceivable,
          skipped: true,
          skippedReason: "Cobrança de matrícula já está paga.",
        });
      }

      const runtime = await getGatewayRuntime(selectedEnvironment || undefined);
      const receivable = await syncReceivable(runtime, updatedReceivable.id);
      return respondJson({
        success: true,
        receivable,
        skipped: receivable?.asaas_sync_skipped === true,
        skippedReason: receivable?.asaas_skip_reason || null,
      });
    }

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

    if (action === "create-other-credit") {
      const request = normalizeOtherCreditRequest(body);
      if (gestor) requireGestorForPolo(gestor, request.poloId);

      const config = await getConfig();
      const environment = normalizeEnvironment(config.environment);
      const result = await createOtherCreditServerSide({
        admin,
        environment,
        request,
        syncGateway: async (receivable) => {
          const receivableRuntime =
            await getGatewayRuntimeForReceivableMovement(
              receivable,
            );
          return syncReceivable(receivableRuntime, receivable.id);
        },
      });

      return respondJson({ success: true, ...result });
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

    if (action === "reconcile-online-payment") {
      if (gestor && !gestor.isGlobal && !gestor.poloId) {
        throw new Error(
          "Usuário financeiro sem polo definido não pode reconciliar pagamento online.",
        );
      }
      const runtime = await getRuntimeForMovement();
      return respondJson(
        await online.reconcileOnlinePayment(runtime, body, {
          poloId: gestor && !gestor.isGlobal ? gestor.poloId : null,
        }),
      );
    }

    if (action === "sync-receivable") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para sincronização.");
      }
      const { data: receivableToSync, error: receivableToSyncError } =
        await admin
          .from("contas_receber")
          .select(
            "id, polo_id, asaas_payment_id, asaas_payment_link_id, asaas_status, gateway_provider, gateway_environment, gateway_payment_id, gateway_payment_link_id, gateway_boleto_nosso_numero, gateway_status",
          )
          .eq("id", receivableId)
          .single();
      if (receivableToSyncError) throw receivableToSyncError;
      if (gestor) requireGestorForPolo(gestor, receivableToSync.polo_id);

      const runtime = await getGatewayRuntimeForReceivableMovement(
        receivableToSync,
      );
      const receivable = await syncReceivable(runtime, receivableId);
      return respondJson({ success: true, receivable });
    }

    if (action === "cancel-receivable") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para cancelamento.");
      }

      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;
      if (gestor) requireGestorForPolo(gestor, receivable.polo_id);
      assertAsaasReceivableCancellationAllowed(receivable);

      if (
        receivable.status === "PAGO" ||
        ["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)
      ) {
        throw new Error(
          "Cobranças pagas/confirmadas não podem ser canceladas por este fluxo.",
        );
      }

      const runtime = await getRuntimeForReceivableMovement(receivable);

      let asaasCanceled = false;
      let asaasDeleteStatus: number | null = null;
      let asaasPaymentLinkCanceled = false;
      let asaasPaymentLinkDeleteStatus: number | null = null;

      if (receivable.asaas_payment_id) {
        const response = await fetch(
          `${runtime.baseUrl}/payments/${receivable.asaas_payment_id}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Universo-Cursos-Gestao",
              access_token: runtime.apiKey,
            },
          },
        );
        asaasDeleteStatus = response.status;
        const payload = response.status === 204
          ? null
          : await response.json().catch(() => null);

        if (response.ok) {
          asaasCanceled = true;
        } else if (response.status === 404) {
          if (
            String(receivable.asaas_status || "").toUpperCase() !== "DELETED"
          ) {
            throw new Error(
              "Cobrança Asaas não encontrada no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.",
            );
          }
        } else {
          const message = payload?.errors?.map((item: any) =>
            item.description
          ).join(" ") ||
            payload?.message ||
            `Erro ${response.status} ao cancelar cobrança no Asaas.`;
          throw new Error(message);
        }
      }

      if (receivable.asaas_payment_link_id) {
        const response = await fetch(
          `${runtime.baseUrl}/paymentLinks/${receivable.asaas_payment_link_id}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Universo-Cursos-Gestao",
              access_token: runtime.apiKey,
            },
          },
        );
        asaasPaymentLinkDeleteStatus = response.status;
        const payload = response.status === 204
          ? null
          : await response.json().catch(() => null);

        if (response.ok) {
          asaasPaymentLinkCanceled = true;
        } else if (response.status === 404) {
          if (
            !asaasCanceled &&
            String(receivable.asaas_status || "").toUpperCase() !== "DELETED"
          ) {
            throw new Error(
              "Link de pagamento Asaas não encontrado no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.",
            );
          }
          asaasPaymentLinkCanceled = true;
        } else {
          const message = payload?.errors?.map((item: any) =>
            item.description
          ).join(" ") ||
            payload?.message ||
            `Erro ${response.status} ao remover link de pagamento no Asaas.`;
          throw new Error(message);
        }
      }

      const cancelUpdate = admin
        .from("contas_receber")
        .update({
          status: "CANCELADO",
          asaas_status: "DELETED",
          asaas_payment_link_id: null,
          nosso_numero_asaas:
            receivable.asaas_payment_link_id && !receivable.asaas_payment_id
              ? null
              : receivable.nosso_numero_asaas,
          asaas_invoice_url: null,
          asaas_bank_slip_url: null,
          asaas_transaction_receipt_url: null,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .in("status", ["PENDENTE", "VENCIDO"]);
      const { data: canceled, error: updateError } =
        await applyRemoteIdentitySnapshot(
          cancelUpdate,
          receivable,
        )
          .select()
          .maybeSingle();
      if (updateError) throw updateError;
      if (!canceled) {
        throw new Error(
          "Cobrança mudou de status antes do cancelamento. Atualize a tela e tente novamente.",
        );
      }

      return respondJson({
        success: true,
        receivable: canceled,
        asaasCanceled,
        asaasDeleteStatus,
        asaasPaymentLinkCanceled,
        asaasPaymentLinkDeleteStatus,
      });
    }

    if (action === "generate-official-carnet") {
      const receivableIds: string[] = Array.isArray(body.receivableIds)
        ? body.receivableIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];
      const uniqueReceivableIds: string[] = [...new Set(receivableIds)];
      if (!uniqueReceivableIds.length) {
        throw new Error(
          "Selecione ao menos uma cobrança para gerar o carnê oficial.",
        );
      }
      if (uniqueReceivableIds.some((id) => !UUID_RE.test(id))) {
        throw new Error("A seleção do carnê possui cobrança inválida.");
      }
      const { data: selectedReceivables, error: selectedReceivablesError } =
        await admin
          .from("contas_receber")
          .select(
            "id, polo_id, asaas_payment_id, asaas_payment_link_id, asaas_status, gateway_provider, gateway_environment, gateway_payment_id, gateway_payment_link_id, gateway_boleto_nosso_numero, gateway_status",
          )
          .in("id", uniqueReceivableIds);
      if (selectedReceivablesError) throw selectedReceivablesError;
      if ((selectedReceivables || []).length !== uniqueReceivableIds.length) {
        throw new Error(
          "Uma ou mais cobranças selecionadas não foram encontradas.",
        );
      }
      if (gestor) {
        for (const row of selectedReceivables || []) {
          requireGestorForPolo(gestor, row.polo_id);
        }
      }
      const runtime = await getRuntime(
        resolveExistingAsaasEnvironmentForMany(selectedReceivables || []) ||
          undefined,
      );
      return respondJson(
        await carnet.generateOfficialCarnet(runtime, uniqueReceivableIds),
      );
    }

    if (action === "refresh-receivable-status") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para atualização.");
      }
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;
      if (gestor) requireGestorForPolo(gestor, receivable.polo_id);
      if (receivable.gateway_provider === "banese_card") {
        const reconciliation = await reconcileBaneseReceivable(
          admin,
          receivableId,
          {
            syncFutureInstallments: (matriculaId, environment) =>
              syncRouteAwareFutureInstallments(
                admin,
                matriculaId,
                environment,
              ),
          },
        );
        return respondJson({
          success: true,
          receivable: reconciliation.receivable,
        });
      }
      const runtime = await getRuntimeForReceivableMovement(receivable);
      const refreshed = await refreshReceivableStatus(runtime, receivable);
      return respondJson({ success: true, receivable: refreshed });
    }

    if (action === "manual-settlement") {
      const result = await executeManualSettlementAction({
        admin,
        actor: gestor,
        body,
        requirePoloAccess: requireGestorForPolo,
        getAsaasRuntime: getRuntimeForReceivableMovement,
        syncFutureInstallments: async (matriculaId) => {
          const runtime = await getGatewayRuntimeForMovement();
          return await syncRouteAwareFutureInstallments(
            admin,
            matriculaId,
            runtime.environment,
          );
        },
      });
      return respondJson(result);
    }
    if (action === "reverse-manual-settlement") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para estorno.");
      }
      const recreateAsaas = body.recreateAsaas !== false;
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;
      if (gestor) requireGestorForPolo(gestor, receivable.polo_id);
      if (receivable.status !== "PAGO") {
        throw new Error("Somente cobranças pagas podem ser estornadas.");
      }
      if (receivable.origem_pagamento !== "PRESENCIAL") {
        throw new Error("Este estorno é permitido apenas para baixas manuais.");
      }

      const {
        oldAsaasPaymentId,
        oldGatewayPaymentId,
        oldGatewayPaymentLinkId,
        shouldRecreateAsaas,
        shouldRecreateBanese,
        shouldRecreateGateway,
        clearCanceledBanese,
        clearCanceledGateway,
        restoredLegacyPaymentMethod,
      } = resolveManualSettlementReversalGateway(
        receivable,
        recreateAsaas,
      );

      let reverseQuery = admin
        .from("contas_receber")
        .update({
          status: "PENDENTE",
          conta_bancaria_id: null,
          valor_pago: null,
          data_pagamento: null,
          forma_pagamento: clearCanceledGateway
            ? restoredLegacyPaymentMethod
            : null,
          origem_pagamento: shouldRecreateAsaas
            ? "ASAAS"
            : shouldRecreateBanese
            ? "BANESE"
            : "LOCAL",
          asaas_payment_id: shouldRecreateAsaas ? null : oldAsaasPaymentId,
          nosso_numero_asaas: shouldRecreateAsaas
            ? null
            : receivable.nosso_numero_asaas,
          asaas_invoice_url: shouldRecreateAsaas
            ? null
            : receivable.asaas_invoice_url,
          asaas_bank_slip_url: shouldRecreateAsaas
            ? null
            : receivable.asaas_bank_slip_url,
          asaas_transaction_receipt_url: shouldRecreateAsaas
            ? null
            : receivable.asaas_transaction_receipt_url,
          asaas_installment_id: shouldRecreateAsaas
            ? null
            : receivable.asaas_installment_id,
          asaas_status: shouldRecreateAsaas ? null : receivable.asaas_status,
          asaas_synced_at: shouldRecreateAsaas
            ? null
            : receivable.asaas_synced_at,
          asaas_last_error: oldAsaasPaymentId
            ? `Baixa manual estornada. Cobrança Asaas anterior: ${oldAsaasPaymentId}. ${
              body.reason ? `Motivo: ${String(body.reason).slice(0, 180)}` : ""
            }`
            : body.reason
            ? `Baixa manual estornada. Motivo: ${
              String(body.reason).slice(0, 180)
            }`
            : null,
          ...(clearCanceledGateway
            ? {
              gateway_payment_id: null,
              gateway_payment_link_id: null,
              gateway_invoice_url: null,
              gateway_bank_slip_url: null,
              gateway_pix_payload: null,
              gateway_pix_encoded_image: null,
              gateway_boleto_linha_digitavel: null,
              gateway_boleto_codigo_barras: null,
              gateway_boleto_nosso_numero: null,
              gateway_boleto_issued_at: null,
              gateway_financial_terms: null,
              gateway_financial_terms_confirmed_at: null,
              gateway_transaction_receipt_url: null,
              gateway_status: null,
              gateway_synced_at: null,
              gateway_last_error: `Baixa manual estornada. Titulo ${
                clearCanceledBanese ? "Banese" : "Asaas"
              } anterior: ${
                oldGatewayPaymentId || oldGatewayPaymentLinkId ||
                oldAsaasPaymentId
              }. ${
                body.reason
                  ? `Motivo: ${String(body.reason).slice(0, 180)}`
                  : ""
              }`,
            }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivableId)
        .eq("status", "PAGO")
        .eq("origem_pagamento", "PRESENCIAL");
      reverseQuery = applyRemoteIdentitySnapshot(reverseQuery, receivable);
      reverseQuery = applyReceivableSnapshotFields(
        reverseQuery,
        receivable,
        [
          "conta_bancaria_id",
          "valor_pago",
          "data_pagamento",
          "forma_pagamento",
          "gateway_status",
          "asaas_status",
          "updated_at",
        ],
      );
      const { data: reverted, error: updateError } = await reverseQuery
        .select()
        .maybeSingle();
      if (updateError) throw updateError;
      if (!reverted) {
        throw new Error(
          "A baixa mudou durante o estorno. Atualize a tela antes de tentar novamente.",
        );
      }

      const finalReceivable = shouldRecreateGateway
        ? await syncReceivable(
          await getGatewayRuntimeForMovement(),
          reverted.id,
        )
        : reverted;

      return respondJson({
        success: true,
        receivable: finalReceivable,
        asaasRecreated: shouldRecreateAsaas,
        baneseRecreated: shouldRecreateBanese,
        gatewayRecreated: shouldRecreateGateway,
        gatewayProvider: shouldRecreateBanese
          ? "banese_card"
          : shouldRecreateAsaas
          ? "asaas"
          : null,
      });
    }

    if (action === "create-course-link") {
      return respondJson(await online.createCourseLink(null as any, body));
    }

    return respondJson({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error(error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro interno.",
    }, 400);
  }
});
