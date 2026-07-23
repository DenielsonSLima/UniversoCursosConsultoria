import {
  activateEnrollmentAfterPayment,
  syncOnlineInscriptionPayment,
} from "../domain/ead-enrollment.ts";
import type { GatewayWebhookContext } from "../types.ts";
import {
  fetchMercadoPagoPayment,
  unsupportedMercadoPagoEventReason,
} from "./mercado-pago/client.ts";
import {
  legacyPaymentMethod,
  mercadoPagoReviewReason,
  methodForMercadoPago,
  statusForMercadoPago,
} from "./mercado-pago/mappers.ts";
import {
  pixPayloadFor,
  transactionUrlFor,
} from "./mercado-pago/normalizers.ts";
import {
  findMercadoPagoReceivable,
  persistMercadoPagoReview,
  updateMercadoPagoReceivable,
} from "./mercado-pago/receivables.ts";
import {
  firstString,
  MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
  normalizeRemotePaymentId,
  PENDENTE_INSCRICAO_STATUS,
} from "./mercado-pago/shared.ts";
import { syncMercadoPagoTransaction } from "./mercado-pago/transactions.ts";
import {
  assertMercadoPagoPaymentMatches,
  configuredMercadoPagoMerchantId,
} from "./mercado-pago/validation.ts";

export const shouldReplayMercadoPagoSettlementEffects = (input: {
  projection: string;
  localStatus: string | null;
  reviewRequired: boolean;
}) =>
  input.projection === "duplicate_paid_same_payment" &&
  input.localStatus === "PAGO" && !input.reviewRequired;

export const processMercadoPagoWebhook = async (
  context: GatewayWebhookContext,
) => {
  const paymentId = normalizeRemotePaymentId(
    firstString(context.remotePaymentId),
  );
  if (!paymentId) {
    return { processed: true, ignored: true, reason: "missing_payment_id" };
  }

  const unsupportedReason = unsupportedMercadoPagoEventReason(
    context,
    paymentId,
  );
  if (unsupportedReason) {
    return { processed: true, ignored: true, reason: unsupportedReason };
  }

  const payment = await fetchMercadoPagoPayment(context, paymentId);
  const localStatus = statusForMercadoPago(payment.status);
  if (!localStatus) {
    return {
      processed: true,
      ignored: true,
      reason: "unsupported_payment_status",
      remoteStatus: firstString(payment.status),
    };
  }

  const receivable = await findMercadoPagoReceivable(context, payment);
  if (!receivable) {
    return { processed: true, ignored: true, reason: "receivable_not_found" };
  }

  const merchantId = await configuredMercadoPagoMerchantId(context);
  assertMercadoPagoPaymentMatches({
    environment: context.environment,
    receivable,
    payment,
    merchantId,
  });
  const paymentMethod = methodForMercadoPago(
    payment,
    receivable.gateway_payment_method,
  );
  const paymentReviewReason = mercadoPagoReviewReason(payment);
  const incomingPaymentId = normalizeRemotePaymentId(
    firstString(payment.id, context.remotePaymentId),
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

  const projection = await updateMercadoPagoReceivable(context, {
    receivable,
    payment,
    // Disputas e estornos sao somente registrados para revisao. Eles nunca
    // baixam, cancelam ou reabrem automaticamente o recebivel.
    localStatus: paymentReviewReason ? null : localStatus,
    paymentMethod,
  });

  const projectionReviewReason = projection.reviewRequired
    ? "duplicate_paid_payment"
    : null;
  const reviewReason = paymentReviewReason || projectionReviewReason;
  let reviewMessage: string | null = null;
  if (reviewReason) {
    reviewMessage = await persistMercadoPagoReview(context, {
      receivableId: String(receivable.id),
      remotePaymentId: incomingPaymentId,
      reason: reviewReason,
    });
  }

  const syncDomainProjection = async (
    projectedReceivable: Record<string, unknown>,
    projectedLocalStatus: string,
  ) => {
    await syncOnlineInscriptionPayment(context, {
      receivable: projectedReceivable,
      gatewayProvider: MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
      environment: context.environment,
      paymentId: incomingPaymentId,
      paymentLinkId: firstString(
        payment.preference_id,
        projectedReceivable.gateway_payment_link_id,
      ),
      localStatus: projectedLocalStatus,
      legacyPaymentMethod: legacyPaymentMethod(paymentMethod),
      pendingStatus: PENDENTE_INSCRICAO_STATUS,
    });
    if (projectedLocalStatus === "PAGO") {
      await activateEnrollmentAfterPayment(context, projectedReceivable);
    }
  };

  if (!projection.applied) {
    const reversalPolicyRequired = Boolean(paymentReviewReason);
    const reason = paymentReviewReason
      ? "paid_receivable_reversal_review"
      : projection.projection === "duplicate_paid_same_payment"
      ? "duplicate_paid_payment"
      : projection.projection === "duplicate_paid_other_payment"
      ? "paid_receivable_duplicate_payment_review"
      : "paid_receivable_preserved";
    const replaySettlementEffects = shouldReplayMercadoPagoSettlementEffects({
      projection: projection.projection,
      localStatus,
      reviewRequired: Boolean(reviewReason),
    });
    if (replaySettlementEffects) {
      // A baixa pode ter sido persistida antes de uma falha na inscricao ou na
      // ativacao. O retry do mesmo payment deve completar esses efeitos
      // idempotentes, em vez de apenas confirmar a duplicata.
      await syncDomainProjection(projection.receivable, "PAGO");
    }
    return {
      processed: true,
      ignored: true,
      reason,
      receivableId: receivable.id,
      localStatus,
      remoteStatus: firstString(payment.status),
      projection: projection.projection,
      reviewRequired: Boolean(reviewReason),
      reversalPolicyRequired,
      reviewReason,
      reviewMessage,
      downstreamReplayed: replaySettlementEffects,
      settledPaymentId: projection.receivable.gateway_payment_id || null,
      incomingPaymentId,
    };
  }

  if (paymentReviewReason) {
    return {
      processed: true,
      ignored: true,
      reason: paymentReviewReason === "payment_partially_refunded"
        ? "partial_refund_review"
        : paymentReviewReason === "payment_in_mediation"
        ? "payment_mediation_review"
        : "payment_reversal_review",
      receivableId: receivable.id,
      localStatus: null,
      remoteStatus: firstString(payment.status),
      reviewRequired: true,
      reversalPolicyRequired: true,
      reviewReason: paymentReviewReason,
      reviewMessage,
      incomingPaymentId,
    };
  }

  await syncDomainProjection(projection.receivable, localStatus);

  return {
    processed: true,
    ignored: false,
    receivableId: receivable.id,
    localStatus,
    remoteStatus: firstString(payment.status),
  };
};
