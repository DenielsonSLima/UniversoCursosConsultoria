import { type AsaasRuntime, callAsaas } from "./asaas-http.ts";
import {
  isTecnicoCourseModality,
  resolveMatriculaCourseModality,
  resolveReceivableCourseModality,
} from "../core/modality.ts";
import {
  assertRequiredCustomerBillingData,
  isValidCpf,
  resolveBillingContacts,
} from "../core/customer.ts";
import { AsaasHttpError } from "../core/http.ts";
import { resolveEnrollmentFinancialTerms } from "../core/enrollment-financial-terms.ts";
import {
  createGatewayCharge,
  type GatewayPaymentMethod,
  gatewayPrimaryUrl,
  type GatewayProviderCode,
  gatewayReceivableUpdate,
  persistGatewayTransaction as persistProviderGatewayTransaction,
  repairGatewayTransactionFromReceivable,
} from "../../gateways/router.ts";
import { resolveBaneseReceivableFinancialTerms } from "../../gateways/api/banese-financial-terms.ts";
import { assertStoredProviderAdapterReady } from "../../gateways/api/config.ts";
import {
  assertGatewayCreationFence,
  assertNoImplicitAsaasFallback,
  buildEnrollmentReceivablePaymentPatch,
  decideTechnicalInstallmentPaymentPatch,
  requireGatewayRouteForNewCharge,
  resolveAsaasBillingType,
  resolveReceivableGatewayPaymentMethod,
} from "./gateway-routing-guard.ts";
import {
  applyReceivableSnapshotFields,
  applyRemoteIdentitySnapshot,
  assertNoActiveCnabSubmission,
  assertNoAmbiguousGatewaySubmission,
  hasRemoteTitleReference,
} from "../../gateways/checkout/remote-title-guard.ts";
import {
  applyCheckoutAttemptSnapshot,
  claimExistingGatewayCheckout,
} from "../../gateways/checkout/gateway-creation-fence.ts";
import {
  ASAAS_REFRESH_IDENTITY_FIELDS,
  asaasRefreshReviewMessage,
  hasAsaasRefreshIdentityChanged,
  isManualReceivableSettlement,
  shouldPreserveReceivableAfterRefreshConflict,
} from "./billing-refresh-guard.ts";
import {
  asaasCustomerCandidateIds,
  asaasCustomerMatchesDocument,
} from "./customer-environment-guard.ts";
import {
  remoteAsaasPaymentMatchesReceivable,
  remoteDetachedLinkMatchesReceivable,
  selectUniqueAsaasRecoveryCandidate,
} from "./recovery-guard.ts";

