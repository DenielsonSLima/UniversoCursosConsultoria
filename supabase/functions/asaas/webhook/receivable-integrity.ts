export type AsaasWebhookEnvironment = "sandbox" | "production";

export type AsaasReceivableLookupSource =
  | "gateway_payment_id"
  | "asaas_payment_id"
  | "external_reference";

const normalized = (value: unknown) => String(value ?? "").trim().toUpperCase();

const optionalString = (value: unknown) => {
  const result = String(value ?? "").trim();
  return result || null;
};

const finiteMoney = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

export const moneyInCents = (value: unknown) => {
  const result = finiteMoney(value);
  return result === null ? null : Math.round((result + Number.EPSILON) * 100);
};

export const asaasPaymentMethod = (billingType: unknown) => {
  const value = normalized(billingType);
  if (value === "PIX") return "PIX";
  if (value === "BOLETO") return "BOLETO";
  if (value === "CREDIT_CARD") return "CREDIT_CARD";
  return null;
};

const localPaymentMethod = (receivable: Record<string, unknown>) => {
  const gatewayMethod = asaasPaymentMethod(
    receivable.gateway_payment_method,
  );
  if (gatewayMethod) return gatewayMethod;
  const legacy = normalized(
    receivable.forma_pagamento || receivable.origem_pagamento,
  );
  if (legacy.includes("PIX")) return "PIX";
  if (legacy.includes("BOLETO")) return "BOLETO";
  if (legacy.includes("CART")) return "CREDIT_CARD";
  return null;
};

const paymentCurrency = (payment: Record<string, unknown>) =>
  normalized(
    payment.currency || payment.currencyCode || payment.currency_code || "BRL",
  );

const distinctConfiguredValues = (
  ...values: unknown[]
) => [...new Set(values.map(optionalString).filter(Boolean))] as string[];

const requireMatchingOptionalIdentity = (
  label: string,
  expectedValues: unknown[],
  receivedValue: unknown,
) => {
  const expected = distinctConfiguredValues(...expectedValues);
  if (expected.length > 1) {
    return `${label} local está divergente entre os campos canônicos e legados`;
  }
  if (!expected.length) return null;
  const received = optionalString(receivedValue);
  if (!received) return `${label} não veio no pagamento remoto`;
  return received === expected[0]
    ? null
    : `${label} do pagamento remoto não pertence ao recebível`;
};

export const validateAsaasWebhookPayment = (input: {
  receivable: Record<string, unknown>;
  payment: Record<string, unknown>;
  environment: AsaasWebhookEnvironment;
  lookupSource: AsaasReceivableLookupSource;
}) => {
  const { receivable, payment, environment } = input;
  const paymentId = optionalString(payment.id);
  if (!paymentId) return "pagamento remoto sem identificador";

  if (normalized(receivable.gateway_provider) !== "ASAAS") {
    return "recebível pertence a outro provedor";
  }
  if (normalized(receivable.gateway_environment) !== normalized(environment)) {
    return "recebível pertence a outro ambiente";
  }

  const localCurrency = normalized(
    receivable.currency || receivable.moeda || "BRL",
  );
  const remoteCurrency = paymentCurrency(payment);
  if (localCurrency !== "BRL" || remoteCurrency !== "BRL") {
    return `moeda divergente: esperado BRL, recebido ${
      remoteCurrency || "vazio"
    }`;
  }

  const expectedAmount = moneyInCents(receivable.valor);
  const remoteAmount = moneyInCents(payment.value);
  if (
    expectedAmount === null || expectedAmount <= 0 || remoteAmount === null ||
    remoteAmount <= 0 || expectedAmount !== remoteAmount
  ) {
    return "valor do pagamento remoto diverge do valor do recebível";
  }

  const remoteMethod = asaasPaymentMethod(payment.billingType);
  const expectedMethod = localPaymentMethod(receivable);
  if (!remoteMethod) return "forma de pagamento remota ausente ou inválida";
  if (expectedMethod && remoteMethod !== expectedMethod) {
    return "forma de pagamento remota diverge do recebível";
  }

  const externalReference = optionalString(payment.externalReference);
  if (externalReference !== optionalString(receivable.id)) {
    return "externalReference não identifica exatamente o recebível";
  }

  const paymentIdentityError = requireMatchingOptionalIdentity(
    "identificador do pagamento",
    [
      receivable.gateway_payment_id,
      receivable.asaas_payment_id,
      receivable.nosso_numero_asaas,
    ],
    paymentId,
  );
  if (paymentIdentityError) return paymentIdentityError;

  const customerIdentityError = requireMatchingOptionalIdentity(
    "cliente Asaas",
    [receivable.gateway_customer_id],
    payment.customer,
  );
  if (customerIdentityError) return customerIdentityError;

  const linkIdentityError = requireMatchingOptionalIdentity(
    "link de pagamento Asaas",
    [receivable.gateway_payment_link_id, receivable.asaas_payment_link_id],
    payment.paymentLink,
  );
  if (linkIdentityError) return linkIdentityError;

  const installmentIdentityError = requireMatchingOptionalIdentity(
    "parcelamento Asaas",
    [receivable.gateway_installment_id, receivable.asaas_installment_id],
    payment.installment || payment.installmentId,
  );
  if (installmentIdentityError) return installmentIdentityError;

  return null;
};

