import { gatewayOnlyPrimaryUrl } from "../../router.ts";
import type { EadCheckoutContext } from "../types.ts";
import { EAD_PAYMENT_RECIPIENT, firstHttpUrl } from "./gateway-view.ts";

export const createdEadCheckoutResult = (
  context: EadCheckoutContext,
  receivable: any,
  gatewayResult: any,
) => {
  const url = firstHttpUrl(gatewayOnlyPrimaryUrl(receivable)) ||
    firstHttpUrl(receivable?.gateway_payment_link_id);
  const pixQrCode = gatewayResult.pixPayload || gatewayResult.pixEncodedImage
    ? { payload: gatewayResult.pixPayload, encodedImage: gatewayResult.pixEncodedImage }
    : null;
  if (!url && !pixQrCode) {
    const error = new Error("Não foi possível recuperar os dados de pagamento da compra EAD.");
    Object.assign(error, { remotePaymentCreated: true });
    throw error;
  }
  return {
    response: {
      url,
      matriculaId: context.matricula.id,
      receivableId: receivable.id,
      attemptId: context.checkoutAttempt?.attemptId,
      payment: {
        id: gatewayResult.remotePaymentId || gatewayResult.remotePaymentLinkId,
        provider: context.route.providerCode,
        method: context.charge.method,
        installments: context.charge.installmentCount,
        status: gatewayResult.remoteStatus,
        value: context.charge.value,
        courseName: context.course.nome,
        recipient: EAD_PAYMENT_RECIPIENT,
        dueDate: context.charge.dueDate,
        invoiceUrl: receivable.gateway_invoice_url,
        bankSlipUrl: receivable.gateway_bank_slip_url,
        bankSlipDigitableLine: receivable.gateway_boleto_linha_digitavel,
        bankSlipBarcode: receivable.gateway_boleto_codigo_barras,
        bankSlipOurNumber: receivable.gateway_boleto_nosso_numero,
        pixQrCode,
      },
    },
    createdRemotePayment: true,
    receivableId: receivable.id,
  };
};
