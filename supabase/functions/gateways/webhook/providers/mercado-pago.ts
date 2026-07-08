import { getMercadoPagoAccessToken } from "../../../mercado-pago/core/adapter.ts";
import type { GatewayWebhookContext } from "../types.ts";

const MERCADO_PAGO_PAYMENT_URL = "https://api.mercadopago.com/v1/payments";
const MERCADO_PAGO_ORDER_URL = "https://api.mercadopago.com/v1/orders";
const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
};

const normalizeRemotePaymentId = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const paymentPathMatch = text.match(/\/payments?\/([^/?#]+)/i);
  if (paymentPathMatch?.[1]) return decodeURIComponent(paymentPathMatch[1]);
  const urlLikeMatch = text.match(/(?:^|[?&])id=([^&#]+)/i);
  if (urlLikeMatch?.[1]) return decodeURIComponent(urlLikeMatch[1]);
  return text;
};

const statusForMercadoPago = (status: unknown) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["approved", "paid", "processed"].includes(normalized)) return "PAGO";
  if (["cancelled", "rejected", "refunded", "charged_back"].includes(normalized)) return "CANCELADO";
  if (["pending", "in_process", "authorized", "action_required"].includes(normalized)) return PENDENTE_INSCRICAO_STATUS;
  return null;
};

const methodForMercadoPago = (payment: Record<string, unknown>, fallback?: string | null) => {
  const methodId = String(payment.payment_method_id || "").toLowerCase();
  const typeId = String(payment.payment_type_id || "").toLowerCase();
  if (methodId === "pix" || typeId === "bank_transfer") return "PIX";
  if (typeId === "credit_card") return "CREDIT_CARD";
  if (typeId === "ticket") return "BOLETO";
  return fallback || null;
};

const legacyPaymentMethod = (method: string | null) => {
  if (method === "CREDIT_CARD") return "CARTAO";
  if (method === "BOLETO") return "BOLETO";
  return "PIX";
};

const paymentDate = (payment: Record<string, unknown>) =>
  firstString(payment.date_approved, payment.money_release_date, payment.date_last_updated, new Date().toISOString())
    .slice(0, 10);

const transactionUrlFor = (payment: Record<string, unknown>) => {
  const transactionDetails = asRecord(payment.transaction_details);
  const pointOfInteraction = asRecord(payment.point_of_interaction);
  const transactionData = asRecord(pointOfInteraction.transaction_data);
  return firstString(
    transactionDetails.external_resource_url,
    transactionData.ticket_url,
  );
};

const pixPayloadFor = (payment: Record<string, unknown>) => {
  const pointOfInteraction = asRecord(payment.point_of_interaction);
  const transactionData = asRecord(pointOfInteraction.transaction_data);
  return {
    payload: firstString(transactionData.qr_code),
    encodedImage: firstString(transactionData.qr_code_base64),
  };
};

const installmentsFor = (payment: Record<string, unknown>, receivable: any) =>
  firstNumber(payment.installments, receivable.gateway_installments, 1) || 1;

const fetchPayment = async (context: GatewayWebhookContext, paymentId: string) => {
  const normalizedPaymentId = normalizeRemotePaymentId(paymentId);
  if (!normalizedPaymentId) throw new Error("Webhook Mercado Pago sem id de pagamento.");
  const token = await getMercadoPagoAccessToken(context.admin, context.environment);
  const response = await fetch(`${MERCADO_PAGO_PAYMENT_URL}/${encodeURIComponent(normalizedPaymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text().catch(() => "");
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Mercado Pago recusou consulta do pagamento (${response.status}): ${text}`);
  }
  return asRecord(body);
};

const paymentFromOrder = (order: Record<string, unknown>) => {
  const transactions = asRecord(order.transactions);
  const payments = Array.isArray(transactions.payments) ? transactions.payments : [];
  const payment = asRecord(payments[0]);
  const paymentMethod = asRecord(payment.payment_method);
  const qrCode = firstString(paymentMethod.qr_code, payment.qr_code);
  const qrCodeBase64 = firstString(paymentMethod.qr_code_base64, payment.qr_code_base64);
  const ticketUrl = firstString(paymentMethod.ticket_url, payment.ticket_url);
  const status = firstString(payment.status, order.status);
  const statusDetail = firstString(payment.status_detail, order.status_detail);
  const amount = firstNumber(payment.amount, order.total_amount);

  return {
    ...payment,
    id: firstString(payment.id, order.id),
    external_reference: firstString(order.external_reference, payment.external_reference),
    status,
    status_detail: statusDetail,
    transaction_amount: amount,
    total_paid_amount: amount,
    payment_method_id: firstString(paymentMethod.id, payment.payment_method_id),
    payment_type_id: firstString(paymentMethod.type, payment.payment_type_id),
    point_of_interaction: {
      transaction_data: {
        qr_code: qrCode,
        qr_code_base64: qrCodeBase64,
        ticket_url: ticketUrl,
      },
    },
    metadata: {
      ...asRecord(order.metadata),
      ...asRecord(payment.metadata),
    },
    order_id: firstString(order.id),
    raw_order: order,
  };
};

const fetchOrder = async (context: GatewayWebhookContext, orderId: string) => {
  const normalizedOrderId = normalizeRemotePaymentId(orderId);
  if (!normalizedOrderId) throw new Error("Webhook Mercado Pago sem id da order.");
  const token = await getMercadoPagoAccessToken(context.admin, context.environment);
  const response = await fetch(`${MERCADO_PAGO_ORDER_URL}/${encodeURIComponent(normalizedOrderId)}`, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text().catch(() => "");
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Mercado Pago recusou consulta da order (${response.status}): ${text}`);
  }
  return paymentFromOrder(asRecord(body));
};

const fetchMercadoPagoResource = async (
  context: GatewayWebhookContext,
  remoteId: string,
) => {
  const eventType = firstString(context.payload?.type, context.payload?.topic);
  const normalizedRemoteId = normalizeRemotePaymentId(remoteId);
  if (
    eventType.toLowerCase() === "order" ||
    normalizedRemoteId.toUpperCase().startsWith("ORD")
  ) {
    return fetchOrder(context, normalizedRemoteId);
  }
  return fetchPayment(context, normalizedRemoteId);
};

const findReceivable = async (
  context: GatewayWebhookContext,
  payment: Record<string, unknown>,
) => {
  const metadata = asRecord(payment.metadata);
  const receivableId = firstString(
    payment.external_reference,
    metadata.receivable_id,
    metadata.receivableId,
  );

  if (UUID_RE.test(receivableId)) {
    const { data, error } = await context.admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .eq("gateway_provider", "mercado_pago")
      .eq("gateway_environment", context.environment)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const paymentId = normalizeRemotePaymentId(firstString(payment.id, context.remotePaymentId));
  if (paymentId) {
    const { data: transaction, error } = await context.admin
      .from("payment_gateway_transactions")
      .select("receivable_id")
      .eq("provider_code", "mercado_pago")
      .eq("environment", context.environment)
      .eq("remote_payment_id", paymentId)
      .maybeSingle();
    if (error) throw error;
    if (transaction?.receivable_id) {
      const { data, error: receivableError } = await context.admin
        .from("contas_receber")
        .select("*")
        .eq("id", transaction.receivable_id)
        .maybeSingle();
      if (receivableError) throw receivableError;
      if (data) return data;
    }
  }

  return null;
};

const syncTransaction = async (
  context: GatewayWebhookContext,
  input: {
    receivable: any;
    payment: Record<string, unknown>;
    paymentMethod: string | null;
    invoiceUrl: string | null;
    pixPayload: string | null;
    pixEncodedImage: string | null;
  },
) => {
  const remotePaymentId = normalizeRemotePaymentId(firstString(input.payment.id, context.remotePaymentId));
  if (!remotePaymentId) return;

  const preferenceId = firstString(input.payment.preference_id, input.receivable.gateway_payment_link_id);
  const amount = firstNumber(input.payment.transaction_amount, input.payment.total_paid_amount, input.receivable.valor);
  const installments = installmentsFor(input.payment, input.receivable);
  const payload = {
    receivable_id: input.receivable.id,
    provider_code: "mercado_pago",
    environment: context.environment,
    payment_method: input.paymentMethod || input.receivable.gateway_payment_method,
    installments,
    remote_payment_id: remotePaymentId,
    remote_payment_link_id: preferenceId || input.receivable.gateway_payment_link_id,
    remote_status: firstString(input.payment.status, input.receivable.gateway_status),
    amount: amount ?? input.receivable.valor,
    invoice_url: input.invoiceUrl || input.receivable.gateway_invoice_url,
    bank_slip_url: input.paymentMethod === "BOLETO" ? input.invoiceUrl || input.receivable.gateway_bank_slip_url : null,
    pix_payload: input.paymentMethod === "PIX" ? input.pixPayload || input.receivable.gateway_pix_payload : null,
    pix_encoded_image: input.paymentMethod === "PIX"
      ? input.pixEncodedImage || input.receivable.gateway_pix_encoded_image
      : null,
    raw_payload: input.payment,
    last_error: null,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await context.admin
    .from("payment_gateway_transactions")
    .select("id")
    .eq("provider_code", "mercado_pago")
    .eq("environment", context.environment)
    .eq("receivable_id", input.receivable.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const result = existing?.id
    ? await context.admin.from("payment_gateway_transactions").update(payload).eq("id", existing.id)
    : await context.admin.from("payment_gateway_transactions").insert(payload);
  if (result.error) throw result.error;
};

const activateEnrollment = async (context: GatewayWebhookContext, receivable: any) => {
  if (!receivable?.matricula_id) return;
  if (String(receivable.tipo_lancamento || "").toUpperCase() !== "MATRICULA") return;

  const { data: matricula, error } = await context.admin
    .from("matriculas")
    .select("id, status, turmas(cursos(id, modalidade))")
    .eq("id", receivable.matricula_id)
    .maybeSingle();
  if (error) throw error;

  const turma = Array.isArray(matricula?.turmas) ? matricula?.turmas?.[0] : matricula?.turmas;
  const course = Array.isArray(turma?.cursos) ? turma?.cursos?.[0] : turma?.cursos;
  if (String(course?.modalidade || "").toUpperCase() !== "EAD") return;

  const { error: updateError } = await context.admin
    .from("matriculas")
    .update({ status: "ATIVO" })
    .eq("id", receivable.matricula_id);
  if (updateError) throw updateError;
};

const syncOnlineInscription = async (
  context: GatewayWebhookContext,
  input: {
    receivable: any;
    payment: Record<string, unknown>;
    localStatus: string | null;
    paymentMethod: string | null;
  },
) => {
  if (!input.receivable?.matricula_id) return;

  const paid = input.localStatus === "PAGO";
  const updates: Record<string, unknown> = {
    gateway_provider: "mercado_pago",
    gateway_environment: context.environment,
    gateway_payment_id: normalizeRemotePaymentId(firstString(input.payment.id, context.remotePaymentId)),
    gateway_payment_link_id: firstString(input.payment.preference_id, input.receivable.gateway_payment_link_id),
    status: paid ? "PAGO" : input.localStatus || PENDENTE_INSCRICAO_STATUS,
    forma_pagamento: legacyPaymentMethod(input.paymentMethod),
    erro: null,
    updated_at: new Date().toISOString(),
  };

  if (paid) {
    updates.pago_em = new Date().toISOString();
    updates.confirmado_em = new Date().toISOString();
  }

  const { error } = await context.admin
    .from("inscricoes_online")
    .update(updates)
    .eq("matricula_id", input.receivable.matricula_id)
    .eq("gateway_provider", "mercado_pago");
  if (error) throw error;
};

export const processMercadoPagoWebhook = async (context: GatewayWebhookContext) => {
  const paymentId = normalizeRemotePaymentId(firstString(context.remotePaymentId));
  if (!paymentId) return { processed: true, ignored: true, reason: "missing_payment_id" };

  const payment = await fetchMercadoPagoResource(context, paymentId);
  const receivable = await findReceivable(context, payment);
  if (!receivable) return { processed: true, ignored: true, reason: "receivable_not_found" };

  const localStatus = statusForMercadoPago(payment.status);
  const paymentMethod = methodForMercadoPago(payment, receivable.gateway_payment_method);
  const invoiceUrl = transactionUrlFor(payment) || receivable.gateway_invoice_url || null;
  const pix = pixPayloadFor(payment);
  const installments = installmentsFor(payment, receivable);

  await syncTransaction(context, {
    receivable,
    payment,
    paymentMethod,
    invoiceUrl,
    pixPayload: pix.payload,
    pixEncodedImage: pix.encodedImage,
  });

  const currentPaid = String(receivable.status || "").toUpperCase() === "PAGO";
  const updates: Record<string, unknown> = {
    gateway_provider: "mercado_pago",
    gateway_environment: context.environment,
    gateway_payment_method: paymentMethod || receivable.gateway_payment_method,
    gateway_installments: installments,
    gateway_payment_id: normalizeRemotePaymentId(firstString(payment.id, context.remotePaymentId, receivable.gateway_payment_id)),
    gateway_payment_link_id: firstString(payment.preference_id, receivable.gateway_payment_link_id),
    gateway_invoice_url: invoiceUrl,
    gateway_bank_slip_url: paymentMethod === "BOLETO" ? invoiceUrl || receivable.gateway_bank_slip_url : null,
    gateway_pix_payload: paymentMethod === "PIX" ? pix.payload || receivable.gateway_pix_payload : null,
    gateway_pix_encoded_image: paymentMethod === "PIX" ? pix.encodedImage || receivable.gateway_pix_encoded_image : null,
    gateway_transaction_receipt_url: firstString(
      asRecord(payment.transaction_details).external_resource_url,
      receivable.gateway_transaction_receipt_url,
    ) || null,
    gateway_status: firstString(payment.status, receivable.gateway_status),
    gateway_last_error: null,
    gateway_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (localStatus === "PAGO") {
    updates.status = "PAGO";
    updates.valor_pago = firstNumber(payment.transaction_amount, payment.total_paid_amount, receivable.valor);
    updates.data_pagamento = paymentDate(payment);
    updates.forma_pagamento = legacyPaymentMethod(paymentMethod);
    updates.origem_pagamento = "MERCADO_PAGO";
  } else if (localStatus === "CANCELADO" && !currentPaid) {
    updates.status = "CANCELADO";
  }

  const { error: receivableError } = await context.admin
    .from("contas_receber")
    .update(updates)
    .eq("id", receivable.id);
  if (receivableError) throw receivableError;

  await syncOnlineInscription(context, { receivable, payment, localStatus, paymentMethod });
  if (localStatus === "PAGO") await activateEnrollment(context, receivable);

  return {
    processed: true,
    ignored: false,
    receivableId: receivable.id,
    localStatus,
    remoteStatus: firstString(payment.status),
  };
};
