import {
  type AsaasWebhookEnvironment,
  buildAsaasGatewayTransactionPayload,
  moneyInCents,
} from "./receivable-integrity.ts";

const TRANSACTION_SELECT = [
  "id",
  "receivable_id",
  "provider_code",
  "environment",
  "payment_method",
  "remote_payment_id",
  "remote_customer_id",
  "remote_payment_link_id",
  "remote_installment_id",
  "remote_status",
  "amount",
  "fee_value",
  "net_value",
  "invoice_url",
  "bank_slip_url",
  "transaction_receipt_url",
  "raw_payload",
  "last_error",
  "synced_at",
  "updated_at",
].join(",");

const optionalString = (value: unknown) => {
  const result = String(value ?? "").trim();
  return result || null;
};

const applyNullableSnapshot = (
  query: any,
  field: string,
  value: unknown,
) =>
  value === null || value === undefined
    ? query.is(field, null)
    : query.eq(field, value);

export const loadAsaasGatewayTransaction = async (
  admin: any,
  environment: AsaasWebhookEnvironment,
  paymentId: string,
) => {
  const { data, error } = await admin.from("payment_gateway_transactions")
    .select(TRANSACTION_SELECT)
    .eq("provider_code", "asaas")
    .eq("environment", environment)
    .eq("remote_payment_id", paymentId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Falha ao consultar a transação canônica Asaas: ${
        error.message || error
      }`,
    );
  }
  return data || null;
};

export const assertAsaasGatewayTransactionOwnership = (
  transaction: Record<string, unknown> | null,
  receivableId: unknown,
) => {
  if (
    transaction?.receivable_id &&
    optionalString(transaction.receivable_id) !== optionalString(receivableId)
  ) {
    throw new Error(
      "payment_gateway_transactions já vincula o pagamento Asaas a outro recebível",
    );
  }
};

const transactionMatchesPayload = (
  transaction: Record<string, unknown>,
  payload: Record<string, unknown>,
) => {
  const stringFields = [
    "receivable_id",
    "provider_code",
    "environment",
    "payment_method",
    "remote_payment_id",
    "remote_customer_id",
    "remote_payment_link_id",
    "remote_installment_id",
    "remote_status",
    "invoice_url",
    "bank_slip_url",
    "transaction_receipt_url",
    "last_error",
  ];
  if (
    stringFields.some((field) =>
      optionalString(transaction[field]) !== optionalString(payload[field])
    )
  ) return false;
  return ["amount", "fee_value", "net_value"].every((field) =>
    moneyInCents(transaction[field]) === moneyInCents(payload[field])
  );
};

const updateExistingTransaction = async (
  admin: any,
  existing: Record<string, unknown>,
  payload: Record<string, unknown>,
  environment: AsaasWebhookEnvironment,
  paymentId: string,
) => {
  assertAsaasGatewayTransactionOwnership(existing, payload.receivable_id);
  let query = admin.from("payment_gateway_transactions")
    .update(payload)
    .eq("id", existing.id)
    .eq("provider_code", "asaas")
    .eq("environment", environment)
    .eq("remote_payment_id", paymentId);
  query = applyNullableSnapshot(
    query,
    "receivable_id",
    existing.receivable_id,
  );
  query = applyNullableSnapshot(
    query,
    "remote_status",
    existing.remote_status,
  );
  query = applyNullableSnapshot(query, "updated_at", existing.updated_at);
  const { data, error } = await query.select(TRANSACTION_SELECT).maybeSingle();
  if (error) {
    throw new Error(
      `Falha ao sincronizar a transação canônica Asaas: ${
        error.message || error
      }`,
    );
  }
  if (data) return data;

  const concurrent = await loadAsaasGatewayTransaction(
    admin,
    environment,
    paymentId,
  );
  assertAsaasGatewayTransactionOwnership(concurrent, payload.receivable_id);
  if (concurrent && transactionMatchesPayload(concurrent, payload)) {
    return concurrent;
  }
  throw new Error(
    "A transação canônica Asaas mudou durante o CAS; a baixa foi interrompida para conciliação.",
  );
};

export const syncAsaasGatewayTransaction = async (input: {
  admin: any;
  environment: AsaasWebhookEnvironment;
  receivable: Record<string, unknown>;
  payment: Record<string, unknown>;
  syncedAt: string;
  existing?: Record<string, unknown> | null;
}) => {
  const paymentId = optionalString(input.payment.id);
  if (!paymentId) throw new Error("Pagamento Asaas sem ID canônico.");
  const existing = input.existing === undefined
    ? await loadAsaasGatewayTransaction(
      input.admin,
      input.environment,
      paymentId,
    )
    : input.existing;
  assertAsaasGatewayTransactionOwnership(existing, input.receivable.id);

  const payload = buildAsaasGatewayTransactionPayload({
    receivable: input.receivable,
    payment: input.payment,
    environment: input.environment,
    syncedAt: input.syncedAt,
    previousRawPayload: existing?.raw_payload &&
        typeof existing.raw_payload === "object"
      ? existing.raw_payload as Record<string, unknown>
      : null,
  });

  if (existing?.id) {
    return updateExistingTransaction(
      input.admin,
      existing,
      payload,
      input.environment,
      paymentId,
    );
  }

  const { data, error } = await input.admin.from("payment_gateway_transactions")
    .insert(payload)
    .select(TRANSACTION_SELECT)
    .maybeSingle();
  if (!error && data) return data;

  const concurrent = await loadAsaasGatewayTransaction(
    input.admin,
    input.environment,
    paymentId,
  );
  assertAsaasGatewayTransactionOwnership(concurrent, input.receivable.id);
  if (concurrent?.id) {
    return updateExistingTransaction(
      input.admin,
      concurrent,
      payload,
      input.environment,
      paymentId,
    );
  }
  throw new Error(
    `Falha ao registrar a transação canônica Asaas: ${
      error?.message || error || "registro não confirmado"
    }`,
  );
};