const remoteStatusRank = (status: unknown) => {
  const value = normalized(status);
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK"].includes(value)) {
    return 50;
  }
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(value)) {
    return 40;
  }
  if (["DELETED", "CANCELED", "CANCELLED"].includes(value)) return 30;
  if (["OVERDUE", "DUNNING_REQUESTED"].includes(value)) return 20;
  if (value) return 10;
  return 0;
};

export const nonRegressiveAsaasRemoteStatus = (
  current: unknown,
  incoming: unknown,
) =>
  remoteStatusRank(current) > remoteStatusRank(incoming)
    ? optionalString(current)
    : optionalString(incoming) || optionalString(current);

const TERMINAL_LOCAL_STATUSES = new Set([
  "PAGO",
  "CANCELADO",
  "ESTORNADO",
  "DEVOLVIDO",
]);

export const terminalReceivableConflictReason = (
  receivable: Record<string, unknown>,
  incomingStatus: unknown,
) => {
  const current = normalized(receivable.status);
  const incoming = normalized(incomingStatus);
  if (!TERMINAL_LOCAL_STATUSES.has(current) || !incoming) return null;
  if (current === incoming) return null;
  return `evento com estado ${incoming} não pode substituir o estado terminal ${current}`;
};

const canonicalValue = (
  remote: unknown,
  legacy: unknown,
  gateway: unknown,
) =>
  optionalString(remote) || optionalString(legacy) || optionalString(gateway);

