import { gatewayPrimaryUrl, type GatewayProviderCode } from "../../router.ts";
import { isRemoteTitleNonPayable } from "../remote-title-guard.ts";
import type { EadCheckoutContext } from "../types.ts";

export const EAD_PAYMENT_RECIPIENT = {
  name: "Universo Cursos e Consultoria",
  document: "13.278.137/0001-54",
};

export const firstHttpUrl = (value: unknown) => {
  const candidate = String(value || "").trim();
  return /^https?:\/\//i.test(candidate) ? candidate : null;
};

export const clearPreviousGatewayFields = (message: string) => ({
  asaas_payment_id: null,
  asaas_payment_link_id: null,
  nosso_numero_asaas: null,
  asaas_invoice_url: null,
  asaas_bank_slip_url: null,
  asaas_installment_id: null,
  asaas_transaction_receipt_url: null,
  asaas_status: null,
  asaas_synced_at: null,
  asaas_last_error: message,
  gateway_payment_id: null,
  gateway_customer_id: null,
  gateway_payment_link_id: null,
  gateway_installment_id: null,
  gateway_installments: null,
  gateway_invoice_url: null,
  gateway_bank_slip_url: null,
  gateway_pix_payload: null,
  gateway_pix_encoded_image: null,
  gateway_boleto_linha_digitavel: null,
  gateway_boleto_codigo_barras: null,
  gateway_boleto_nosso_numero: null,
  gateway_boleto_issued_at: null,
  gateway_financial_terms: null,
  gateway_financial_terms_confirmed_at: null,
  gateway_transaction_receipt_url: null,
  gateway_status: null,
  gateway_last_error: null,
  gateway_synced_at: null,
});

export const shouldReuseReceivable = (
  receivable: any,
  context: EadCheckoutContext,
  providerCode: GatewayProviderCode,
) => {
  if (
    !receivable ||
    receivable.gateway_provider !== providerCode ||
    receivable.gateway_payment_method !== context.charge.method ||
    receivable.gateway_environment !== context.environment ||
    Number(receivable.gateway_installments || 1) !==
      context.charge.installmentCount ||
    Math.round(Number(receivable.valor || 0) * 100) !==
      Math.round(Number(context.charge.value || 0) * 100) ||
    String(receivable.data_vencimento || "").slice(0, 10) !==
      String(context.charge.dueDate || "").slice(0, 10) ||
    isRemoteTitleNonPayable(receivable) ||
    !gatewayPrimaryUrl(receivable)
  ) {
    return false;
  }

  if (providerCode === "mercado_pago" && context.charge.method === "PIX") {
    return Boolean(
      receivable.gateway_pix_payload || receivable.gateway_pix_encoded_image,
    );
  }

  return true;
};

export const paymentResponseFromReceivable = (
  receivable: any,
  context: EadCheckoutContext,
  providerCode: GatewayProviderCode,
) => {
  const invoiceUrl = receivable?.gateway_invoice_url ||
    (providerCode === "asaas" ? receivable?.asaas_invoice_url : null);
  const bankSlipUrl = receivable?.gateway_bank_slip_url ||
    (providerCode === "asaas" ? receivable?.asaas_bank_slip_url : null);
  const paymentId = receivable?.gateway_payment_id ||
    receivable?.gateway_payment_link_id ||
    (providerCode === "asaas"
      ? receivable?.asaas_payment_id || receivable?.asaas_payment_link_id
      : null);

  return {
    id: paymentId || null,
    provider: providerCode,
    method: context.charge.method,
    installments: context.charge.installmentCount,
    status: receivable?.gateway_status || receivable?.asaas_status || null,
    value: context.charge.value,
    courseName: context.course.nome,
    recipient: EAD_PAYMENT_RECIPIENT,
    dueDate: context.charge.dueDate,
    invoiceUrl,
    bankSlipUrl,
    bankSlipDigitableLine: receivable?.gateway_boleto_linha_digitavel || null,
    bankSlipBarcode: receivable?.gateway_boleto_codigo_barras || null,
    bankSlipOurNumber: receivable?.gateway_boleto_nosso_numero || null,
    pixQrCode: receivable?.gateway_pix_payload ||
        receivable?.gateway_pix_encoded_image
      ? {
        payload: receivable?.gateway_pix_payload || null,
        encodedImage: receivable?.gateway_pix_encoded_image || null,
      }
      : null,
  };
};
