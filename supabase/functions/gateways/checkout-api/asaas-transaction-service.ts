import type { CheckoutContext } from "./checkout-context.ts";

export const persistAsaasGatewayTransaction = async (
  context: CheckoutContext,
  payment: any,
  currentReceivable: any,
) => {
  if (!payment?.id || !currentReceivable?.id) return;

  const {
    admin,
    environment,
    gatewayPaymentMethodForCharge,
    charge,
    isEadCheckout,
    receivableFeeFields,
  } = context;
  const payload = {
    receivable_id: currentReceivable.id,
    provider_code: "asaas",
    environment,
    payment_method: gatewayPaymentMethodForCharge,
    remote_payment_id: payment.id,
    remote_customer_id: payment.customer ||
      currentReceivable.gateway_customer_id || null,
    remote_payment_link_id: null,
    remote_installment_id: payment.installment || payment.installmentId || null,
    remote_status: payment.status || null,
    amount: Number(
      payment.value || currentReceivable.valor || charge.value || 0,
    ),
    fee_value: isEadCheckout
      ? (receivableFeeFields as any).asaas_fee_value
      : null,
    net_value: isEadCheckout
      ? (receivableFeeFields as any).asaas_net_value
      : null,
    invoice_url: payment.invoiceUrl || null,
    bank_slip_url: payment.bankSlipUrl || null,
    transaction_receipt_url: payment.transactionReceiptUrl || null,
    raw_payload: payment,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data: existing, error: existingError } = await admin
    .from("payment_gateway_transactions")
    .select("id")
    .eq("provider_code", "asaas")
    .eq("environment", environment)
    .eq("remote_payment_id", payment.id)
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
