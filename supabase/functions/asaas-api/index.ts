import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createAsaasBillingService } from "./billing.service.ts";
import { createAsaasCarnetService } from "./carnet.service.ts";
import { createAsaasOnlineService } from "./online.service.ts";
import { callAsaas } from "./asaas-http.ts";
import { requireFinanceWriteAccess, requireGestorAtivo, requireGestorGlobal, requireGestorForPolo } from "./authz.ts";
import type { Environment } from "./shared.ts";
import {
  UUID_RE,
  apiSecretName,
  baseUrlFor,
  corsHeaders,
  json,
  normalizeEnvironment,
  webhookSecretName,
} from "./shared.ts";

const GESTOR_ACTIONS = new Set([
  "get-config",
  "save-config",
  "save-notification-preferences",
  "sync-enrollment",
  "test-connection",
  "ensure-webhook",
  "reconcile-online-payment",
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
  "cancel-receivable",
  "manual-settlement",
  "reverse-manual-settlement",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

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

    const getConfig = async () => {
      const { data, error } = await admin
        .from("asaas_config")
        .select("id, environment, wallet_id, configured, last_test_at, last_test_status, last_test_message, notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled")
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
      config?.notification_whatsapp_enabled === true
      || config?.notification_email_enabled === true
      || config?.notification_sms_enabled === true
      || config?.notifications_enabled === true;

    const getSecret = async (name: string) => {
      const { data, error } = await admin.rpc("asaas_get_secret", { p_secret_name: name });
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

      const token = `universo-${environment}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
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

    const getRuntime = async (requestedEnvironment?: Environment) => {
      const config = await getConfig();
      const environment = requestedEnvironment || normalizeEnvironment(config.environment);
      const apiKey = await getSecret(apiSecretName(environment));
      if (!apiKey) throw new Error(`A chave do ambiente ${environment} ainda não foi configurada.`);
      return {
        config,
        apiKey,
        environment,
        baseUrl: baseUrlFor(environment),
      };
    };

    const billing = createAsaasBillingService(admin, anyNotificationChannelEnabled);
    const {
      mapBillingType,
      refreshReceivableStatus,
      syncFutureInstallments,
      syncReceivable,
    } = billing;
    const online = createAsaasOnlineService(admin, mapBillingType);
    const carnet = createAsaasCarnetService(admin, syncReceivable, refreshReceivableStatus);

    if (action === "get-config") {
      const config = await getConfig();
      const environment = normalizeEnvironment(body.environment || config.environment);
      const apiKey = await getSecret(apiSecretName(environment));
      const webhookToken = await getWebhookToken(environment);
      return json({
        ...config,
        environment,
        configured: Boolean(apiKey),
        apiConfigured: Boolean(apiKey),
        webhookConfigured: Boolean(webhookToken),
        notificationsEnabled: anyNotificationChannelEnabled(config),
        notificationWhatsappEnabled: config.notification_whatsapp_enabled === true,
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
        const { error: webhookSecretError } = await admin.rpc("asaas_set_secret", {
          p_secret_name: webhookSecretName(environment),
          p_secret_value: webhookToken,
        });
        if (webhookSecretError) throw webhookSecretError;
        if (environment === "sandbox") {
          await admin.rpc("asaas_set_secret", {
            p_secret_name: "asaas_webhook_token",
            p_secret_value: webhookToken,
          });
        }
      }

      const config = await getConfig();
      const notificationWhatsappEnabled = body.notificationWhatsappEnabled === true;
      const notificationEmailEnabled = body.notificationEmailEnabled === true;
      const notificationSmsEnabled = body.notificationSmsEnabled === true;
      const { error: configError } = await admin.from("asaas_config").upsert({
        id: config.id,
        environment,
        wallet_id: body.walletId || null,
        notifications_enabled: notificationWhatsappEnabled || notificationEmailEnabled || notificationSmsEnabled || body.notificationsEnabled === true,
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
      return json({ success: true });
    }

    if (action === "save-notification-preferences") {
      const config = await getConfig();
      const notificationWhatsappEnabled = body.notificationWhatsappEnabled === true;
      const notificationEmailEnabled = body.notificationEmailEnabled === true;
      const notificationSmsEnabled = body.notificationSmsEnabled === true;
      const { error: configError } = await admin.from("asaas_config").upsert({
        id: config.id,
        environment: config.environment || "sandbox",
        wallet_id: config.wallet_id || null,
        configured: config.configured === true,
        notifications_enabled: notificationWhatsappEnabled || notificationEmailEnabled || notificationSmsEnabled,
        notification_whatsapp_enabled: notificationWhatsappEnabled,
        notification_email_enabled: notificationEmailEnabled,
        notification_sms_enabled: notificationSmsEnabled,
        notifications_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (configError) throw configError;
      return json({ success: true });
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

      const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
      if (gestor) requireGestorForPolo(gestor, turma?.polo_id);
      const origem = String(turma?.origem_financeira || "NORMAL").toUpperCase();
      const financeiroHerdado = matricula.financeiro_herdado === true
        || turma?.financeiro_herdado === true
        || origem === "LEGADO";
      const gerarInicial = matricula.gerar_cobranca_inicial ?? !financeiroHerdado;
      const syncEnabled = matricula.sincronizar_asaas ?? turma?.sincronizar_asaas_futuro ?? true;

      if (gerarInicial === false || syncEnabled === false) {
        return json({
          success: true,
          skipped: true,
          skippedReason: gerarInicial === false
            ? "Cobrança inicial bloqueada por regra de financeiro legado."
            : "Sincronização Asaas desativada na matrícula/turma.",
        });
      }

      const { data, error } = await admin
        .from("contas_receber")
        .select("id")
        .eq("matricula_id", matriculaId)
        .eq("tipo_lancamento", "MATRICULA")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Cobrança de matrícula não encontrada.");

      const runtime = await getRuntime();
      const receivable = await syncReceivable(runtime, data.id);
      return json({
        success: true,
        receivable,
        skipped: receivable?.asaas_sync_skipped === true,
        skippedReason: receivable?.asaas_skip_reason || null,
      });
    }

    const getRuntimeForAction = () => getRuntime(body.environment ? normalizeEnvironment(body.environment) : undefined);
    const getRuntimeForMovement = () => getRuntime();

    if (action === "test-connection") {
      const runtime = await getRuntimeForAction();
      await callAsaas(runtime, "/customers?limit=1");
      await admin.from("asaas_config").update({
        last_test_at: new Date().toISOString(),
        last_test_status: "OK",
        last_test_message: "Conexão validada com sucesso.",
      }).eq("id", runtime.config.id);
      return json({ success: true });
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
      const existing = (list?.data || []).find((item: any) => item.url === webhookUrl);
      const webhook = existing
        ? await callAsaas(runtime, `/webhooks/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
        : await callAsaas(runtime, "/webhooks", {
          method: "POST",
          body: JSON.stringify(payload),
        });

      return json({
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
        throw new Error("Usuário financeiro sem polo definido não pode reconciliar pagamento online.");
      }
      const runtime = await getRuntimeForMovement();
      return json(await online.reconcileOnlinePayment(runtime, body, {
        poloId: gestor && !gestor.isGlobal ? gestor.poloId : null,
      }));
    }

    if (action === "sync-receivable") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para sincronização.");
      }
      const { data: receivableToSync, error: receivableToSyncError } = await admin
        .from("contas_receber")
        .select("id, polo_id")
        .eq("id", receivableId)
        .single();
      if (receivableToSyncError) throw receivableToSyncError;
      if (gestor) requireGestorForPolo(gestor, receivableToSync.polo_id);

      const runtime = await getRuntimeForMovement();
      const receivable = await syncReceivable(runtime, receivableId);
      return json({ success: true, receivable });
    }

    if (action === "cancel-receivable") {
      const runtime = await getRuntimeForMovement();
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

      if (receivable.status === "PAGO" || ["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
        throw new Error("Cobranças pagas/confirmadas não podem ser canceladas por este fluxo.");
      }

      let asaasCanceled = false;
      let asaasDeleteStatus: number | null = null;
      let asaasPaymentLinkCanceled = false;
      let asaasPaymentLinkDeleteStatus: number | null = null;

      if (receivable.asaas_payment_id) {
        const response = await fetch(`${runtime.baseUrl}/payments/${receivable.asaas_payment_id}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: runtime.apiKey,
          },
        });
        asaasDeleteStatus = response.status;
        const payload = response.status === 204 ? null : await response.json().catch(() => null);

        if (response.ok) {
          asaasCanceled = true;
        } else if (response.status === 404) {
          if (String(receivable.asaas_status || "").toUpperCase() !== "DELETED") {
            throw new Error("Cobrança Asaas não encontrada no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.");
          }
        } else {
          const message = payload?.errors?.map((item: any) => item.description).join(" ")
            || payload?.message
            || `Erro ${response.status} ao cancelar cobrança no Asaas.`;
          throw new Error(message);
        }
      }

      if (receivable.asaas_payment_link_id) {
        const response = await fetch(`${runtime.baseUrl}/paymentLinks/${receivable.asaas_payment_link_id}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: runtime.apiKey,
          },
        });
        asaasPaymentLinkDeleteStatus = response.status;
        const payload = response.status === 204 ? null : await response.json().catch(() => null);

        if (response.ok) {
          asaasPaymentLinkCanceled = true;
        } else if (response.status === 404) {
          if (!asaasCanceled && String(receivable.asaas_status || "").toUpperCase() !== "DELETED") {
            throw new Error("Link de pagamento Asaas não encontrado no ambiente configurado. Atualize/reconcilie antes de cancelar localmente.");
          }
          asaasPaymentLinkCanceled = true;
        } else {
          const message = payload?.errors?.map((item: any) => item.description).join(" ")
            || payload?.message
            || `Erro ${response.status} ao remover link de pagamento no Asaas.`;
          throw new Error(message);
        }
      }

      const { data: canceled, error: updateError } = await admin
        .from("contas_receber")
        .update({
          status: "CANCELADO",
          asaas_status: "DELETED",
          asaas_payment_link_id: null,
          nosso_numero_asaas: receivable.asaas_payment_link_id && !receivable.asaas_payment_id ? null : receivable.nosso_numero_asaas,
          asaas_invoice_url: null,
          asaas_bank_slip_url: null,
          asaas_transaction_receipt_url: null,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .in("status", ["PENDENTE", "VENCIDO"])
        .select()
        .maybeSingle();
      if (updateError) throw updateError;
      if (!canceled) {
        throw new Error("Cobrança mudou de status antes do cancelamento. Atualize a tela e tente novamente.");
      }

      return json({
        success: true,
        receivable: canceled,
        asaasCanceled,
        asaasDeleteStatus,
        asaasPaymentLinkCanceled,
        asaasPaymentLinkDeleteStatus,
      });
    }

    if (action === "generate-official-carnet") {
      const receivableIds = Array.isArray(body.receivableIds)
        ? body.receivableIds.map((id) => String(id)).filter(Boolean)
        : [];
      const uniqueReceivableIds = [...new Set(receivableIds)];
      if (!uniqueReceivableIds.length) {
        throw new Error("Selecione ao menos uma cobrança para gerar o carnê oficial.");
      }
      if (uniqueReceivableIds.some((id) => !UUID_RE.test(id))) {
        throw new Error("A seleção do carnê possui cobrança inválida.");
      }
      const { data: selectedReceivables, error: selectedReceivablesError } = await admin
        .from("contas_receber")
        .select("id, polo_id")
        .in("id", uniqueReceivableIds);
      if (selectedReceivablesError) throw selectedReceivablesError;
      if ((selectedReceivables || []).length !== uniqueReceivableIds.length) {
        throw new Error("Uma ou mais cobranças selecionadas não foram encontradas.");
      }
      if (gestor) {
        for (const row of selectedReceivables || []) requireGestorForPolo(gestor, row.polo_id);
      }
      const runtime = await getRuntimeForMovement();
      return json(await carnet.generateOfficialCarnet(runtime, uniqueReceivableIds));
    }

    if (action === "refresh-receivable-status") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para atualização.");
      }
      const runtime = await getRuntimeForMovement();
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;
      if (gestor) requireGestorForPolo(gestor, receivable.polo_id);
      const refreshed = await refreshReceivableStatus(runtime, receivable);
      return json({ success: true, receivable: refreshed });
    }

    if (action === "manual-settlement") {
      const receivableId = String(body.receivableId || "").trim();
      if (!UUID_RE.test(receivableId)) {
        throw new Error("Cobrança inválida para baixa manual.");
      }
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;
      if (gestor) requireGestorForPolo(gestor, receivable.polo_id);

      if (!["PENDENTE", "VENCIDO"].includes(String(receivable.status || "").toUpperCase())) {
        throw new Error("Baixa manual permitida apenas para cobranças pendentes ou vencidas.");
      }
      if (["RECEIVED", "CONFIRMED"].includes(String(receivable.asaas_status || "").toUpperCase())) {
        throw new Error("Cobrança já confirmada no Asaas. Atualize o status e use o comprovante oficial.");
      }

      const valorPago = Number(body.valorPago);
      if (!Number.isFinite(valorPago) || valorPago <= 0) {
        throw new Error("Valor pago inválido para baixa manual.");
      }
      const dataPagamento = String(body.dataPagamento || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
        throw new Error("Data de pagamento inválida para baixa manual.");
      }
      const formaPagamento = String(body.formaPagamento || "").trim();
      if (!formaPagamento) throw new Error("Forma de pagamento obrigatória para baixa manual.");

      const contaBancariaId = String(body.contaBancariaId || "").trim();
      if (!UUID_RE.test(contaBancariaId)) {
        throw new Error("Conta bancária obrigatória para baixa manual.");
      }
      const { data: contaBancaria, error: contaError } = await admin
        .from("contas_bancarias")
        .select("id, polo_id, ativo")
        .eq("id", contaBancariaId)
        .maybeSingle();
      if (contaError) throw contaError;
      if (!contaBancaria || contaBancaria.ativo !== true) {
        throw new Error("Conta bancária inativa ou não encontrada.");
      }
      if (receivable.polo_id && contaBancaria.polo_id !== receivable.polo_id) {
        throw new Error("Conta bancária pertence a outro polo.");
      }

      let settlementRuntime: Awaited<ReturnType<typeof getRuntime>> | null = null;
      let asaasCanceled = false;
      let asaasPaymentLinkCanceled = false;
      if (receivable.asaas_payment_id && !["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
        settlementRuntime = await getRuntimeForMovement();
        const remotePaymentResponse = await fetch(`${settlementRuntime.baseUrl}/payments/${receivable.asaas_payment_id}`, {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: settlementRuntime.apiKey,
          },
        });
        const remotePayment = remotePaymentResponse.status === 204
          ? null
          : await remotePaymentResponse.json().catch(() => null);
        if (remotePaymentResponse.status === 404) {
          if (String(receivable.asaas_status || "").toUpperCase() !== "DELETED") {
            throw new Error("Cobrança Asaas não encontrada no ambiente configurado. Atualize/reconcilie antes da baixa manual.");
          }
        } else if (!remotePaymentResponse.ok) {
          const message = remotePayment?.errors?.map((item: any) => item.description).join(" ")
            || remotePayment?.message
            || `Erro ${remotePaymentResponse.status} ao consultar cobrança no Asaas.`;
          throw new Error(message);
        }
        if (["RECEIVED", "CONFIRMED"].includes(String(remotePayment?.status || "").toUpperCase())) {
          throw new Error("O Asaas já confirmou este pagamento. Não é permitido converter para baixa manual.");
        }
        const deletePaymentResponse = await fetch(`${settlementRuntime.baseUrl}/payments/${receivable.asaas_payment_id}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: settlementRuntime.apiKey,
          },
        });
        if (!deletePaymentResponse.ok && deletePaymentResponse.status !== 404) {
          const payload = await deletePaymentResponse.json().catch(() => null);
          const message = payload?.errors?.map((item: any) => item.description).join(" ")
            || payload?.message
            || `Erro ${deletePaymentResponse.status} ao cancelar cobrança no Asaas.`;
          throw new Error(message);
        }
        asaasCanceled = true;
      }
      if (receivable.asaas_payment_link_id) {
        settlementRuntime = settlementRuntime || await getRuntimeForMovement();
        const response = await fetch(`${settlementRuntime.baseUrl}/paymentLinks/${receivable.asaas_payment_link_id}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: settlementRuntime.apiKey,
          },
        });
        if (!response.ok && response.status !== 404) {
          const payload = await response.json().catch(() => null);
          const message = payload?.errors?.map((item: any) => item.description).join(" ")
            || payload?.message
            || `Erro ${response.status} ao remover link de pagamento no Asaas.`;
          throw new Error(message);
        }
        if (response.status === 404 && !receivable.asaas_payment_id && String(receivable.asaas_status || "").toUpperCase() !== "DELETED") {
          throw new Error("Link de pagamento Asaas não encontrado no ambiente configurado. Atualize/reconcilie antes da baixa manual.");
        }
        asaasPaymentLinkCanceled = true;
      }

      const { data: settled, error: updateError } = await admin.from("contas_receber")
        .update({
          status: "PAGO",
          conta_bancaria_id: contaBancariaId,
          valor_pago: valorPago,
          data_pagamento: dataPagamento,
          forma_pagamento: formaPagamento,
          origem_pagamento: "PRESENCIAL",
          asaas_status: receivable.asaas_payment_id || receivable.asaas_payment_link_id ? "DELETED" : null,
          asaas_payment_link_id: null,
          nosso_numero_asaas: receivable.asaas_payment_link_id && !receivable.asaas_payment_id ? null : receivable.nosso_numero_asaas,
          asaas_invoice_url: null,
          asaas_bank_slip_url: null,
          asaas_transaction_receipt_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivableId)
        .in("status", ["PENDENTE", "VENCIDO"])
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!settled) {
        throw new Error("Cobrança mudou de status antes da baixa. Atualize a tela e tente novamente.");
      }

      if (receivable.matricula_id) {
        const { data: matricula, error: matriculaError } = await admin
          .from("matriculas")
          .select("gerar_cobranca_futura, sincronizar_asaas, turmas(gerar_cobrancas_futuras, sincronizar_asaas_futuro)")
          .eq("id", receivable.matricula_id)
          .maybeSingle();
        if (matriculaError) throw matriculaError;
        const turma = Array.isArray(matricula?.turmas) ? matricula?.turmas[0] : matricula?.turmas;
        const gerarFutura = matricula?.gerar_cobranca_futura ?? turma?.gerar_cobrancas_futuras ?? false;
        const syncEnabled = matricula?.sincronizar_asaas ?? turma?.sincronizar_asaas_futuro ?? true;
        if (gerarFutura && syncEnabled) {
          settlementRuntime = settlementRuntime || await getRuntimeForMovement();
          await syncFutureInstallments(settlementRuntime, receivable.matricula_id);
        }
      }
      return json({
        success: true,
        asaasCanceled,
        asaasPaymentLinkCanceled,
        asaasPaymentId: receivable.asaas_payment_id || null,
      });
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

      const oldAsaasPaymentId = receivable.asaas_payment_id || null;
      const shouldRecreateAsaas = Boolean(recreateAsaas && receivable.cliente_id && oldAsaasPaymentId);

      const { data: reverted, error: updateError } = await admin
        .from("contas_receber")
        .update({
          status: "PENDENTE",
          conta_bancaria_id: null,
          valor_pago: null,
          data_pagamento: null,
          forma_pagamento: null,
          origem_pagamento: shouldRecreateAsaas ? "ASAAS" : "LOCAL",
          asaas_payment_id: shouldRecreateAsaas ? null : oldAsaasPaymentId,
          nosso_numero_asaas: shouldRecreateAsaas ? null : receivable.nosso_numero_asaas,
          asaas_invoice_url: shouldRecreateAsaas ? null : receivable.asaas_invoice_url,
          asaas_bank_slip_url: shouldRecreateAsaas ? null : receivable.asaas_bank_slip_url,
          asaas_transaction_receipt_url: shouldRecreateAsaas ? null : receivable.asaas_transaction_receipt_url,
          asaas_installment_id: shouldRecreateAsaas ? null : receivable.asaas_installment_id,
          asaas_status: shouldRecreateAsaas ? null : receivable.asaas_status,
          asaas_synced_at: shouldRecreateAsaas ? null : receivable.asaas_synced_at,
          asaas_last_error: oldAsaasPaymentId
            ? `Baixa manual estornada. Cobrança Asaas anterior: ${oldAsaasPaymentId}. ${body.reason ? `Motivo: ${String(body.reason).slice(0, 180)}` : ""}`
            : body.reason ? `Baixa manual estornada. Motivo: ${String(body.reason).slice(0, 180)}` : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivableId)
        .select()
        .single();
      if (updateError) throw updateError;

      const finalReceivable = shouldRecreateAsaas
        ? await syncReceivable(await getRuntimeForMovement(), reverted.id)
        : reverted;

      return json({
        success: true,
        receivable: finalReceivable,
        asaasRecreated: shouldRecreateAsaas,
      });
    }

    if (action === "create-course-link") {
      return json(await online.createCourseLink(null as any, body));
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
