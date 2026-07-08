import {
  MERCADO_PAGO_ORDERS_URL,
  MERCADO_PAGO_PROVIDER_CODE,
} from "./constants.ts";
import { MercadoPagoAdapterError } from "./errors.ts";
import { getMercadoPagoAccessToken } from "./auth.ts";
import type {
  AdapterCreateChargeInput,
  AdapterCreateChargeResult,
} from "./types.ts";
import {
  asRecord,
  firstString,
  pixExpirationDuration,
  readResponseBody,
  stringValue,
} from "./utils.ts";
import {
  assertAmount,
  assertEnvironment,
  assertPaymentMethod,
} from "./validators.ts";

export const createMercadoPagoPixPayment = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  assertEnvironment(input.environment);
  assertPaymentMethod("PIX");
  assertAmount(input.amount);

  const accessToken = await getMercadoPagoAccessToken(
    input.admin,
    input.environment,
    input,
  );

  const description = stringValue(input.description);
  if (!description) {
    throw new MercadoPagoAdapterError(
      "Descricao da cobranca Mercado Pago e obrigatoria.",
    );
  }

  const payer = input.payer || {};
  const email = firstString(payer.email);
  if (!email) {
    throw new MercadoPagoAdapterError(
      "Email do pagador e obrigatorio para Pix Mercado Pago.",
    );
  }

  const externalReference = firstString(
    input.receivable?.id,
    input.receivable?.externalReference,
    input.receivable?.external_reference,
  );
  const idempotencyKey = firstString(
    externalReference && `ead-pix-order-${input.environment}-${externalReference}`,
    crypto.randomUUID(),
  );
  const amount = input.amount.toFixed(2);
  const expirationTime = pixExpirationDuration(input.dueDate);

  const payload = {
    type: "online",
    total_amount: amount,
    external_reference: externalReference || idempotencyKey,
    processing_mode: "automatic",
    transactions: {
      payments: [
        {
          amount,
          payment_method: {
            id: "pix",
            type: "bank_transfer",
          },
          expiration_time: expirationTime,
        },
      ],
    },
    payer: { email },
    metadata: {
      provider_code: MERCADO_PAGO_PROVIDER_CODE,
      environment: input.environment,
      payment_method: "PIX",
      receivable_id: externalReference || undefined,
      due_date: input.dueDate || undefined,
      description: description.slice(0, 255),
    },
  };

  const response = await fetch(MERCADO_PAGO_ORDERS_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const raw = await readResponseBody(response);

  if (!response.ok) {
    const rawMessage = typeof raw === "string" ? raw : JSON.stringify(raw);
    throw new MercadoPagoAdapterError(
      `Mercado Pago recusou a criacao da order Pix (${response.status}): ${rawMessage}`,
    );
  }

  const rawRecord = asRecord(raw);
  const transactions = asRecord(rawRecord.transactions);
  const payments = Array.isArray(transactions.payments)
    ? transactions.payments
    : [];
  const payment = asRecord(payments[0]);
  const paymentMethod = asRecord(payment.payment_method);
  const orderId = stringValue(rawRecord.id);
  const paymentId = firstString(payment.id, orderId);
  const pixPayload = firstString(paymentMethod.qr_code, payment.qr_code);
  const pixEncodedImage = firstString(
    paymentMethod.qr_code_base64,
    payment.qr_code_base64,
  );
  const ticketUrl = firstString(paymentMethod.ticket_url, payment.ticket_url);

  if (!paymentId || !pixPayload) {
    throw new MercadoPagoAdapterError(
      "Mercado Pago retornou order Pix sem QR Code.",
    );
  }

  return {
    id: paymentId,
    link: ticketUrl || null,
    invoiceUrl: ticketUrl || null,
    status: firstString(payment.status, rawRecord.status, "action_required"),
    pixPayload,
    pixEncodedImage,
    raw,
  };
};
