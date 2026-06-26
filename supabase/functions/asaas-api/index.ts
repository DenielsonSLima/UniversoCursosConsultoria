import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Environment = "sandbox" | "production";

const isValidCpf = (value: string) => {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split("").reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Curso EAD - Universo Cursos e Consultoria`;
const ONLINE_MODALIDADES = ["EAD", "LIVRE", "ESPECIALIZACAO"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const normalizeEnvironment = (value: unknown): Environment =>
      value === "production" ? "production" : "sandbox";
    const apiSecretName = (environment: Environment) =>
      environment === "production" ? "asaas_production_api_key" : "asaas_sandbox_api_key";
    const webhookSecretName = (environment: Environment) =>
      environment === "production" ? "asaas_production_webhook_token" : "asaas_sandbox_webhook_token";
    const baseUrlFor = (environment: Environment) =>
      environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

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

    const requireGestorAtivo = async () => {
      const authorization = req.headers.get("Authorization") || "";
      const token = authorization.replace(/^Bearer\s+/i, "").trim();
      if (!token) throw new Error("Autenticação obrigatória para esta ação.");

      const { data: authData, error: authError } = await admin.auth.getUser(token);
      if (authError || !authData.user?.email) {
        throw new Error("Sessão inválida para esta ação.");
      }

      const { data: usuario, error: usuarioError } = await admin
        .from("usuarios_sistema")
        .select("id, perfil, status")
        .eq("email", authData.user.email)
        .maybeSingle();
      if (usuarioError) throw usuarioError;
      if (!usuario || String(usuario.status).toLowerCase() !== "ativo" || String(usuario.perfil).toLowerCase() !== "gestor") {
        throw new Error("Apenas gestor ativo pode cancelar cobrança no Asaas.");
      }

      return usuario;
    };

    const callAsaas = async (
      runtime: Awaited<ReturnType<typeof getRuntime>>,
      path: string,
      init: RequestInit = {},
    ) => {
      const response = await fetch(`${runtime.baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Universo-Cursos-Gestao",
          access_token: runtime.apiKey,
          ...(init.headers || {}),
        },
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.errors?.map((item: any) => item.description).join(" ")
          || payload?.message
          || `Erro ${response.status} na API do Asaas.`;
        throw new Error(message);
      }
      return payload;
    };

    const fetchAsaasFile = async (
      runtime: Awaited<ReturnType<typeof getRuntime>>,
      url: string,
    ) => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Universo-Cursos-Gestao",
            access_token: runtime.apiKey,
          },
        });
        if (response.ok) {
          return new Uint8Array(await response.arrayBuffer());
        }

        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1500 * (attempt + 1);
          await response.text().catch(() => "");
          await sleep(delay);
          continue;
        }

        if (response.status === 429) {
          throw new Error("O Asaas limitou temporariamente o download dos boletos oficiais. Tente novamente em alguns instantes ou gere o carnê em lotes menores.");
        }

        throw new Error(`Não foi possível baixar o boleto oficial do Asaas (${response.status}).`);
      }
      throw new Error("Não foi possível baixar o boleto oficial do Asaas.");
    };

    const ensureCustomer = async (
      runtime: Awaited<ReturnType<typeof getRuntime>>,
      parceiro: any,
    ) => {
      const notificationsEnabled = anyNotificationChannelEnabled(runtime.config);
      if (parceiro.asaas_customer_id) {
        await callAsaas(runtime, `/customers/${parceiro.asaas_customer_id}`, {
          method: "PUT",
          body: JSON.stringify({ notificationDisabled: !notificationsEnabled }),
        }).catch((error) => {
          console.warn("Não foi possível atualizar preferência de notificações do cliente no Asaas:", error);
        });
        return parceiro.asaas_customer_id as string;
      }
      const cpfCnpj = String(
        parceiro.responsavel_financeiro && parceiro.responsavel_cpf
          ? parceiro.responsavel_cpf
          : parceiro.cpf_cnpj || "",
      ).replace(/\D/g, "");
      if (!cpfCnpj) throw new Error("O aluno precisa ter CPF cadastrado para gerar cobrança no Asaas.");
      if (!isValidCpf(cpfCnpj)) {
        throw new Error("CPF inválido para cobrança. Atualize o cadastro do aluno antes de enviar ao Asaas.");
      }

      const found = await callAsaas(runtime, `/customers?cpfCnpj=${cpfCnpj}&limit=1`);
      let customer = found?.data?.[0];
      if (!customer) {
        customer = await callAsaas(runtime, "/customers", {
          method: "POST",
          body: JSON.stringify({
            name: parceiro.nome,
            cpfCnpj,
            email: parceiro.responsavel_financeiro
              ? parceiro.responsavel_email || parceiro.email
              : parceiro.email,
            mobilePhone: parceiro.responsavel_financeiro
              ? parceiro.responsavel_telefone || parceiro.telefone
              : parceiro.telefone,
            postalCode: String(parceiro.cep || "").replace(/\D/g, "") || undefined,
            address: parceiro.endereco || undefined,
            addressNumber: parceiro.numero || undefined,
            complement: parceiro.complemento || undefined,
            province: parceiro.bairro || undefined,
            externalReference: parceiro.id,
            notificationDisabled: !notificationsEnabled,
          }),
        });
      }

      if (customer?.id) {
        await callAsaas(runtime, `/customers/${customer.id}`, {
          method: "PUT",
          body: JSON.stringify({ notificationDisabled: !notificationsEnabled }),
        }).catch((error) => {
          console.warn("Não foi possível atualizar preferência de notificações do cliente no Asaas:", error);
        });
      }

      await admin.from("parceiros")
        .update({ asaas_customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq("id", parceiro.id);
      return customer.id as string;
    };

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

    const formatDate = (value?: string | null) => {
      if (!value) return "";
      const [year, month, day] = String(value).slice(0, 10).split("-");
      return year && month && day ? `${day}/${month}/${year}` : String(value);
    };

    const roundMoney = (value: number) => Math.round(value * 100) / 100;

    const buildPaymentPayload = async (customerId: string, receivable: any, includeCustomer = true) => {
      const { data: turma, error: turmaError } = receivable.turma_id
        ? await admin
          .from("turmas")
          .select("id, nome, desconto_pontualidade, juros_atraso, multa_atraso")
          .eq("id", receivable.turma_id)
          .maybeSingle()
        : { data: null, error: null };
      if (turmaError) throw turmaError;

      const value = roundMoney(Number(receivable.valor || 0));
      const discountValue = roundMoney(Number(turma?.desconto_pontualidade || 0));
      const interestPercent = Number(turma?.juros_atraso || 0);
      const fineValue = roundMoney(Number(turma?.multa_atraso || 0));
      const isInstallment = receivable.tipo_lancamento !== "MATRICULA";
      const discountApplies = isInstallment && discountValue > 0 && discountValue < value;
      const fineApplies = fineValue > 0;
      const interestApplies = interestPercent > 0;

      const instructionLines = [
        String(receivable.descricao || "").trim(),
        discountApplies
          ? `Desconto de pontualidade de ${formatCurrency(discountValue)} para pagamento até ${formatDate(receivable.data_vencimento)}.`
          : null,
        fineApplies || interestApplies
          ? `Após o vencimento: ${fineApplies ? `multa de ${formatCurrency(fineValue)}` : ""}${fineApplies && interestApplies ? " e " : ""}${interestApplies ? `juros de ${interestPercent}% ao mês` : ""}.`
          : null,
      ].filter(Boolean).join("\n");

      const payload: Record<string, unknown> = {
        billingType: "UNDEFINED",
        value,
        dueDate: receivable.data_vencimento,
        description: instructionLines.slice(0, 500),
        externalReference: receivable.id,
        postalService: false,
      };

      if (includeCustomer) {
        payload.customer = customerId;
      }

      if (discountApplies) {
        payload.discount = {
          value: discountValue,
          dueDateLimitDays: 0,
          type: "FIXED",
        };
      }

      if (interestApplies) {
        payload.interest = { value: interestPercent };
      }

      if (fineApplies) {
        payload.fine = {
          value: fineValue,
          type: "FIXED",
        };
      }

      if (fineApplies || interestApplies) {
        payload.daysAfterDueDateToRegistrationCancellation = 30;
      }

      return payload;
    };

    const syncReceivable = async (
      runtime: Awaited<ReturnType<typeof getRuntime>>,
      receivableId: string,
    ) => {
      const { data: receivable, error: receivableError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (receivableError) throw receivableError;
      if (receivable.status === "PAGO") return receivable;
      if (receivable.asaas_payment_id) {
        if (receivable.cliente_id && !["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
          const { data: parceiro, error: parceiroError } = await admin
            .from("parceiros")
            .select("*")
            .eq("id", receivable.cliente_id)
            .single();
          if (parceiroError) throw parceiroError;
          const customerId = await ensureCustomer(runtime, parceiro);
          const updatePayload = await buildPaymentPayload(customerId, receivable, false);
          try {
            await callAsaas(runtime, `/payments/${receivable.asaas_payment_id}`, {
              method: "PUT",
              body: JSON.stringify(updatePayload),
            });
          } catch (error) {
            console.warn("Não foi possível atualizar regras do boleto no Asaas antes da consulta:", error);
          }
        }
        return refreshReceivableStatus(runtime, receivable);
      }
      if (!receivable.cliente_id) throw new Error("A cobrança não possui aluno vinculado.");

      const { data: parceiro, error: parceiroError } = await admin
        .from("parceiros")
        .select("*")
        .eq("id", receivable.cliente_id)
        .single();
      if (parceiroError) throw parceiroError;

      const customerId = await ensureCustomer(runtime, parceiro);
      try {
        const paymentPayload = await buildPaymentPayload(customerId, receivable);
        const payment = await callAsaas(runtime, "/payments", {
          method: "POST",
          body: JSON.stringify(paymentPayload),
        });

        const { data: updated, error: updateError } = await admin
          .from("contas_receber")
          .update({
            asaas_payment_id: payment.id,
            nosso_numero_asaas: payment.id,
            asaas_invoice_url: payment.invoiceUrl || null,
            asaas_bank_slip_url: payment.bankSlipUrl || null,
            asaas_installment_id: payment.installment || payment.installmentId || null,
            asaas_status: payment.status,
            asaas_synced_at: new Date().toISOString(),
            asaas_last_error: null,
          })
          .eq("id", receivable.id)
          .select()
          .single();
        if (updateError) throw updateError;
        return updated;
      } catch (error) {
        await admin.from("contas_receber")
          .update({ asaas_last_error: error instanceof Error ? error.message : String(error) })
          .eq("id", receivable.id);
        throw error;
      }
    };

    const mapBillingType = (billingType?: string | null) => {
      if (billingType === "CREDIT_CARD") return "CARTAO";
      if (billingType === "PIX") return "PIX";
      if (billingType === "BOLETO") return "BOLETO";
      return null;
    };

    const refreshReceivableStatus = async (
      runtime: Awaited<ReturnType<typeof getRuntime>>,
      receivable: any,
    ) => {
      if (!receivable.asaas_payment_id) return receivable;
      const payment = await callAsaas(runtime, `/payments/${receivable.asaas_payment_id}`);
      const paymentStatus = String(payment?.status || "");
      const updates: Record<string, unknown> = {
        asaas_status: paymentStatus || receivable.asaas_status,
        asaas_invoice_url: payment?.invoiceUrl || receivable.asaas_invoice_url,
        asaas_bank_slip_url: payment?.bankSlipUrl || receivable.asaas_bank_slip_url,
        asaas_installment_id: payment?.installment || payment?.installmentId || receivable.asaas_installment_id,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      };

      if (["RECEIVED", "CONFIRMED"].includes(paymentStatus)) {
        updates.status = "PAGO";
        updates.valor_pago = Number(payment.value || receivable.valor);
        updates.data_pagamento = String(
          payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString(),
        ).slice(0, 10);
        updates.forma_pagamento = mapBillingType(payment.billingType);
        updates.origem_pagamento = "ASAAS";
      } else if (paymentStatus === "OVERDUE") {
        updates.status = "VENCIDO";
      } else if (paymentStatus === "DELETED") {
        updates.status = "CANCELADO";
      } else if (paymentStatus === "REFUNDED") {
        updates.status = "ESTORNADO";
      }

      const { data: updated, error } = await admin
        .from("contas_receber")
        .update(updates)
        .eq("id", receivable.id)
        .select()
        .single();
      if (error) throw error;

      if (
        ["RECEIVED", "CONFIRMED"].includes(paymentStatus)
        && receivable.tipo_lancamento === "MATRICULA"
        && receivable.matricula_id
      ) {
        await syncFutureInstallments(runtime, receivable.matricula_id);
      }

      return updated;
    };

    const syncFutureInstallments = async (
      runtime: Awaited<ReturnType<typeof getRuntime>>,
      matriculaId: string,
    ) => {
      const { data, error } = await admin
        .from("contas_receber")
        .select("id")
        .eq("matricula_id", matriculaId)
        .in("status", ["PENDENTE", "VENCIDO"])
        .is("asaas_payment_id", null)
        .neq("tipo_lancamento", "MATRICULA")
        .order("data_vencimento");
      if (error) throw error;
      for (const item of data || []) await syncReceivable(runtime, item.id);
    };

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
        webhookToken,
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

    const runtime = await getRuntime(body.environment ? normalizeEnvironment(body.environment) : undefined);

    if (action === "test-connection") {
      await callAsaas(runtime, "/customers?limit=1");
      await admin.from("asaas_config").update({
        last_test_at: new Date().toISOString(),
        last_test_status: "OK",
        last_test_message: "Conexão validada com sucesso.",
      }).eq("id", runtime.config.id);
      return json({ success: true });
    }

    if (action === "ensure-webhook") {
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
      const courseId = String(body.courseId || "");
      const paymentId = body.paymentId ? String(body.paymentId) : "";
      const forcedAlunoId = body.alunoId ? String(body.alunoId) : "";
      if (!courseId && !paymentId) throw new Error("Informe o curso ou o pagamento Asaas para reconciliar.");

      const { data: course, error: courseError } = await admin
        .from("cursos")
        .select("*")
        .eq("id", courseId)
        .maybeSingle();
      if (courseError) throw courseError;
      if (!course && courseId) throw new Error("Curso não encontrado para reconciliação.");
      if (course && !ONLINE_MODALIDADES.includes(course.modalidade)) {
        throw new Error("A reconciliação online é permitida apenas para EAD, livres e especializações.");
      }

      const paymentsResponse = paymentId
        ? { data: [await callAsaas(runtime, `/payments/${paymentId}`)] }
        : await callAsaas(runtime, `/payments?externalReference=${encodeURIComponent(courseId)}&limit=50`);
      const paidPayments = (paymentsResponse?.data || []).filter((payment: any) =>
        ["RECEIVED", "CONFIRMED"].includes(String(payment.status || "")),
      );

      let reconciled = 0;
      for (const payment of paidPayments) {
        const customer = payment.customer ? await callAsaas(runtime, `/customers/${payment.customer}`) : null;
        const cpfCnpj = String(customer?.cpfCnpj || "").replace(/\D/g, "");

        let aluno: any = null;
        if (forcedAlunoId) {
          const { data, error } = await admin.from("parceiros").select("*").eq("id", forcedAlunoId).maybeSingle();
          if (error) throw error;
          aluno = data;
        }
        if (!aluno && cpfCnpj) {
          const { data, error } = await admin.from("parceiros").select("*").eq("cpf_cnpj", cpfCnpj).maybeSingle();
          if (error) throw error;
          aluno = data;
        }
        if (!aluno && customer?.email) {
          const { data, error } = await admin.from("parceiros").select("*").ilike("email", customer.email).maybeSingle();
          if (error) throw error;
          aluno = data;
        }
        if (!aluno) {
          const { data, error } = await admin.from("parceiros").insert({
            tipo: "Aluno",
            nome: customer?.name || "Aluno Asaas",
            cpf_cnpj: cpfCnpj || null,
            email: customer?.email || null,
            telefone: customer?.mobilePhone || customer?.phone || null,
            cep: customer?.postalCode || null,
            endereco: customer?.address || null,
            numero: customer?.addressNumber || null,
            complemento: customer?.complement || null,
            bairro: customer?.province || null,
            cidade: customer?.cityName || null,
            status: "ATIVO",
            asaas_customer_id: customer?.id || null,
          }).select().single();
          if (error) throw error;
          aluno = data;
        } else if (customer?.id && !aluno.asaas_customer_id) {
          await admin.from("parceiros").update({ asaas_customer_id: customer.id }).eq("id", aluno.id);
        }

        const targetCourse = course || (() => {
          throw new Error("Curso obrigatório para reconciliar pagamento sem link antigo.");
        })();
        const { data: turma, error: turmaError } = await admin.from("turmas")
          .select("id, polo_id")
          .eq("curso_id", targetCourse.id)
          .eq("status", "EM_ANDAMENTO")
          .limit(1)
          .maybeSingle();
        if (turmaError) throw turmaError;
        if (!turma) throw new Error(`Não há turma aberta para ${targetCourse.nome}.`);

        const { data: existingMatricula, error: existingMatriculaError } = await admin.from("matriculas")
          .select("*")
          .eq("aluno_id", aluno.id)
          .eq("turma_id", turma.id)
          .maybeSingle();
        if (existingMatriculaError) throw existingMatriculaError;

        const matricula = existingMatricula
          ? (await admin.from("matriculas").update({ status: "ATIVO" }).eq("id", existingMatricula.id).select().single()).data
          : (await admin.from("matriculas").insert({
            aluno_id: aluno.id,
            turma_id: turma.id,
            status: "ATIVO",
          }).select().single()).data;
        if (!matricula) throw new Error("Não foi possível ativar a matrícula reconciliada.");

        const paidAt = String(payment.paymentDate || payment.clientPaymentDate || payment.confirmedDate || new Date().toISOString()).slice(0, 10);
        const receivablePayload = {
          polo_id: turma.polo_id,
          descricao: buildCoursePaymentDescription(targetCourse.nome),
          valor: Number(payment.value || targetCourse.valor || 0),
          data_vencimento: String(payment.dueDate || paidAt).slice(0, 10),
          data_pagamento: paidAt,
          valor_pago: Number(payment.value || targetCourse.valor || 0),
          status: "PAGO",
          cliente_id: aluno.id,
          matricula_id: matricula.id,
          turma_id: turma.id,
          forma_pagamento: mapBillingType(payment.billingType),
          categoria: "MENSALIDADE",
          tipo_lancamento: "MATRICULA",
          origem_pagamento: "ASAAS",
          asaas_payment_id: payment.id,
          nosso_numero_asaas: payment.id,
          asaas_invoice_url: payment.invoiceUrl || null,
          asaas_bank_slip_url: payment.bankSlipUrl || null,
          asaas_installment_id: payment.installment || payment.installmentId || null,
          asaas_status: payment.status || null,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        };
        const { data: existingReceivable, error: existingReceivableError } = await admin
          .from("contas_receber")
          .select("id")
          .eq("asaas_payment_id", payment.id)
          .maybeSingle();
        if (existingReceivableError) throw existingReceivableError;
        const receivableQuery = existingReceivable
          ? admin.from("contas_receber").update(receivablePayload).eq("id", existingReceivable.id)
          : admin.from("contas_receber").insert(receivablePayload);
        const { error: receivableError } = await receivableQuery;
        if (receivableError) throw receivableError;

        const { error: inscricaoError } = await admin.from("inscricoes_online").upsert({
          curso_id: targetCourse.id,
          turma_id: turma.id,
          aluno_id: aluno.id,
          matricula_id: matricula.id,
          asaas_payment_id: payment.id,
          asaas_customer_id: customer?.id || payment.customer || null,
          asaas_payment_link_id: payment.paymentLink || null,
          nome: customer?.name || aluno.nome,
          cpf_cnpj: cpfCnpj || aluno.cpf_cnpj || null,
          email: customer?.email || aluno.email || null,
          telefone: customer?.mobilePhone || customer?.phone || aluno.telefone || null,
          valor: Number(payment.value || targetCourse.valor || 0),
          status: "PAGO",
          pago_em: new Date().toISOString(),
          confirmado_em: new Date().toISOString(),
          forma_pagamento: payment.billingType || null,
          erro: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "asaas_payment_id" });
        if (inscricaoError) throw inscricaoError;

        reconciled += 1;
      }

      return json({ success: true, reconciled, found: paidPayments.length });
    }

    if (action === "sync-receivable") {
      const receivable = await syncReceivable(runtime, String(body.receivableId));
      return json({ success: true, receivable });
    }

    if (action === "cancel-receivable") {
      await requireGestorAtivo();

      const runtime = await getRuntime(normalizeEnvironment(body.environment));
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

      if (receivable.status === "PAGO" || ["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
        throw new Error("Cobranças pagas/confirmadas não podem ser canceladas por este fluxo.");
      }

      let asaasCanceled = false;
      let asaasDeleteStatus: number | null = null;

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
        } else if (response.status !== 404) {
          const message = payload?.errors?.map((item: any) => item.description).join(" ")
            || payload?.message
            || `Erro ${response.status} ao cancelar cobrança no Asaas.`;
          throw new Error(message);
        }
      }

      const { data: canceled, error: updateError } = await admin
        .from("contas_receber")
        .update({
          status: "CANCELADO",
          asaas_status: "DELETED",
          asaas_invoice_url: null,
          asaas_bank_slip_url: null,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .select()
        .single();
      if (updateError) throw updateError;

      return json({
        success: true,
        receivable: canceled,
        asaasCanceled,
        asaasDeleteStatus,
      });
    }

    if (action === "generate-official-carnet") {
      const receivableIds = Array.isArray(body.receivableIds)
        ? body.receivableIds.map((id) => String(id)).filter(Boolean)
        : [];
      if (!receivableIds.length) throw new Error("Selecione ao menos uma cobrança para gerar o carnê oficial.");
      if (receivableIds.length > 30) throw new Error("Gere o carnê em lotes de até 30 boletos por vez.");

      const { data: rows, error } = await admin
        .from("contas_receber")
        .select("id, asaas_payment_id, asaas_bank_slip_url, asaas_status, status, cliente_id")
        .in("id", receivableIds);
      if (error) throw error;

      const rowsById = new Map((rows || []).map((row: any) => [row.id, row]));
      const orderedRows = receivableIds.map((id) => rowsById.get(id)).filter(Boolean);
      if (!orderedRows.length) throw new Error("Nenhuma cobrança encontrada.");

      const merged = await PDFDocument.create();
      const sheetWidth = 595.28;
      const sheetHeight = 841.89;
      const marginX = 18;
      const marginY = 14;
      const gap = 6;
      const slotsPerSheet = 3;
      const slotHeight = (sheetHeight - marginY * 2 - gap * (slotsPerSheet - 1)) / slotsPerSheet;
      let renderedSlipCount = 0;

      for (const row of orderedRows) {
        if (row.status === "PAGO") {
          throw new Error("Remova cobranças já pagas da seleção para emitir carnê oficial.");
        }

        const synced = row.asaas_payment_id
          ? await refreshReceivableStatus(runtime, row)
          : await syncReceivable(runtime, row.id);

        const bankSlipUrl = synced.asaas_bank_slip_url;
        if (!bankSlipUrl) {
          throw new Error(`A cobrança ${synced.asaas_payment_id || synced.id} ainda não retornou boleto oficial do Asaas.`);
        }

        if (renderedSlipCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        const boletoBytes = await fetchAsaasFile(runtime, bankSlipUrl);
        const boletoPdf = await PDFDocument.load(boletoBytes);
        const sourcePage = boletoPdf.getPages()[0];
        if (!sourcePage) {
          throw new Error(`O boleto ${synced.asaas_payment_id || synced.id} retornou um PDF vazio.`);
        }

        const { width: sourceWidth, height: sourceHeight } = sourcePage.getSize();
        const slipCropHeight = sourceHeight * 0.43;
        const embeddedSlip = await merged.embedPage(sourcePage, {
          left: 0,
          bottom: 0,
          right: sourceWidth,
          top: slipCropHeight,
        });

        const slotIndex = renderedSlipCount % slotsPerSheet;
        const sheet = slotIndex === 0
          ? merged.addPage([sheetWidth, sheetHeight])
          : merged.getPages()[merged.getPageCount() - 1];

        const maxWidth = sheetWidth - marginX * 2;
        const maxHeight = slotHeight;
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / slipCropHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = slipCropHeight * scale;
        const slotTop = sheetHeight - marginY - slotIndex * (slotHeight + gap);
        const x = (sheetWidth - drawWidth) / 2;
        const y = slotTop - drawHeight;

        sheet.drawPage(embeddedSlip, { x, y, width: drawWidth, height: drawHeight });
        if (slotIndex < slotsPerSheet - 1) {
          const separatorY = sheetHeight - marginY - (slotIndex + 1) * slotHeight - slotIndex * gap - gap / 2;
          sheet.drawLine({
            start: { x: marginX, y: separatorY },
            end: { x: sheetWidth - marginX, y: separatorY },
            thickness: 0.5,
            color: rgb(0.74, 0.78, 0.84),
            dashArray: [4, 4],
          });
        }
        renderedSlipCount += 1;
      }

      const pdfBytes = await merged.save();
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        binary += String.fromCharCode(...pdfBytes.slice(i, i + chunkSize));
      }

      return json({
        success: true,
        filename: `carne-oficial-asaas-${new Date().toISOString().slice(0, 10)}.pdf`,
        contentType: "application/pdf",
        base64: btoa(binary),
        count: orderedRows.length,
      });
    }

    if (action === "refresh-receivable-status") {
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", String(body.receivableId))
        .single();
      if (error) throw error;
      const refreshed = await refreshReceivableStatus(runtime, receivable);
      return json({ success: true, receivable: refreshed });
    }

    if (action === "sync-enrollment") {
      const { data, error } = await admin
        .from("contas_receber")
        .select("id")
        .eq("matricula_id", String(body.matriculaId))
        .eq("tipo_lancamento", "MATRICULA")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Cobrança de matrícula não encontrada.");
      const receivable = await syncReceivable(runtime, data.id);
      return json({ success: true, receivable });
    }

    if (action === "manual-settlement") {
      const runtime = await getRuntime(normalizeEnvironment(body.environment));
      const receivableId = String(body.receivableId);
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;

      let asaasCanceled = false;
      if (receivable.asaas_payment_id && !["RECEIVED", "CONFIRMED"].includes(receivable.asaas_status)) {
        await callAsaas(runtime, `/payments/${receivable.asaas_payment_id}`, { method: "DELETE" });
        asaasCanceled = true;
      }

      const { error: updateError } = await admin.from("contas_receber").update({
        status: "PAGO",
        conta_bancaria_id: body.contaBancariaId,
        valor_pago: Number(body.valorPago),
        data_pagamento: body.dataPagamento,
        forma_pagamento: body.formaPagamento,
        origem_pagamento: "PRESENCIAL",
        asaas_status: receivable.asaas_payment_id ? "DELETED" : null,
        updated_at: new Date().toISOString(),
      }).eq("id", receivableId);
      if (updateError) throw updateError;

      if (receivable.tipo_lancamento === "MATRICULA" && receivable.matricula_id) {
        await syncFutureInstallments(runtime, receivable.matricula_id);
      }
      return json({
        success: true,
        asaasCanceled,
        asaasPaymentId: receivable.asaas_payment_id || null,
      });
    }

    if (action === "reverse-manual-settlement") {
      const runtime = await getRuntime(normalizeEnvironment(body.environment));
      const receivableId = String(body.receivableId);
      const recreateAsaas = body.recreateAsaas !== false;
      const { data: receivable, error } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivableId)
        .single();
      if (error) throw error;
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
        ? await syncReceivable(runtime, reverted.id)
        : reverted;

      return json({
        success: true,
        receivable: finalReceivable,
        asaasRecreated: shouldRecreateAsaas,
      });
    }

    if (action === "create-course-link") {
      const courseId = String(body.courseId);
      const { data: course, error } = await admin
        .from("cursos")
        .select("*")
        .eq("id", courseId)
        .single();
      if (error) throw error;
      if (!["EAD", "LIVRE", "ESPECIALIZACAO"].includes(course.modalidade)) {
        throw new Error("Links automáticos estão disponíveis apenas para EAD, cursos livres e especializações.");
      }
      if (!course.valor || Number(course.valor) <= 0) throw new Error("Defina o valor do curso antes de gerar o link.");
      const financeiroConfig = course.financeiro_config || {};
      const metodos = financeiroConfig.metodosRecebimento || {};
      const metodosAtivos = [
        metodos.pix ? "PIX" : null,
        metodos.boleto ? "BOLETO" : null,
        metodos.cartao ? "CREDIT_CARD" : null,
      ].filter(Boolean);
      const billingType = metodosAtivos.length === 1 ? metodosAtivos[0] : "UNDEFINED";
      const maxParcelas = financeiroConfig.cartao?.aceitar
        ? Math.max(1, Number(financeiroConfig.cartao?.maxParcelas || financeiroConfig.parcelasPadrao || 1))
        : 1;

      const { data: turma } = await admin.from("turmas")
        .select("id")
        .eq("curso_id", courseId)
        .eq("status", "EM_ANDAMENTO")
        .limit(1)
        .maybeSingle();
      if (!turma) throw new Error("Abra uma turma para este curso antes de gerar o link.");
      if (!body.recreate && course.asaas_payment_link_id && course.asaas_payment_link_url) {
        return json({ success: true, url: course.asaas_payment_link_url });
      }

      const link = await callAsaas(runtime, "/paymentLinks", {
        method: "POST",
        body: JSON.stringify({
          name: course.nome,
          description: buildCoursePaymentDescription(course.nome),
          value: Number(course.valor),
          billingType,
          chargeType: "DETACHED",
          maxInstallmentCount: maxParcelas,
          dueDateLimitDays: 7,
          externalReference: course.id,
        }),
      });
      await admin.from("cursos").update({
        asaas_payment_link_id: link.id,
        asaas_payment_link_url: link.url,
        asaas_link_status: "ACTIVE",
        asaas_link_updated_at: new Date().toISOString(),
      }).eq("id", course.id);
      return json({ success: true, url: link.url });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 400);
  }
});
