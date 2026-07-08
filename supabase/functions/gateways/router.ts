export type GatewayEnvironment = "sandbox" | "production";
export type GatewayPaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
export type GatewayProviderCode = "asaas" | "mercado_pago" | "banese_card";

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
  rawPayload: Record<string, unknown>;
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
  if (input.providerCode === "asaas") return input;
  const metadata = await providerMetadata(
    input.admin,
    input.providerCode,
    input.environment,
    input.credentialId,
  );
  return {
    ...input,
    receivable: {
      ...(input.receivable || {}),
      metadata: {
        ...(input.receivable?.metadata || {}),
        ...metadata,
      },
      payment_gateway_metadata: metadata,
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
    rawPayload: raw,
  };
};

export const createGatewayCharge = async (
  input: GatewayChargeInput,
): Promise<GatewayChargeResult> => {
  const hydratedInput = await withProviderMetadata(input);
  if (hydratedInput.providerCode === "banese_card") {
    if (hydratedInput.paymentMethod === "CREDIT_CARD") {
      throw new Error(
        "Banese Card nao aceita cartao de credito neste fluxo de checkout.",
      );
    }
    throw new Error(
      "Checkout Banese Card Pix/Boleto esta bloqueado ate homologar payload por cobranca, exibicao do retorno bancario e conciliacao.",
    );
  }

  if (hydratedInput.paymentMethod === "PIX") {
    const { createPixGatewayCharge } = await import("./pix/index.ts");
    const result = await createPixGatewayCharge(hydratedInput);
    return normalizeAdapterResult(hydratedInput.providerCode, "PIX", result);
  }

  if (hydratedInput.paymentMethod === "BOLETO") {
    const { createBoletoGatewayCharge } = await import("./boleto/index.ts");
    const result = await createBoletoGatewayCharge(hydratedInput);
    return normalizeAdapterResult(hydratedInput.providerCode, "BOLETO", result);
  }

  if (hydratedInput.paymentMethod === "CREDIT_CARD") {
    const { createCardGatewayCharge } = await import("./cartao/index.ts");
    const result = await createCardGatewayCharge(hydratedInput);
    return normalizeAdapterResult(
      hydratedInput.providerCode,
      "CREDIT_CARD",
      result,
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
    transaction_receipt_url: null,
    raw_payload: input.result.rawPayload || {},
    last_error: null,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await admin
    .from("payment_gateway_transactions")
    .select("id")
    .eq("provider_code", input.providerCode)
    .eq("environment", input.environment)
    .eq("remote_payment_id", remotePaymentId)
    .maybeSingle();
  if (existingError) {
    console.warn(
      "Nao foi possivel consultar transacao gateway:",
      existingError,
    );
    return;
  }

  const result = existing?.id
    ? await admin.from("payment_gateway_transactions").update(payload).eq(
      "id",
      existing.id,
    )
    : await admin.from("payment_gateway_transactions").insert(payload);
  if (result.error) {
    console.warn("Nao foi possivel persistir transacao gateway:", result.error);
  }
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
  const remotePaymentId = input.result.remotePaymentId ||
    input.result.remotePaymentLinkId;
  const update: Record<string, unknown> = {
    gateway_provider: input.providerCode,
    gateway_environment: input.environment,
    gateway_payment_method: input.paymentMethod,
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
    gateway_transaction_receipt_url:
      (raw as any)?.transactionReceiptUrl || null,
    gateway_status: input.result.remoteStatus,
    gateway_synced_at: new Date().toISOString(),
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
