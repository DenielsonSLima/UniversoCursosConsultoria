export type GatewayEnvironment = "sandbox" | "production";
export type GatewayPaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
export type GatewayProviderCode = "asaas" | "mercado_pago" | "banese_card";

export type GatewayChargeInput = {
  admin: any;
  supabaseUrl: string;
  providerCode: GatewayProviderCode;
  environment: GatewayEnvironment;
  paymentMethod: GatewayPaymentMethod;
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
) => {
  const { data, error } = await admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", providerCode)
    .eq("environment", environment)
    .maybeSingle();
  if (error) throw error;
  return data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
};

const withProviderMetadata = async (input: GatewayChargeInput): Promise<GatewayChargeInput> => {
  if (input.providerCode === "asaas") return input;
  const metadata = await providerMetadata(input.admin, input.providerCode, input.environment);
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
  const isHostedCheckoutProvider = providerCode === "mercado_pago";
  return {
    providerCode,
    remotePaymentId: result?.id || null,
    remotePaymentLinkId: result?.id || null,
    remoteCustomerId: null,
    remoteStatus: result?.status || "created",
    invoiceUrl: result?.link || null,
    bankSlipUrl: paymentMethod === "BOLETO" ? result?.link || null : null,
    pixPayload: !isHostedCheckoutProvider && paymentMethod === "PIX" ? result?.link || null : null,
    pixEncodedImage: null,
    rawPayload: raw,
  };
};

export const createGatewayCharge = async (input: GatewayChargeInput): Promise<GatewayChargeResult> => {
  const hydratedInput = await withProviderMetadata(input);

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
    return normalizeAdapterResult(hydratedInput.providerCode, "CREDIT_CARD", result);
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
    result: GatewayChargeResult;
  },
) => {
  const remotePaymentId = input.result.remotePaymentId || input.result.remotePaymentLinkId;
  if (!remotePaymentId) return;

  const payload = {
    receivable_id: input.receivable?.id || null,
    inscricao_online_id: input.inscricaoOnlineId || null,
    provider_code: input.providerCode,
    environment: input.environment,
    payment_method: input.paymentMethod,
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
    console.warn("Nao foi possivel consultar transacao gateway:", existingError);
    return;
  }

  const result = existing?.id
    ? await admin.from("payment_gateway_transactions").update(payload).eq("id", existing.id)
    : await admin.from("payment_gateway_transactions").insert(payload);
  if (result.error) console.warn("Nao foi possivel persistir transacao gateway:", result.error);
};

export const gatewayReceivableUpdate = (
  input: {
    providerCode: GatewayProviderCode;
    environment: GatewayEnvironment;
    paymentMethod: GatewayPaymentMethod;
    result: GatewayChargeResult;
  },
) => ({
  gateway_provider: input.providerCode,
  gateway_environment: input.environment,
  gateway_payment_method: input.paymentMethod,
  gateway_payment_id: input.result.remotePaymentId || input.result.remotePaymentLinkId,
  gateway_customer_id: input.result.remoteCustomerId,
  gateway_payment_link_id: input.result.remotePaymentLinkId,
  gateway_installment_id: null,
  gateway_invoice_url: input.result.invoiceUrl,
  gateway_bank_slip_url: input.result.bankSlipUrl,
  gateway_pix_payload: input.result.pixPayload,
  gateway_pix_encoded_image: input.result.pixEncodedImage,
  gateway_transaction_receipt_url: null,
  gateway_status: input.result.remoteStatus,
  gateway_synced_at: new Date().toISOString(),
  gateway_last_error: null,
  updated_at: new Date().toISOString(),
});

export const gatewayPrimaryUrl = (receivable: any) =>
  receivable?.gateway_invoice_url
  || receivable?.gateway_bank_slip_url
  || receivable?.asaas_invoice_url
  || receivable?.asaas_bank_slip_url
  || null;