export const buildCanonicalAsaasWebhookFields = (input: {
  receivable: Record<string, unknown>;
  payment: Record<string, unknown>;
  environment: AsaasWebhookEnvironment;
  eventType: string;
  syncedAt: string;
  transactionStatus?: unknown;
}) => {
  const {
    receivable,
    payment,
    environment,
    eventType,
    syncedAt,
    transactionStatus,
  } = input;
  const paymentId = optionalString(payment.id)!;
  const paymentLinkId = canonicalValue(
    payment.paymentLink,
    receivable.asaas_payment_link_id,
    receivable.gateway_payment_link_id,
  );
  const installmentId = canonicalValue(
    payment.installment || payment.installmentId,
    receivable.asaas_installment_id,
    receivable.gateway_installment_id,
  );
  const invoiceUrl = canonicalValue(
    payment.invoiceUrl,
    receivable.asaas_invoice_url,
    receivable.gateway_invoice_url,
  );
  const bankSlipUrl = canonicalValue(
    payment.bankSlipUrl,
    receivable.asaas_bank_slip_url,
    receivable.gateway_bank_slip_url,
  );
  const receiptUrl = canonicalValue(
    payment.transactionReceiptUrl,
    receivable.asaas_transaction_receipt_url,
    receivable.gateway_transaction_receipt_url,
  );
  const incomingStatus = optionalString(payment.status) ||
    optionalString(eventType.replace("PAYMENT_", ""));
  const currentRemoteStatus = [
    receivable.asaas_status,
    receivable.gateway_status,
    transactionStatus,
  ].reduce(
    (strongest, status) => nonRegressiveAsaasRemoteStatus(strongest, status),
    null as string | null,
  );
  const remoteStatus = nonRegressiveAsaasRemoteStatus(
    currentRemoteStatus,
    incomingStatus,
  );
  const paymentMethod = asaasPaymentMethod(payment.billingType)!;
  const netValue = finiteMoney(payment.netValue) ??
    finiteMoney(receivable.asaas_net_value) ??
    finiteMoney(receivable.gateway_net_value);
  const explicitFee = finiteMoney(payment.feeValue);
  const grossValue = finiteMoney(payment.value);
  const feeValue = explicitFee ??
    (grossValue !== null && netValue !== null
      ? Math.max(0, Number((grossValue - netValue).toFixed(2)))
      : finiteMoney(receivable.asaas_fee_value) ??
        finiteMoney(receivable.gateway_fee_value));

  return {
    asaas_payment_id: paymentId,
    asaas_payment_link_id: paymentLinkId,
    nosso_numero_asaas: paymentId,
    asaas_invoice_url: invoiceUrl,
    asaas_bank_slip_url: bankSlipUrl,
    asaas_installment_id: installmentId,
    asaas_transaction_receipt_url: receiptUrl,
    asaas_status: remoteStatus,
    asaas_fee_value: feeValue,
    asaas_net_value: netValue,
    asaas_synced_at: syncedAt,
    asaas_last_error: null,
    gateway_provider: "asaas",
    gateway_environment: environment,
    gateway_payment_method: paymentMethod,
    gateway_payment_id: paymentId,
    gateway_customer_id: optionalString(payment.customer) ||
      optionalString(receivable.gateway_customer_id),
    gateway_payment_link_id: paymentLinkId,
    gateway_installment_id: installmentId,
    gateway_invoice_url: invoiceUrl,
    gateway_bank_slip_url: bankSlipUrl,
    gateway_transaction_receipt_url: receiptUrl,
    gateway_status: remoteStatus,
    gateway_fee_value: feeValue,
    gateway_net_value: netValue,
    gateway_synced_at: syncedAt,
    gateway_last_error: null,
    updated_at: syncedAt,
  };
};

export const buildAsaasGatewayTransactionPayload = (input: {
  receivable: Record<string, unknown>;
  payment: Record<string, unknown>;
  environment: AsaasWebhookEnvironment;
  syncedAt: string;
  previousRawPayload?: Record<string, unknown> | null;
}) => {
  const { receivable, payment, environment, syncedAt, previousRawPayload } =
    input;
  return {
    receivable_id: receivable.id,
    provider_code: "asaas",
    environment,
    payment_method: receivable.gateway_payment_method,
    remote_payment_id: receivable.gateway_payment_id,
    remote_customer_id: receivable.gateway_customer_id || null,
    remote_payment_link_id: receivable.gateway_payment_link_id || null,
    remote_installment_id: receivable.gateway_installment_id || null,
    remote_status: receivable.gateway_status || null,
    amount: Number(receivable.valor),
    fee_value: receivable.gateway_fee_value ?? null,
    net_value: receivable.gateway_net_value ?? null,
    invoice_url: receivable.gateway_invoice_url || null,
    bank_slip_url: receivable.gateway_bank_slip_url || null,
    transaction_receipt_url: receivable.gateway_transaction_receipt_url || null,
    raw_payload: {
      ...(previousRawPayload || {}),
      asaas: payment,
      webhook: { environment, syncedAt },
    },
    last_error: receivable.gateway_last_error || null,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
};