export const createAsaasBillingService = (
  admin: any,
  anyNotificationChannelEnabled: (config: any) => boolean,
) => {
  const assertAsaasApiKey = (runtime: AsaasRuntime) => {
    if (!runtime.apiKey) {
      throw new Error(
        `A chave Asaas do ambiente ${runtime.environment} ainda nao foi configurada.`,
      );
    }
  };

  const providerLabelFor = (providerCode: string) => {
    if (providerCode === "mercado_pago") return "Mercado Pago";
    if (providerCode === "banese_card") return "Banese";
    return "Asaas";
  };

  const ensureCustomer = async (
    runtime: AsaasRuntime,
    parceiro: any,
  ) => {
    assertAsaasApiKey(runtime);
    const notificationsEnabled = anyNotificationChannelEnabled(runtime.config);
    const { cpfCnpj, email, phone } = resolveBillingContacts(parceiro);
    assertRequiredCustomerBillingData(parceiro, cpfCnpj, email, phone);
    if (!cpfCnpj) {
      throw new Error(
        "O aluno precisa ter CPF cadastrado para gerar cobrança no Asaas.",
      );
    }
    if (!isValidCpf(cpfCnpj)) {
      throw new Error(
        "CPF inválido para cobrança. Atualize o cadastro do aluno antes de enviar ao Asaas.",
      );
    }

    const customerPayload = {
      name: parceiro.nome,
      cpfCnpj,
      email,
      mobilePhone: phone,
      postalCode: String(parceiro.cep || "").replace(/\D/g, "") || undefined,
      address: parceiro.endereco || undefined,
      addressNumber: parceiro.numero || undefined,
      complement: parceiro.complemento || undefined,
      province: parceiro.bairro || undefined,
      externalReference: parceiro.id,
      notificationDisabled: !notificationsEnabled,
    };

    const persistEnvironmentCustomer = async (customerId: string) => {
      const now = new Date().toISOString();
      const { error: mappingError } = await admin
        .from("payment_gateway_customers")
        .upsert({
          parceiro_id: parceiro.id,
          provider_code: "asaas",
          environment: runtime.environment,
          remote_customer_id: customerId,
          updated_at: now,
        }, {
          onConflict: "parceiro_id,provider_code,environment",
        });
      if (mappingError) throw mappingError;

      // Mantido apenas como espelho legado. A resolução acima nunca confia
      // neste campo sem validar o cliente no ambiente da cobrança.
      const { error: legacyError } = await admin.from("parceiros")
        .update({
          asaas_customer_id: customerId,
          updated_at: now,
        })
        .eq("id", parceiro.id);
      if (legacyError) throw legacyError;
      parceiro.asaas_customer_id = customerId;
      return customerId;
    };

    const { data: environmentMapping, error: mappingReadError } = await admin
      .from("payment_gateway_customers")
      .select("remote_customer_id")
      .eq("parceiro_id", parceiro.id)
      .eq("provider_code", "asaas")
      .eq("environment", runtime.environment)
      .maybeSingle();
    if (mappingReadError) throw mappingReadError;

    for (
      const customerId of asaasCustomerCandidateIds(
        environmentMapping?.remote_customer_id,
        parceiro.asaas_customer_id,
      )
    ) {
      let candidate: any;
      try {
        candidate = await callAsaas(runtime, `/customers/${customerId}`);
      } catch (error) {
        if (error instanceof AsaasHttpError && error.status === 404) {
          continue;
        }
        throw error;
      }

      if (!asaasCustomerMatchesDocument(candidate, cpfCnpj)) {
        console.warn(
          `Cliente Asaas ${customerId} ignorado em ${runtime.environment}: CPF/CNPJ divergente.`,
        );
        continue;
      }

      const updatedCustomer = await callAsaas(
        runtime,
        `/customers/${customerId}`,
        {
          method: "PUT",
          body: JSON.stringify(customerPayload),
        },
      );
      if (
        updatedCustomer?.cpfCnpj &&
        !asaasCustomerMatchesDocument(updatedCustomer, cpfCnpj)
      ) {
        throw new Error(
          "O Asaas retornou um cliente com CPF/CNPJ divergente após a atualização.",
        );
      }
      return persistEnvironmentCustomer(customerId);
    }

    const found = await callAsaas(
      runtime,
      `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`,
    );
    let customer = (found?.data || []).find((item: any) =>
      asaasCustomerMatchesDocument(item, cpfCnpj)
    );
    if (!customer) {
      customer = await callAsaas(runtime, "/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });
    } else {
      customer = await callAsaas(runtime, `/customers/${customer.id}`, {
        method: "PUT",
        body: JSON.stringify(customerPayload),
      });
    }

    if (!asaasCustomerMatchesDocument(customer, cpfCnpj)) {
      throw new Error(
        "O Asaas não retornou um cliente válido para o CPF/CNPJ do aluno.",
      );
    }
    return persistEnvironmentCustomer(String(customer.id));
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(value);

  const formatDate = (value?: string | null) => {
    if (!value) return "";
    const [year, month, day] = String(value).slice(0, 10).split("-");
    return year && month && day ? `${day}/${month}/${year}` : String(value);
  };

  const roundMoney = (value: number) => Math.round(value * 100) / 100;

  const buildPaymentPayload = async (
    customerId: string,
    receivable: any,
    includeCustomer = true,
  ) => {
    const { data: turma, error: turmaError } = receivable.turma_id
      ? await admin
        .from("turmas")
        .select(
          "id, nome, desconto_pontualidade, juros_atraso, multa_atraso, aplicar_desconto_matricula, aplicar_multa_juros_matricula, aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade, aplicar_desconto_rematricula, aplicar_multa_juros_rematricula",
        )
        .eq("id", receivable.turma_id)
        .maybeSingle()
      : { data: null, error: null };
    if (turmaError) throw turmaError;

    const { data: matricula, error: matriculaError } = receivable.matricula_id
      ? await admin
        .from("matriculas")
        .select(
          "desconto_pontualidade_individual, juros_atraso_individual, multa_atraso_individual",
        )
        .eq("id", receivable.matricula_id)
        .maybeSingle()
      : { data: null, error: null };
    if (matriculaError) throw matriculaError;

    const value = roundMoney(Number(receivable.valor));
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        "Recebivel sem valor positivo valido para emissao bancaria.",
      );
    }
    const { discountValue, interestPercent, fineValue } =
      resolveEnrollmentFinancialTerms({ turma, matricula });
    const launchType = String(receivable.tipo_lancamento || "").toUpperCase();
    const discountEnabled = launchType === "MATRICULA"
      ? turma?.aplicar_desconto_matricula === true
      : launchType === "REMATRICULA"
      ? turma?.aplicar_desconto_rematricula !== false
      : turma?.aplicar_desconto_mensalidade !== false;
    const penaltyEnabled = launchType === "MATRICULA"
      ? turma?.aplicar_multa_juros_matricula !== false
      : launchType === "REMATRICULA"
      ? turma?.aplicar_multa_juros_rematricula !== false
      : turma?.aplicar_multa_juros_mensalidade !== false;
    if (discountEnabled && discountValue >= value && discountValue > 0) {
      throw new Error(
        "Desconto de pontualidade deve ser menor que o valor do recebivel.",
      );
    }
    const discountApplies = discountEnabled && discountValue > 0 &&
      discountValue < value;
    const fineApplies = penaltyEnabled && fineValue > 0;
    const interestApplies = penaltyEnabled && interestPercent > 0;

    const instructionLines = [
      String(receivable.descricao || "").trim(),
      discountApplies
        ? `Desconto de pontualidade de ${
          formatCurrency(discountValue)
        } para pagamento até ${formatDate(receivable.data_vencimento)}.`
        : null,
      fineApplies || interestApplies
        ? `Após o vencimento: ${
          fineApplies ? `multa de ${formatCurrency(fineValue)}` : ""
        }${fineApplies && interestApplies ? " e " : ""}${
          interestApplies ? `juros de ${interestPercent}% ao mês` : ""
        }.`
        : null,
    ].filter(Boolean).join("\n");

    const payload: Record<string, unknown> = {
      billingType: resolveAsaasBillingType(receivable),
      value,
      dueDate: receivable.data_vencimento,
      description: instructionLines.slice(0, 500),
      externalReference: receivable.id,
      postalService: false,
    };

    if (includeCustomer) payload.customer = customerId;
    if (discountApplies) {
      payload.discount = {
        value: discountValue,
        dueDateLimitDays: 0,
        type: "FIXED",
      };
    }
    if (interestApplies) payload.interest = { value: interestPercent };
    if (fineApplies) payload.fine = { value: fineValue, type: "FIXED" };
    if (fineApplies || interestApplies) {
      payload.daysAfterDueDateToRegistrationCancellation = 30;
    }
    payload.callback = { successUrl: callbackSuccessUrl() };

    return payload;
  };

  const mapBillingType = (billingType?: string | null) => {
    if (billingType === "CREDIT_CARD") return "CARTAO";
    if (billingType === "PIX") return "PIX";
    if (billingType === "BOLETO") return "BOLETO";
    return null;
  };

  const mapReceivableBillingType = (formaPagamento?: string | null) => {
    const value = String(formaPagamento || "").toUpperCase();
    if (value === "CARTAO" || value === "CREDIT_CARD") return "CREDIT_CARD";
    if (value === "PIX") return "PIX";
    if (value === "BOLETO") return "BOLETO";
    return "UNDEFINED";
  };

  const gatewayPaymentMethodOrNull = (value?: string | null) => {
    const method = mapReceivableBillingType(value);
    return method === "UNDEFINED" ? null : method;
  };

  const resolveRouteModalidade = async (receivable: any) => {
    const category = String(receivable?.categoria || "").toUpperCase();
    if (category === "OUTROS_CREDITOS") return "OUTROS_CREDITOS";
    if (!receivable?.matricula_id && !receivable?.turma_id) return null;
    const modalidade = await resolveReceivableCourseModality(admin, receivable);
    const normalized = String(modalidade || "").toUpperCase();
    if (["EAD", "TECNICO", "LIVRE", "ESPECIALIZACAO"].includes(normalized)) {
      return normalized;
    }
    return null;
  };

  const resolveGatewayRouteForReceivable = async (
    runtime: AsaasRuntime,
    receivable: any,
  ) => {
    const modalidade = await resolveRouteModalidade(receivable);
    if (!modalidade) return null;

    const paymentMethod = resolveReceivableGatewayPaymentMethod(receivable) ||
      "UNDEFINED";
    assertNoImplicitAsaasFallback({ modalidade, receivable });
    if (paymentMethod === "UNDEFINED") {
      if (modalidade === "OUTROS_CREDITOS") {
        throw new Error(
          "Escolha Pix, boleto ou cartão antes de gerar link bancário em Outros Créditos.",
        );
      }
      return null;
    }

    const { data, error } = await admin
      .from("payment_gateway_routes")
      .select("provider_code, enabled")
      .eq("modalidade", modalidade)
      .eq("payment_method", paymentMethod)
      .eq("environment", runtime.environment)
      .maybeSingle();

    if (error) {
      console.error(
        "Nao foi possivel consultar a rota bancaria da cobranca:",
        error,
      );
      throw new Error(
        "Nao foi possivel validar a rota bancaria antes de gerar a cobranca.",
      );
    }

    const providerCode = String(data?.provider_code || "asaas");
    if (!data || data.enabled === false) {
      throw new Error(
        `Rota ${
          mapBillingType(paymentMethod) || paymentMethod
        } de ${modalidade} em ${
          runtime.environment === "production" ? "producao" : "sandbox"
        } nao esta ativa.`,
      );
    }
    // Este resolvedor tambem e usado pelo sync administrativo/tecnico. Uma
    // rota antiga habilitada nao pode contornar os bloqueios do checkout/CRUD.
    assertStoredProviderAdapterReady(
      data.provider_code,
      paymentMethod,
      runtime.environment,
    );
    return {
      modalidade,
      paymentMethod: paymentMethod as GatewayPaymentMethod,
      providerCode: providerCode as GatewayProviderCode,
    };
  };

  const callbackSuccessUrl = () => {
    const candidates = [
      Deno.env.get("PUBLIC_SITE_URL"),
      Deno.env.get("SITE_URL"),
      Deno.env.get("APP_URL"),
      Deno.env.get("VITE_PUBLIC_SITE_URL"),
      "https://universocc.com.br",
    ];
    for (const candidate of candidates) {
      try {
        const url = new URL(String(candidate || ""));
        if (url.protocol === "http:" || url.protocol === "https:") {
          return `${url.origin.replace(/\/+$/, "")}/aluno?asaas=success`;
        }
      } catch {
        // Try the next configured source.
      }
    }
    return "https://universocc.com.br/aluno?asaas=success";
  };

  const recoverDetachedPaymentLink = async (
    runtime: AsaasRuntime,
    receivable: any,
  ) => {
    if (!receivable?.id) return null;
    const response = await callAsaas(
      runtime,
      `/paymentLinks?externalReference=${
        encodeURIComponent(receivable.id)
      }&limit=10`,
    );
    const expectedBillingType = resolveAsaasBillingType(receivable);
    const paymentLink = selectUniqueAsaasRecoveryCandidate({
      candidates: response?.data || [],
      externalReference: receivable.id,
      isInactive: (item: any) =>
        String(item.deleted || "false").toLowerCase() === "true",
      matches: (item: any) =>
        remoteDetachedLinkMatchesReceivable({
          paymentLink: item,
          receivableId: receivable.id,
          value: receivable.valor,
          billingType: expectedBillingType,
        }),
      label: "link detached Asaas",
    });
    if (!paymentLink?.id) return null;

    let recoveryQuery = admin
      .from("contas_receber")
      .update({
        asaas_payment_id: null,
        asaas_payment_link_id: paymentLink.id,
        nosso_numero_asaas: paymentLink.id,
        asaas_invoice_url: paymentLink.url || receivable.asaas_invoice_url ||
          null,
        asaas_bank_slip_url: null,
        asaas_installment_id: null,
        asaas_status: "PAYMENT_LINK_CREATED",
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        gateway_provider: "asaas",
        gateway_environment: runtime.environment,
        gateway_payment_method: resolveReceivableGatewayPaymentMethod(
          receivable,
        ),
        gateway_payment_id: null,
        gateway_payment_link_id: paymentLink.id,
        gateway_invoice_url: paymentLink.url || receivable.asaas_invoice_url ||
          null,
        gateway_bank_slip_url: null,
        gateway_installment_id: null,
        gateway_status: "PAYMENT_LINK_CREATED",
        gateway_synced_at: new Date().toISOString(),
        gateway_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .eq("asaas_status", "CREATING")
      .is("asaas_payment_link_id", null)
      .in("status", ["PENDENTE", "VENCIDO"]);
    recoveryQuery = applyRemoteIdentitySnapshot(recoveryQuery, receivable);
    const { data: updated, error } = await recoveryQuery.select()
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      throw new Error(
        "A cobranca mudou durante a recuperacao do link Asaas. Atualize e reconcilie antes de tentar novamente.",
      );
    }
    return updated;
  };

  const recoverReceivablePayment = async (
    runtime: AsaasRuntime,
    receivable: any,
  ) => {
    if (!receivable?.id) return null;
    const response = await callAsaas(
      runtime,
      `/payments?externalReference=${
        encodeURIComponent(receivable.id)
      }&limit=10`,
    );
    const expectedBillingType = resolveAsaasBillingType(receivable);
    const payment = selectUniqueAsaasRecoveryCandidate({
      candidates: response?.data || [],
      externalReference: receivable.id,
      isInactive: (item: any) =>
        ["DELETED", "REFUNDED", "CANCELLED", "CANCELED"].includes(
          String(item.status || "").toUpperCase(),
        ),
      matches: (item: any) =>
        remoteAsaasPaymentMatchesReceivable({
          payment: item,
          receivableId: receivable.id,
          value: receivable.valor,
          billingType: expectedBillingType,
          dueDate: receivable.data_vencimento,
        }),
      label: "pagamento Asaas",
    });
    if (!payment?.id) return null;

    const asaasCreationLock = String(receivable.asaas_status || "")
      .toUpperCase() === "CREATING";
    const gatewayCreationLock = receivable.gateway_provider === "asaas" &&
      String(receivable.gateway_status || "").toUpperCase() === "CREATING";
    if (!asaasCreationLock && !gatewayCreationLock) {
      throw new Error(
        "A recuperacao Asaas exige uma tentativa de criacao previamente travada.",
      );
    }

    let recoveryQuery = admin
      .from("contas_receber")
      .update({
        asaas_payment_id: payment.id,
        nosso_numero_asaas: payment.id,
        asaas_invoice_url: payment.invoiceUrl || null,
        asaas_bank_slip_url: payment.bankSlipUrl || null,
        asaas_installment_id: payment.installment || payment.installmentId ||
          null,
        asaas_transaction_receipt_url: payment.transactionReceiptUrl || null,
        asaas_status: payment.status,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        gateway_provider: "asaas",
        gateway_environment: runtime.environment,
        gateway_payment_method:
          gatewayPaymentMethodOrNull(payment.billingType) ||
          resolveReceivableGatewayPaymentMethod(receivable),
        gateway_payment_id: payment.id,
        gateway_payment_link_id: payment.paymentLink || null,
        gateway_installment_id: payment.installment || payment.installmentId ||
          null,
        gateway_invoice_url: payment.invoiceUrl || null,
        gateway_bank_slip_url: payment.bankSlipUrl || null,
        gateway_transaction_receipt_url: payment.transactionReceiptUrl || null,
        gateway_status: payment.status,
        gateway_synced_at: new Date().toISOString(),
        gateway_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivable.id)
      .is("asaas_payment_id", null)
      .in("status", ["PENDENTE", "VENCIDO"]);
    recoveryQuery = asaasCreationLock
      ? recoveryQuery.eq("asaas_status", "CREATING")
      : recoveryQuery
        .eq("gateway_provider", "asaas")
        .eq("gateway_environment", receivable.gateway_environment)
        .eq("gateway_payment_method", receivable.gateway_payment_method)
        .eq("gateway_status", "CREATING");
    recoveryQuery = applyRemoteIdentitySnapshot(recoveryQuery, receivable);
    const { data: updated, error } = await recoveryQuery.select()
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      throw new Error(
        "A cobranca mudou durante a recuperacao Asaas. Atualize e reconcilie antes de tentar novamente.",
      );
    }
    return refreshReceivableStatus(runtime, updated);
  };

  const syncGatewayReceivable = async (
    runtime: AsaasRuntime,
    receivable: any,
    route: {
      providerCode: GatewayProviderCode;
      paymentMethod: GatewayPaymentMethod;
    },
  ) => {
    assertNoActiveCnabSubmission(receivable);
    // Este caminho e usado apenas quando a rota selecionada nao e Asaas.
    // Uma resposta remota ambigua exige conciliacao no provedor; jamais pode
    // ser transformada em uma nova emissao pela expiracao do lock local.
    assertNoAmbiguousGatewaySubmission(receivable);
    if (receivable.asaas_payment_id || receivable.asaas_payment_link_id) {
      throw new Error(
        `Esta cobrança já tem vínculo Asaas. Cancele a cobrança Asaas antes de trocar a rota para ${
          providerLabelFor(route.providerCode)
        }.`,
      );
    }

    if (
      receivable.gateway_provider === route.providerCode &&
      receivable.gateway_environment === runtime.environment &&
      receivable.gateway_payment_method === route.paymentMethod &&
      gatewayPrimaryUrl(receivable)
    ) {
      await repairGatewayTransactionFromReceivable(admin, receivable);
      if (
        receivable.gateway_submission_channel === "API" &&
        receivable.gateway_submission_status === "API_REGISTERED"
      ) {
        return receivable;
      }
      if (
        receivable.gateway_submission_channel ||
        receivable.gateway_submission_status
      ) {
        throw new Error(
          "A cobrança possui identidade remota incompatível com o canal de registro externo.",
        );
      }
      let registrationQuery = admin
        .from("contas_receber")
        .update({
          gateway_submission_channel: "API",
          gateway_submission_status: "API_REGISTERED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .is("gateway_submission_channel", null)
        .is("gateway_submission_status", null);
      registrationQuery = applyRemoteIdentitySnapshot(
        registrationQuery,
        receivable,
      );
      const { data: registered, error: registrationError } =
        await registrationQuery.select().maybeSingle();
      if (registrationError) throw registrationError;
      if (!registered) {
        throw new Error(
          "A cobrança mudou antes de confirmar o canal API existente.",
        );
      }
      return registered;
    }

    let parceiro: any = null;
    if (receivable.cliente_id) {
      const { data, error } = await admin
        .from("parceiros")
        .select("*")
        .eq("id", receivable.cliente_id)
        .maybeSingle();
      if (error) throw error;
      parceiro = data || null;
    }

    const attemptToken = crypto.randomUUID();
    const lockedReceivable = await claimExistingGatewayCheckout({
      admin,
      receivable,
      providerCode: route.providerCode,
      attemptToken,
      receivablePayload: {
        gateway_provider: route.providerCode,
        gateway_environment: runtime.environment,
        gateway_payment_method: route.paymentMethod,
        gateway_last_error: null,
        updated_at: new Date().toISOString(),
      },
    });
    if (!lockedReceivable) {
      const { data: currentReceivable, error: currentError } = await admin
        .from("contas_receber")
        .select("*")
        .eq("id", receivable.id)
        .single();
      if (currentError) throw currentError;
      if (gatewayPrimaryUrl(currentReceivable)) {
        await repairGatewayTransactionFromReceivable(admin, currentReceivable);
        return currentReceivable;
      }
      throw new Error(
        "A cobrança já está sendo sincronizada com o gateway. Aguarde alguns instantes e atualize.",
      );
    }

    let gatewayResult: any;
    try {
      const financialTerms = route.providerCode === "banese_card" &&
          route.paymentMethod === "BOLETO"
        ? await resolveBaneseReceivableFinancialTerms(
          admin,
          lockedReceivable,
        )
        : null;
      gatewayResult = await createGatewayCharge({
        admin,
        supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
        providerCode: route.providerCode,
        environment: runtime.environment,
        paymentMethod: route.paymentMethod,
        receivable: lockedReceivable,
        payer: {
          id: parceiro?.id || lockedReceivable.cliente_id || null,
          name: parceiro?.nome || lockedReceivable.cliente_nome ||
            "Cliente Geral",
          nome: parceiro?.nome || lockedReceivable.cliente_nome ||
            "Cliente Geral",
          email: parceiro?.email || null,
          document: parceiro?.cpf_cnpj || null,
          cpfCnpj: parceiro?.cpf_cnpj || null,
          phone: parceiro?.telefone || null,
          endereco: parceiro?.endereco || null,
          numero: parceiro?.numero || null,
          complemento: parceiro?.complemento || null,
          cep: parceiro?.cep || null,
          bairro: parceiro?.bairro || null,
          cidade: parceiro?.cidade || null,
          uf: parceiro?.uf || null,
        },
        amount: Number(lockedReceivable.valor || 0),
        description: String(
          lockedReceivable.descricao || "Cobrança Universo Cursos",
        ),
        dueDate: lockedReceivable.data_vencimento,
        successUrl: callbackSuccessUrl(),
        failureUrl: callbackSuccessUrl(),
        pendingUrl: callbackSuccessUrl(),
        financialTerms,
      });
    } catch (error) {
      const remotePaymentMayExist = Boolean(
        error && typeof error === "object" &&
          (error as Record<string, unknown>).remotePaymentCreated === true,
      );
      await admin.from("contas_receber").update({
        gateway_status: remotePaymentMayExist ? "CREATING" : null,
        gateway_creation_token: remotePaymentMayExist ? attemptToken : null,
        gateway_last_error: error instanceof Error
          ? error.message
          : String(error),
        ...(remotePaymentMayExist
          ? {
            gateway_submission_channel: "API",
            gateway_submission_status:
              lockedReceivable.gateway_submission_status === "API_REGISTERED"
                ? "API_REGISTERED"
                : "API_AMBIGUOUS",
          }
          : {}),
        updated_at: new Date().toISOString(),
      })
        .eq("id", lockedReceivable.id)
        .eq("gateway_creation_token", attemptToken)
        .eq("gateway_provider", route.providerCode)
        .eq("gateway_environment", runtime.environment)
        .eq("gateway_payment_method", route.paymentMethod)
        .eq("gateway_status", "CREATING")
        .is("gateway_payment_id", null);
      throw error;
    }

    const { data: postCreateSnapshot, error: postCreateSnapshotError } =
      await admin
        .from("contas_receber")
        .select("*")
        .eq("id", lockedReceivable.id)
        .maybeSingle();
    if (postCreateSnapshotError) throw postCreateSnapshotError;
    if (!postCreateSnapshot) {
      throw new Error(
        "Cobranca nao encontrada apos a criacao no gateway.",
      );
    }
    assertGatewayCreationFence({
      receivable: postCreateSnapshot,
      providerCode: route.providerCode,
      environment: runtime.environment,
      paymentMethod: route.paymentMethod,
      attemptToken,
      expectedBankSlipOurNumber: gatewayResult.bankSlipOurNumber,
    });

    let persistQuery = admin
      .from("contas_receber")
      .update({
        ...gatewayReceivableUpdate({
          providerCode: route.providerCode,
          environment: runtime.environment,
          paymentMethod: route.paymentMethod,
          result: gatewayResult,
        }),
        gateway_creation_token: null,
        gateway_submission_channel: "API",
        gateway_submission_status: "API_REGISTERED",
        origem_pagamento: route.providerCode === "mercado_pago"
          ? "MERCADO_PAGO"
          : "BANESE",
      })
      .eq("id", lockedReceivable.id)
      .eq("gateway_provider", route.providerCode)
      .eq("gateway_environment", runtime.environment)
      .eq("gateway_payment_method", route.paymentMethod)
      .eq("gateway_status", "CREATING")
      .is("gateway_payment_id", null)
      .in("status", ["PENDENTE", "VENCIDO"]);
    persistQuery = applyCheckoutAttemptSnapshot(
      persistQuery,
      postCreateSnapshot,
    );
    const { data: updated, error: updateError } = await persistQuery.select()
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      throw new Error(
        "Cobrança mudou de status antes de gravar o gateway. Atualize a tela.",
      );
    }

    await persistProviderGatewayTransaction(admin, {
      receivable: updated,
      providerCode: route.providerCode,
      environment: runtime.environment,
      paymentMethod: route.paymentMethod,
      amount: Number(updated.valor || 0),
      result: gatewayResult,
    });

    return updated;
  };

  const getReceivableSyncDecision = async (receivable: any) => {
    if (!receivable.matricula_id) {
      return { allowed: true, reason: null as string | null };
    }

    const { data: matricula, error } = await admin
      .from("matriculas")
      .select(`
        id,
        financeiro_herdado,
        gerar_cobranca_inicial,
        gerar_cobranca_futura,
        sincronizar_asaas,
        turmas(
          origem_financeira,
          financeiro_herdado,
          gerar_cobrancas_futuras,
          sincronizar_asaas_futuro,
          cursos(id, modalidade)
        )
      `)
      .eq("id", receivable.matricula_id)
      .maybeSingle();
    if (error) throw error;
    if (!matricula) return { allowed: true, reason: null as string | null };

    const turma = Array.isArray(matricula.turmas)
      ? matricula.turmas[0]
      : matricula.turmas;
    const origem = String(turma?.origem_financeira || "NORMAL").toUpperCase();
    const financeiroHerdado = matricula.financeiro_herdado === true ||
      turma?.financeiro_herdado === true ||
      origem === "LEGADO";
    const syncEnabled = matricula.sincronizar_asaas ??
      turma?.sincronizar_asaas_futuro ?? true;
    if (syncEnabled === false) {
      return {
        allowed: false,
        reason: "Sincronização Asaas desativada na matrícula/turma.",
      };
    }

    const launchType = String(receivable.tipo_lancamento || "").toUpperCase();
    if (launchType === "MATRICULA") {
      const gerarInicial = matricula.gerar_cobranca_inicial ??
        !financeiroHerdado;
      if (gerarInicial === false) {
        return {
          allowed: false,
          reason: "Cobrança inicial bloqueada por regra de financeiro legado.",
        };
      }
    } else {
      const gerarFutura = matricula.gerar_cobranca_futura ??
        turma?.gerar_cobrancas_futuras ?? false;
      if (gerarFutura === false) {
        return {
          allowed: false,
          reason: "Cobranças futuras desativadas na matrícula/turma.",
        };
      }
    }

    return { allowed: true, reason: null as string | null };
  };

  const syncFutureInstallmentsIndividually = async (
    runtime: AsaasRuntime,
    matriculaId: string,
    requiredPaymentMethod: "BOLETO" | null = null,
  ) => {
    const { data, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("matricula_id", matriculaId)
      .in("status", ["PENDENTE", "VENCIDO"])
      .is("asaas_payment_id", null)
      .neq("tipo_lancamento", "MATRICULA")
      .order("data_vencimento");
    if (error) throw error;
    for (const item of data || []) {
      let receivable = item;
      if (requiredPaymentMethod === "BOLETO") {
        const decision = decideTechnicalInstallmentPaymentPatch({
          receivable: item,
          hasRemoteReference: hasRemoteTitleReference(item),
        });
        if (decision === "apply") {
          let updateQuery = admin
            .from("contas_receber")
            .update({
              ...buildEnrollmentReceivablePaymentPatch("BOLETO"),
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id)
            .eq("status", item.status);
          updateQuery = item.forma_pagamento === null ||
              item.forma_pagamento === undefined
            ? updateQuery.is("forma_pagamento", null)
            : updateQuery.eq("forma_pagamento", item.forma_pagamento);
          updateQuery = item.gateway_payment_method === null ||
              item.gateway_payment_method === undefined
            ? updateQuery.is("gateway_payment_method", null)
            : updateQuery.eq(
              "gateway_payment_method",
              item.gateway_payment_method,
            );
          updateQuery = applyRemoteIdentitySnapshot(updateQuery, item);
          updateQuery = applyReceivableSnapshotFields(updateQuery, item, [
            "asaas_status",
            "gateway_status",
            "updated_at",
          ]);
          const { data: patched, error: patchError } = await updateQuery
            .select().maybeSingle();
          if (patchError) throw patchError;
          if (!patched) {
            throw new Error(
              "A parcela tecnica mudou durante a definicao do metodo BOLETO. Atualize e tente novamente.",
            );
          }
          receivable = patched;
        }
      }
      await syncReceivable(runtime, receivable.id, true);
    }
    return {
      success: true,
      skipped: false,
      count: data?.length || 0,
      legacyIndividual: true,
    };
  };

  const syncFutureInstallments = async (
    runtime: AsaasRuntime,
    matriculaId: string,
  ) => {
    const modalidade = await resolveMatriculaCourseModality(admin, matriculaId);
    if (!isTecnicoCourseModality(modalidade)) {
      return syncFutureInstallmentsIndividually(runtime, matriculaId);
    }

    const { data: route, error: routeError } = await admin
      .from("payment_gateway_routes")
      .select("provider_code, enabled")
      .eq("modalidade", "TECNICO")
      .eq("payment_method", "BOLETO")
      .eq("environment", runtime.environment)
      .maybeSingle();
    if (routeError) {
      console.error(
        "Nao foi possivel consultar rota bancaria das parcelas tecnicas:",
        routeError,
      );
      throw new Error(
        "Nao foi possivel validar a rota bancaria antes de gerar parcelas tecnicas.",
      );
    }
    if (!route || route.enabled === false) {
      throw new Error(
        `Rota Boleto de TECNICO em ${
          runtime.environment === "production" ? "producao" : "sandbox"
        } nao esta ativa.`,
      );
    }
    assertStoredProviderAdapterReady(
      route.provider_code,
      "BOLETO",
      runtime.environment,
    );
    // O POST em lote /installments nao oferece uma chave externa recuperavel
    // com garantias suficientes para distinguir timeout de rejeicao. Emitimos
    // cada parcela pelo fluxo individual, que possui lock, externalReference e
    // recuperacao canonica antes de qualquer novo POST.
    return syncFutureInstallmentsIndividually(
      runtime,
      matriculaId,
      "BOLETO",
    );
  };

  const REFRESH_STATE_CAS_FIELDS = [
    "status",
    "origem_pagamento",
    "updated_at",
    "asaas_status",
    "gateway_status",
    ...ASAAS_REFRESH_IDENTITY_FIELDS,
  ] as const;

  const refreshSnapshotChanged = (before: any, current: any) =>
    ["status", "origem_pagamento", "updated_at"].some((field) =>
      (before?.[field] ?? null) !== (current?.[field] ?? null)
    ) || hasAsaasRefreshIdentityChanged(before, current);

  const loadReceivableForRefresh = async (receivableId: string) => {
    const { data, error } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error("Cobrança não encontrada durante a atualização.");
    }
    return data;
  };

  const updateReceivableWithRefreshCas = async (
    snapshot: any,
    updates: Record<string, unknown>,
  ) => {
    let query = admin
      .from("contas_receber")
      .update(updates)
      .eq("id", snapshot.id);
    query = applyReceivableSnapshotFields(
      query,
      snapshot,
      REFRESH_STATE_CAS_FIELDS,
    );
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    return data;
  };

  const persistRefreshReview = async (
    snapshot: any,
    input: {
      reason: string;
      paymentId?: unknown;
      paymentStatus?: unknown;
    },
  ) => {
    const message = asaasRefreshReviewMessage(input);
    const now = new Date().toISOString();
    const marked = await updateReceivableWithRefreshCas(snapshot, {
      asaas_last_error: message,
      ...(String(snapshot.gateway_provider || "").toLowerCase() === "asaas"
        ? { gateway_last_error: message }
        : {}),
      updated_at: now,
    });
    if (!marked) {
      throw new Error(
        `${message}. A cobrança mudou novamente antes de registrar a revisão.`,
      );
    }
    return {
      ...marked,
      asaas_refresh_review_required: true,
    };
  };

  const handleRefreshCasConflict = async (
    requestedSnapshot: any,
    input: {
      reason: string;
      paymentId?: unknown;
      paymentStatus?: unknown;
    },
  ) => {
    const current = await loadReceivableForRefresh(requestedSnapshot.id);
    const marked = await persistRefreshReview(current, input);
    if (shouldPreserveReceivableAfterRefreshConflict(current)) return marked;
    throw new Error(marked.asaas_last_error);
  };

  const refreshReceivableStatus = async (
    runtime: AsaasRuntime,
    receivable: any,
  ) => {
    if (!receivable.asaas_payment_id) return receivable;
    assertAsaasApiKey(runtime);
    const requestedPaymentId = receivable.asaas_payment_id;

    let payment: any;
    try {
      payment = await callAsaas(
        runtime,
        `/payments/${requestedPaymentId}`,
      );
    } catch (error) {
      const current = await loadReceivableForRefresh(receivable.id);
      if (
        hasAsaasRefreshIdentityChanged(receivable, current) ||
        (refreshSnapshotChanged(receivable, current) &&
          shouldPreserveReceivableAfterRefreshConflict(current))
      ) {
        return persistRefreshReview(current, {
          reason:
            "estado local alterado enquanto a consulta remota falhou; resultado remoto não aplicado",
          paymentId: requestedPaymentId,
        });
      }

      if (isManualReceivableSettlement(current)) {
        if (!(error instanceof AsaasHttpError) || error.status !== 404) {
          return persistRefreshReview(current, {
            reason:
              "consulta remota falhou; baixa manual preservada sem presumir exclusão do título",
            paymentId: requestedPaymentId,
          });
        }

        const preserved = await updateReceivableWithRefreshCas(current, {
          asaas_status: "DELETED",
          asaas_last_error:
            `Cobrança Asaas anterior não localizada; baixa manual preservada. ${error.message}`,
          updated_at: new Date().toISOString(),
        });
        if (!preserved) {
          return handleRefreshCasConflict(current, {
            reason:
              "baixa manual mudou durante o tratamento de título remoto não localizado",
            paymentId: requestedPaymentId,
          });
        }
        return preserved;
      }
      throw error;
    }

    const current = await loadReceivableForRefresh(receivable.id);
    const paymentStatus = String(payment?.status || "").toUpperCase();
    const identityChangedDuringRemoteRead = hasAsaasRefreshIdentityChanged(
      receivable,
      current,
    );
    if (identityChangedDuringRemoteRead) {
      const marked = await persistRefreshReview(current, {
        reason:
          "identidade remota mudou durante a consulta; resposta antiga não aplicada",
        paymentId: requestedPaymentId,
        paymentStatus,
      });
      if (shouldPreserveReceivableAfterRefreshConflict(current)) return marked;
      throw new Error(marked.asaas_last_error);
    }
    if (
      refreshSnapshotChanged(receivable, current) &&
      shouldPreserveReceivableAfterRefreshConflict(current)
    ) {
      return persistRefreshReview(current, {
        reason:
          "estado terminal ou baixa manual registrado durante a consulta remota",
        paymentId: requestedPaymentId,
        paymentStatus,
      });
    }

    const currentStatus = String(current.status || "").toUpperCase();
    const currentAsaasStatus = String(current.asaas_status || "")
      .toUpperCase();
    const currentPaid = currentStatus === "PAGO" ||
      ["RECEIVED", "CONFIRMED"].includes(currentAsaasStatus);
    const currentManualSettlement = isManualReceivableSettlement(current);

    if (currentPaid && ["DELETED", "OVERDUE"].includes(paymentStatus)) {
      const preserved = await updateReceivableWithRefreshCas(current, {
        asaas_status: paymentStatus || current.asaas_status,
        asaas_last_error: `Atualização Asaas ${
          paymentStatus || "sem status"
        } preservada sem regredir cobrança já paga.`,
        asaas_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!preserved) {
        return handleRefreshCasConflict(current, {
          reason: "cobrança mudou antes de preservar status remoto regressivo",
          paymentId: requestedPaymentId,
          paymentStatus,
        });
      }
      return preserved;
    }

    if (
      currentManualSettlement &&
      ["RECEIVED", "CONFIRMED"].includes(paymentStatus)
    ) {
      const preserved = await updateReceivableWithRefreshCas(current, {
        asaas_payment_id: payment.id || current.asaas_payment_id,
        asaas_payment_link_id: payment.paymentLink ||
          current.asaas_payment_link_id || null,
        asaas_status: paymentStatus,
        asaas_transaction_receipt_url: payment.transactionReceiptUrl ||
          current.asaas_transaction_receipt_url || null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error:
          "Pagamento Asaas confirmado após baixa manual. Revisar possível recebimento duplicado.",
        updated_at: new Date().toISOString(),
      });
      if (!preserved) {
        return handleRefreshCasConflict(current, {
          reason:
            "baixa manual mudou antes de registrar pagamento remoto concorrente",
          paymentId: requestedPaymentId,
          paymentStatus,
        });
      }
      return preserved;
    }

    const updates: Record<string, unknown> = {
      asaas_status: paymentStatus || current.asaas_status,
      asaas_invoice_url: payment?.invoiceUrl || current.asaas_invoice_url,
      asaas_bank_slip_url: payment?.bankSlipUrl ||
        current.asaas_bank_slip_url,
      asaas_installment_id: payment?.installment || payment?.installmentId ||
        current.asaas_installment_id,
      asaas_transaction_receipt_url: payment?.transactionReceiptUrl ||
        current.asaas_transaction_receipt_url || null,
      asaas_synced_at: new Date().toISOString(),
      asaas_last_error: null,
      gateway_provider: "asaas",
      gateway_environment: runtime.environment,
      gateway_payment_method:
        gatewayPaymentMethodOrNull(payment?.billingType) ||
        current.gateway_payment_method || null,
      gateway_payment_id: payment?.id || current.gateway_payment_id ||
        current.asaas_payment_id || null,
      gateway_payment_link_id: payment?.paymentLink ||
        current.gateway_payment_link_id ||
        current.asaas_payment_link_id || null,
      gateway_installment_id: payment?.installment || payment?.installmentId ||
        current.gateway_installment_id || current.asaas_installment_id ||
        null,
      gateway_invoice_url: payment?.invoiceUrl ||
        current.gateway_invoice_url || current.asaas_invoice_url || null,
      gateway_bank_slip_url: payment?.bankSlipUrl ||
        current.gateway_bank_slip_url || current.asaas_bank_slip_url ||
        null,
      gateway_transaction_receipt_url: payment?.transactionReceiptUrl ||
        current.gateway_transaction_receipt_url ||
        current.asaas_transaction_receipt_url || null,
      gateway_status: paymentStatus || current.gateway_status ||
        current.asaas_status || null,
      gateway_synced_at: new Date().toISOString(),
      gateway_last_error: null,
      updated_at: new Date().toISOString(),
    };

    if (["RECEIVED", "CONFIRMED"].includes(paymentStatus)) {
      updates.status = "PAGO";
      updates.valor_pago = Number(payment.value || current.valor);
      updates.data_pagamento = String(
        payment.paymentDate || payment.clientPaymentDate ||
          payment.confirmedDate || new Date().toISOString(),
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

    const updated = await updateReceivableWithRefreshCas(current, updates);
    if (!updated) {
      return handleRefreshCasConflict(current, {
        reason: "cobrança mudou antes de aplicar a atualização remota",
        paymentId: requestedPaymentId,
        paymentStatus,
      });
    }

    if (
      ["RECEIVED", "CONFIRMED"].includes(paymentStatus) &&
      current.matricula_id
    ) {
      await syncFutureInstallments(runtime, current.matricula_id);
    }

    return updated;
  };

  const syncReceivable = async (
    runtime: AsaasRuntime,
    receivableId: string,
    _skipTecnicoCycle = false,
  ) => {
    const { data: initialReceivable, error: receivableError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .single();
    if (receivableError) throw receivableError;
    let receivable = initialReceivable;
    const receivableStatus = String(receivable.status || "").toUpperCase();
    if (receivableStatus === "PAGO") return receivable;

    const hasAsaasCreationLock =
      String(receivable.asaas_status || "").toUpperCase() === "CREATING" ||
      (receivable.gateway_provider === "asaas" &&
        String(receivable.gateway_status || "").toUpperCase() === "CREATING");
    if (
      hasAsaasCreationLock &&
      !receivable.asaas_payment_id &&
      !receivable.asaas_payment_link_id &&
      !receivable.gateway_payment_id &&
      !receivable.gateway_payment_link_id
    ) {
      assertAsaasApiKey(runtime);
      const isDetachedHistoricalLink =
        String(receivable.categoria || "").toUpperCase() ===
          "OUTROS_CREDITOS" && !receivable.cliente_id;
      const recovered = isDetachedHistoricalLink
        ? await recoverDetachedPaymentLink(runtime, receivable)
        : await recoverReceivablePayment(runtime, receivable);
      if (recovered) return recovered;
      throw new Error(
        "A criacao Asaas permanece ambigua. Nenhum novo POST sera feito ate a recuperacao canonica por externalReference.",
      );
    }

    if (
      receivable.gateway_provider === "asaas" &&
      !receivable.asaas_payment_id &&
      !receivable.asaas_payment_link_id &&
      (receivable.gateway_payment_id || receivable.gateway_payment_link_id)
    ) {
      throw new Error(
        "A identidade Asaas esta inconsistente. Reconcilie os identificadores antes de sincronizar novamente.",
      );
    }

    if (receivable.asaas_payment_id) {
      // Um titulo remoto emitido e um snapshot financeiro imutavel. Alteracoes
      // posteriores na turma/matricula valem apenas para novas cobrancas; a
      // sincronizacao deste titulo consulta status sem regravar valor/termos.
      return refreshReceivableStatus(runtime, receivable);
    }

    const existingAsaasPaymentLink = receivable.asaas_payment_link_id ||
      (receivable.gateway_provider === "asaas"
        ? receivable.gateway_payment_link_id
        : null);
    if (existingAsaasPaymentLink) {
      // Links historicos continuam aguardando webhook/conciliacao. A rotina de
      // sincronizacao nunca substitui essa identidade por um novo POST Asaas.
      return receivable;
    }

    if (!["PENDENTE", "VENCIDO"].includes(receivableStatus)) {
      return {
        ...receivable,
        asaas_sync_skipped: true,
        asaas_skip_reason:
          "Cobrança não está pendente/vencida para sincronização Asaas.",
      };
    }

    const syncDecision = await getReceivableSyncDecision(receivable);
    if (!syncDecision.allowed) {
      await admin.from("contas_receber")
        .update({
          origem_pagamento: receivable.origem_pagamento || "LOCAL",
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id);
      return {
        ...receivable,
        asaas_sync_skipped: true,
        asaas_skip_reason: syncDecision.reason,
      };
    }

    const gatewayRoute = requireGatewayRouteForNewCharge(
      await resolveGatewayRouteForReceivable(runtime, receivable),
    );
    if (gatewayRoute?.providerCode && gatewayRoute.providerCode !== "asaas") {
      return syncGatewayReceivable(runtime, receivable, {
        providerCode: gatewayRoute.providerCode,
        paymentMethod: gatewayRoute.paymentMethod,
      });
    }
    throw new Error(
      "Asaas foi desativado para novas cobrancas. Apenas consulta, recuperacao e encerramento seguro de titulos historicos permanecem disponiveis.",
    );
  };

  return {
    buildPaymentPayload,
    ensureCustomer,
    mapBillingType,
    refreshReceivableStatus,
    syncFutureInstallments,
    syncReceivable,
  };
};
