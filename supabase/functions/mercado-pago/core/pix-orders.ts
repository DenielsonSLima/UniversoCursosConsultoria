import {
  MERCADO_PAGO_PAYMENTS_URL,
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
  mercadoPagoWebhookUrl,
  payerIdentification,
  payerNameParts,
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
    externalReference &&
      `ead-pix-payment-${input.environment}-${externalReference}`,
    crypto.randomUUID(),
  );
  const { firstName, lastName } = payerNameParts(payer);
  const identification = payerIdentification(payer);

  const payload = {
    transaction_amount: Number(input.amount.toFixed(2)),
    description: description.slice(0, 255),
    payment_method_id: "pix",
    external_reference: externalReference || idempotencyKey,
    notification_url: mercadoPagoWebhookUrl(
      input.supabaseUrl,
      input.environment,
    ),
    payer: {
      email,
      first_name: firstName,
      last_name: lastName,
      identification,
    },
    metadata: {
      provider_code: MERCADO_PAGO_PROVIDER_CODE,
      environment: input.environment,
      payment_method: "PIX",
      receivable_id: externalReference || undefined,
      due_date: input.dueDate || undefined,
      description: description.slice(0, 255),
    },
  };

  const response = await fetch(MERCADO_PAGO_PAYMENTS_URL, {
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
      `Mercado Pago recusou a criacao do Pix (${response.status}): ${rawMessage}`,
    );
  }

  const rawRecord = asRecord(raw);
  const pointOfInteraction = asRecord(rawRecord.point_of_interaction);
  const transactionData = asRecord(pointOfInteraction.transaction_data);
  const paymentId = stringValue(rawRecord.id);
  const pixPayload = firstString(transactionData.qr_code);
  const pixEncodedImage = firstString(
    transactionData.qr_code_base64,
  );
  const ticketUrl = firstString(transactionData.ticket_url);

  if (!paymentId || !pixPayload) {
    throw new MercadoPagoAdapterError(
      "Mercado Pago retornou Pix sem QR Code.",
    );
  }

  return {
    id: paymentId,
    link: ticketUrl || null,
    invoiceUrl: ticketUrl || null,
    status: firstString(rawRecord.status, "pending"),
    pixPayload,
    pixEncodedImage,
    raw,
  };
};
