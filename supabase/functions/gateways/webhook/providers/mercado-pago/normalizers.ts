import { asRecord, firstNumber, firstString } from "./shared.ts";

export const paymentDate = (payment: Record<string, unknown>) =>
  firstString(
    payment.date_approved,
    payment.money_release_date,
    payment.date_last_updated,
    new Date().toISOString(),
  ).slice(0, 10);

export const transactionUrlFor = (payment: Record<string, unknown>) => {
  const transactionDetails = asRecord(payment.transaction_details);
  const pointOfInteraction = asRecord(payment.point_of_interaction);
  const transactionData = asRecord(pointOfInteraction.transaction_data);
  return firstString(
    transactionDetails.external_resource_url,
    transactionData.ticket_url,
  );
};

export const pixPayloadFor = (payment: Record<string, unknown>) => {
  const pointOfInteraction = asRecord(payment.point_of_interaction);
  const transactionData = asRecord(pointOfInteraction.transaction_data);
  return {
    payload: firstString(transactionData.qr_code),
    encodedImage: firstString(transactionData.qr_code_base64),
  };
};

export const installmentsFor = (
  payment: Record<string, unknown>,
  receivable: any,
) => firstNumber(payment.installments, receivable.gateway_installments, 1) || 1;

export const paymentFromOrder = (
  order: Record<string, unknown>,
): Record<string, unknown> => {
  const transactions = asRecord(order.transactions);
  const payments = Array.isArray(transactions.payments)
    ? transactions.payments
    : [];
  const payment = asRecord(payments[0]);
  const paymentMethod = asRecord(payment.payment_method);
  const qrCode = firstString(paymentMethod.qr_code, payment.qr_code);
  const qrCodeBase64 = firstString(
    paymentMethod.qr_code_base64,
    payment.qr_code_base64,
  );
  const ticketUrl = firstString(paymentMethod.ticket_url, payment.ticket_url);
  const status = firstString(payment.status, order.status);
  const statusDetail = firstString(payment.status_detail, order.status_detail);
  const amount = firstNumber(payment.amount, order.total_amount);

  return {
    ...payment,
    id: firstString(payment.id, order.id),
    external_reference: firstString(
      order.external_reference,
      payment.external_reference,
    ),
    status,
    status_detail: statusDetail,
    transaction_amount: amount,
    total_paid_amount: amount,
    payment_method_id: firstString(
      paymentMethod.id,
      payment.payment_method_id,
    ),
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
