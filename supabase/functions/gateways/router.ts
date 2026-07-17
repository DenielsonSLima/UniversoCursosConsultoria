import type { BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";

export type GatewayEnvironment = "sandbox" | "production";
export type GatewayPaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
export type GatewayProviderCode = "asaas" | "mercado_pago" | "banese_card";

export type GatewayIssuer = {
  id: string;
  companyId: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
};

export type GatewayChargeInput = {
  admin: any;
  supabaseUrl: string;
  providerCode: GatewayProviderCode;
  environment: GatewayEnvironment;
  paymentMethod: GatewayPaymentMethod;
  credentialId?: string | null;
  receivable: any;
  payer: Record<string, unknown>;
  amount: number;
  description: string;
  dueDate?: string | null;
  installments?: number | null;
  successUrl?: string | null;
  failureUrl?: string | null;
  pendingUrl?: string | null;
  issuer?: GatewayIssuer | null;
  financialTerms?: BaneseFinancialTermsInput | null;
};

export type GatewayChargeResult = {
  providerCode: GatewayProviderCode;
  remotePaymentId: string | null;
  remotePaymentLinkId: string | null;
  remoteCustomerId: string | null;
  remoteStatus: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pixPayload: string | null;
  pixEncodedImage: string | null;
  bankSlipDigitableLine: string | null;
  bankSlipBarcode: string | null;
  bankSlipOurNumber: string | null;
  issuerPoloId: string | null;
  financialTerms: Record<string, unknown> | null;
  rawPayload: Record<string, unknown>;
};

const paymentIssuer = async (admin: any): Promise<GatewayIssuer> => {
  const { data: config, error: configError } = await admin
    .from("payment_gateway_issuer_config")
    .select("issuer_polo_id, active, applies_to_all_polos")
    .eq("id", 1)
    .maybeSingle();
  if (configError) throw configError;
  if (
    !config?.issuer_polo_id ||
    config.active !== true ||
    config.applies_to_all_polos !== true
  ) {
    throw new Error("O emissor financeiro global da matriz nao esta configurado.");
  }

  const { data: issuer, error: issuerError } = await admin
    .from("polos")
    .select("id, company_id, nome, cnpj, cidade, estado, status, is_matriz")
    .eq("id", config.issuer_polo_id)
    .maybeSingle();
  if (issuerError) throw issuerError;
  if (
    !issuer ||
    issuer.is_matriz !== true ||
    String(issuer.status || "").toLowerCase() !== "ativo"
  ) {
    throw new Error("O polo matriz emissor nao esta ativo ou deixou de ser matriz.");
  }

  return {
    id: issuer.id,
    companyId: issuer.company_id,
    name: issuer.nome,
    cnpj: issuer.cnpj,
    city: issuer.cidade,
    state: issuer.estado,
  };
};

const providerMetadata = async (
  admin: any,
  providerCode: GatewayProviderCode,
  environment: GatewayEnvironment,
  credentialId?: string | null,
) => {
  let query = admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", providerCode)
    .eq("environment", environment);
  if (credentialId) query = query.eq("id", credentialId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (credentialId && !data) {
    throw new Error(
      "Credencial bancaria da rota nao pertence ao provedor/ambiente selecionado.",
    );
  }
  return data?.metadata && typeof data.metadata === "object"
    ? data.metadata
    : {};
};

const withProviderMetadata = async (
  input: GatewayChargeInput,
): Promise<GatewayChargeInput> => {
  const [metadata, issuer] = await Promise.all([
    input.providerCode === "asaas"
      ? Promise.resolve({})
      : providerMetadata(
        input.admin,
        input.providerCode,
        input.environment,
        input.credentialId,
      ),
    paymentIssuer(input.admin),
  ]);
  return {
    ...input,
    issuer,
    receivable: {
      ...(input.receivable || {}),
      gateway_issuer_polo_id: issuer.id,
      metadata: {
        ...(input.receivable?.metadata || {}),
        ...metadata,
      },
      payment_gateway_metadata: metadata,
      payment_gateway_issuer: issuer,
    },
  };
};

const normalizeAdapterResult = (
  providerCode: GatewayProviderCode,
  paymentMethod: GatewayPaymentMethod,
  result: any,
): GatewayChargeResult => {
  const raw = result?.raw && typeof result.raw === "object" ? result.raw : {};
  const isHostedCheckoutProvider = providerCode === "mercado_pago" ||
    providerCode === "asaas";
  return {
    providerCode,
    remotePaymentId: result?.id || null,
    remotePaymentLinkId: result?.link || result?.paymentLinkId || result?.paymentLink ||
      (providerCode === "mercado_pago" ? result?.id : null) || null,
    remoteCustomerId: result?.customer || result?.customerId || null,
    remoteStatus: result?.status || "created",
    invoiceUrl: result?.invoiceUrl || result?.link || null,
    bankSlipUrl: result?.bankSlipUrl ||
      (paymentMethod === "BOLETO" ? result?.link || null : null),
    pixPayload: result?.pixPayload ||
      (!isHostedCheckoutProvider && paymentMethod === "PIX"
        ? result?.link || null
        : null),
    pixEncodedImage: result?.pixEncodedImage ||
      result?.pixEncodedImageBase64 ||
      null,
    bankSlipDigitableLine: result?.bankSlipDigitableLine || null,
    bankSlipBarcode: result?.bankSlipBarcode || null,
    bankSlipOurNumber: result?.bankSlipOurNumber || null,
    issuerPoloId: null,
    financialTerms: result?.financialTerms &&
        typeof result.financialTerms === "object"
      ? result.financialTerms
      : null,
    rawPayload: raw,
  };
};

const withIssuerSnapshot = (
  result: GatewayChargeResult,
  issuer?: GatewayIssuer | null,
): GatewayChargeResult => ({
  ...result,
  issuerPoloId: issuer?.id || null,
});

export const createGatewayCharge = async (
  input: GatewayChargeInput,
): Promise<GatewayChargeResult> => {
  const hydratedInput = await withProviderMetadata(input);
  if (hydratedInput.providerCode === "banese_card") {
    if (hydratedInput.environment !== "sandbox") {
      throw new Error(
        "Banese permanece bloqueado em producao ate a conclusao formal da homologacao.",
      );
    }
    if (hydratedInput.paymentMethod === "CREDIT_CARD") {
      throw new Error(
        "Banese nao aceita cartao de credito neste fluxo de checkout.",
      );
    }
  }

  if (hydratedInput.paymentMethod === "PIX") {
    const { createPixGatewayCharge } = await import("./pix/index.ts");
    const result = await createPixGatewayCharge(hydratedInput);
    return withIssuerSnapshot(
      normalizeAdapterResult(hydratedInput.providerCode, "PIX", result),
      hydratedInput.issuer,
    );
  }

  if (hydratedInput.paymentMethod === "BOLETO") {
    const { createBoletoGatewayCharge } = await import("./boleto/index.ts");
    const result = await createBoletoGatewayCharge(hydratedInput);
    return withIssuerSnapshot(
      normalizeAdapterResult(hydratedInput.providerCode, "BOLETO", result),
      hydratedInput.issuer,
    );
  }

  if (hydratedInput.paymentMethod === "CREDIT_CARD") {
    const { createCardGatewayCharge } = await import("./cartao/index.ts");
    const result = await createCardGatewayCharge(hydratedInput);
    return withIssuerSnapshot(
      normalizeAdapterResult(
        hydratedInput.providerCode,
        "CREDIT_CARD",
        result,
      ),
      hydratedInput.issuer,
    );
  }

  throw new Error("Forma de pagamento do gateway bancario invalida.");
};

export const persistGatewayTransaction = async (
  admin: any,
  input: {
    receivable: any;
    inscricaoOnlineId?: string | null;
    providerCode: GatewayProviderCode;
    environment: GatewayEnvironment;
    paymentMethod: GatewayPaymentMethod;
    amount: number;
    installments?: number | null;
    result: GatewayChargeResult;
  },
  options: { insertOnly?: boolean } = {},
) => {
  const remotePaymentId = input.result.remotePaymentId ||
    input.result.remotePaymentLinkId;
  if (!remotePaymentId) return;

  const payload = {
    receivable_id: input.receivable?.id || null,
    inscricao_online_id: input.inscricaoOnlineId || null,
    provider_code: input.providerCode,
    environment: input.environment,
    payment_method: input.paymentMethod,
    origin_polo_id: input.receivable?.polo_id || null,
    issuer_polo_id: input.result.issuerPoloId,
    installments: input.installments || 1,
    remote_payment_id: remotePaymentId,
    remote_customer_id: input.result.remoteCustomerId,
    remote_payment_link_id: input.result.remotePaymentLinkId,
    remote_installment_id: null,
    remote_status: input.result.remoteStatus,
    amount: input.amount,
    fee_value: null,
    net_value: null,
    invoice_url: input.result.invoiceUrl,
    bank_slip_url: input.result.bankSlipUrl,
    pix_payload: input.result.pixPayload,
    pix_encoded_image: input.result.pixEncodedImage,
    bank_slip_digitable_line: input.result.bankSlipDigitableLine,
    bank_slip_barcode: input.result.bankSlipBarcode,
    bank_slip_our_number: input.result.bankSlipOurNumber,
    transaction_receipt_url: null,
    raw_payload: input.result.rawPayload || {},
    last_error: null,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await admin
    .from("payment_gateway_transactions")
    .select("id, raw_payload")
    .eq("provider_code", input.providerCode)
    .eq("environment", input.environment)
    .eq("remote_payment_id", remotePaymentId)
    .maybeSingle();
  if (existingError) {
    throw new Error(
      `Nao foi possivel consultar a auditoria da transacao bancaria: ${existingError.message || existingError}`,
    );
  }
  if (existing?.id && options.insertOnly) return;

  const writePayload = existing?.id
    ? {
      ...payload,
      raw_payload: {
        ...(existing.raw_payload && typeof existing.raw_payload === "object"
          ? existing.raw_payload
          : {}),
        ...payload.raw_payload,
      },
    }
    : payload;
  const result = existing?.id
    ? await admin.from("payment_gateway_transactions").update(writePayload).eq(
      "id",
      existing.id,
    )
    : await admin.from("payment_gateway_transactions").insert(writePayload);
  if (result.error) {
    throw new Error(
      `Cobranca criada, mas a auditoria da transacao bancaria falhou: ${result.error.message || result.error}`,
    );
  }
};

export const gatewayTransactionInputFromReceivable = (receivable: any) => {
  const providerCode = String(receivable?.gateway_provider || "");
  const environment = String(receivable?.gateway_environment || "");
  const paymentMethod = String(receivable?.gateway_payment_method || "");
  const remotePaymentId = receivable?.gateway_payment_id ||
    receivable?.gateway_payment_link_id ||
    receivable?.gateway_boleto_nosso_numero || null;
  if (
    !["asaas", "mercado_pago", "banese_card"].includes(providerCode) ||
    !["sandbox", "production"].includes(environment) ||
    !["PIX", "BOLETO", "CREDIT_CARD"].includes(paymentMethod) ||
    !remotePaymentId
  ) {
    return null;
  }

  return {
    receivable,
    providerCode: providerCode as GatewayProviderCode,
    environment: environment as GatewayEnvironment,
    paymentMethod: paymentMethod as GatewayPaymentMethod,
    amount: Number(receivable.valor || 0),
    installments: Number(receivable.gateway_installments || 1),
    result: {
      providerCode: providerCode as GatewayProviderCode,
      remotePaymentId: String(remotePaymentId),
      remotePaymentLinkId: receivable.gateway_payment_link_id || null,
      remoteCustomerId: receivable.gateway_customer_id || null,
      remoteStatus: receivable.gateway_status || null,
      invoiceUrl: receivable.gateway_invoice_url || null,
      bankSlipUrl: receivable.gateway_bank_slip_url || null,
      pixPayload: receivable.gateway_pix_payload || null,
      pixEncodedImage: receivable.gateway_pix_encoded_image || null,
      bankSlipDigitableLine: receivable.gateway_boleto_linha_digitavel || null,
      bankSlipBarcode: receivable.gateway_boleto_codigo_barras || null,
      bankSlipOurNumber: receivable.gateway_boleto_nosso_numero || null,
      issuerPoloId: receivable.gateway_issuer_polo_id || null,
      financialTerms: receivable.gateway_financial_terms &&
          typeof receivable.gateway_financial_terms === "object"
        ? receivable.gateway_financial_terms
        : null,
      rawPayload: { repairedFromReceivable: true },
    } satisfies GatewayChargeResult,
  };
};

export const repairGatewayTransactionFromReceivable = async (
  admin: any,
  receivable: any,
) => {
  const input = gatewayTransactionInputFromReceivable(receivable);
  if (!input) return false;

  const remotePaymentId = input.result.remotePaymentId ||
    input.result.remotePaymentLinkId;
  const findExistingTransaction = () =>
    admin
      .from("payment_gateway_transactions")
      .select("id")
      .eq("provider_code", input.providerCode)
      .eq("environment", input.environment)
      .eq("remote_payment_id", remotePaymentId)
      .maybeSingle();

  try {
    await persistGatewayTransaction(admin, input, { insertOnly: true });
  } catch (error) {
    // Outra requisicao pode ter reparado a mesma transacao entre a consulta e
    // a insercao. Nesse caso, a restricao unica confirma que o objetivo foi
    // atingido e evita transformar uma corrida inocua em falha de checkout.
    const { data: concurrentRepair, error: concurrentLookupError } =
      await findExistingTransaction();
    if (!concurrentLookupError && concurrentRepair?.id) return true;
    throw error;
  }
  return true;
};

export const gatewayReceivableUpdate = (
  input: {
    providerCode: GatewayProviderCode;
    environment: GatewayEnvironment;
    paymentMethod: GatewayPaymentMethod;
    installments?: number | null;
    result: GatewayChargeResult;
  },
) => {
  const raw = input.result.rawPayload || {};
  const syncedAt = new Date().toISOString();
  const remotePaymentId = input.result.remotePaymentId ||
    input.result.remotePaymentLinkId;
  const update: Record<string, unknown> = {
    gateway_provider: input.providerCode,
    gateway_environment: input.environment,
    gateway_payment_method: input.paymentMethod,
    gateway_issuer_polo_id: input.result.issuerPoloId,
    gateway_installments: input.installments || 1,
    gateway_payment_id: remotePaymentId,
    gateway_customer_id: input.result.remoteCustomerId,
    gateway_payment_link_id: input.result.remotePaymentLinkId,
    gateway_installment_id: (raw as any)?.installment ||
      (raw as any)?.installmentId || null,
    gateway_invoice_url: input.result.invoiceUrl,
    gateway_bank_slip_url: input.result.bankSlipUrl,
    gateway_pix_payload: input.result.pixPayload,
    gateway_pix_encoded_image: input.result.pixEncodedImage,
    gateway_boleto_linha_digitavel: input.result.bankSlipDigitableLine,
    gateway_boleto_codigo_barras: input.result.bankSlipBarcode,
    gateway_boleto_nosso_numero: input.result.bankSlipOurNumber,
    gateway_financial_terms: input.result.financialTerms,
    gateway_financial_terms_confirmed_at: input.result.financialTerms
      ? syncedAt
      : null,
    gateway_transaction_receipt_url:
      (raw as any)?.transactionReceiptUrl || null,
    gateway_status: input.result.remoteStatus,
    gateway_synced_at: syncedAt,
    gateway_last_error: null,
    updated_at: new Date().toISOString(),
  };

  if (input.providerCode === "asaas") {
    update.asaas_payment_id = remotePaymentId;
    update.asaas_payment_link_id = input.result.remotePaymentLinkId;
    update.nosso_numero_asaas = remotePaymentId;
    update.asaas_invoice_url = input.result.invoiceUrl;
    update.asaas_bank_slip_url = input.result.bankSlipUrl;
    update.asaas_installment_id = update.gateway_installment_id;
    update.asaas_transaction_receipt_url =
      update.gateway_transaction_receipt_url;
    update.asaas_status = input.result.remoteStatus;
    update.asaas_synced_at = new Date().toISOString();
    update.asaas_last_error = null;
  }

  return update;
};

const firstUrl = (...values: Array<unknown>) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return null;
};

export const gatewayPrimaryUrl = (receivable: any) =>
  firstUrl(
    receivable?.gateway_invoice_url,
    receivable?.gateway_bank_slip_url,
    receivable?.gateway_payment_link_id,
    receivable?.asaas_invoice_url,
    receivable?.asaas_bank_slip_url,
    receivable?.asaas_payment_link_id,
  ) ||
  null;

export const gatewayOnlyPrimaryUrl = (receivable: any) =>
  firstUrl(
    receivable?.gateway_invoice_url,
    receivable?.gateway_bank_slip_url,
    receivable?.gateway_payment_link_id,
  );
