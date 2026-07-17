import {
  activateEnrollmentAfterPayment,
  syncOnlineInscriptionPayment,
} from "../domain/ead-enrollment.ts";
import type { GatewayWebhookContext } from "../types.ts";
import { fetchMercadoPagoResource } from "./mercado-pago/client.ts";
import {
  legacyPaymentMethod,
  methodForMercadoPago,
  statusForMercadoPago,
} from "./mercado-pago/mappers.ts";
import {
  pixPayloadFor,
  transactionUrlFor,
} from "./mercado-pago/normalizers.ts";
import {
  findMercadoPagoReceivable,
  updateMercadoPagoReceivable,
} from "./mercado-pago/receivables.ts";
import {
  firstString,
  MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
  normalizeRemotePaymentId,
  PENDENTE_INSCRICAO_STATUS,
} from "./mercado-pago/shared.ts";
import { syncMercadoPagoTransaction } from "./mercado-pago/transactions.ts";

export const processMercadoPagoWebhook = async (
  context: GatewayWebhookContext,
) => {
  const paymentId = normalizeRemotePaymentId(
    firstString(context.remotePaymentId),
  );
  if (!paymentId) {
    return { processed: true, ignored: true, reason: "missing_payment_id" };
  }

  const payment = await fetchMercadoPagoResource(context, paymentId);
  const receivable = await findMercadoPagoReceivable(context, payment);
  if (!receivable) {
    return { processed: true, ignored: true, reason: "receivable_not_found" };
  }

  const localStatus = statusForMercadoPago(payment.status);
  const paymentMethod = methodForMercadoPago(
    payment,
    receivable.gateway_payment_method,
  );
  const invoiceUrl = transactionUrlFor(payment) ||
    receivable.gateway_invoice_url ||
    null;
  const pix = pixPayloadFor(payment);

  await syncMercadoPagoTransaction(context, {
    receivable,
    payment,
    paymentMethod,
    invoiceUrl,
    pixPayload: pix.payload,
    pixEncodedImage: pix.encodedImage,
  });

  await updateMercadoPagoReceivable(context, {
    receivable,
    payment,
    localStatus,
    paymentMethod,
  });

  await syncOnlineInscriptionPayment(context, {
    receivable,
    gatewayProvider: MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
    environment: context.environment,
    paymentId: normalizeRemotePaymentId(
      firstString(payment.id, context.remotePaymentId),
    ),
    paymentLinkId: firstString(
      payment.preference_id,
      receivable.gateway_payment_link_id,
    ),
    localStatus,
    legacyPaymentMethod: legacyPaymentMethod(paymentMethod),
    pendingStatus: PENDENTE_INSCRICAO_STATUS,
  });
  if (localStatus === "PAGO") {
    await activateEnrollmentAfterPayment(context, receivable);
  }

  return {
    processed: true,
    ignored: false,
    receivableId: receivable.id,
    localStatus,
    remoteStatus: firstString(payment.status),
  };
};
