import type { CheckoutMutableState } from "./checkout-context.ts";
import { PENDENTE_INSCRICAO_STATUS } from "./checkout-utils.ts";

export const cleanupFailedCheckout = async (
  admin: any,
  state: CheckoutMutableState,
  remotePaymentMayExist: boolean,
) => {
  if (
    !state.paymentCreated && !remotePaymentMayExist &&
    state.checkoutReceivableId
  ) {
    try {
      const { error } = await admin
        .from("contas_receber")
        .delete()
        .eq("id", state.checkoutReceivableId)
        .is("asaas_payment_id", null)
        .is("asaas_invoice_url", null)
        .is("asaas_payment_link_id", null)
        .is("gateway_boleto_nosso_numero", null)
        .neq("status", "PAGO");
      if (error) {
        console.warn("Não foi possível limpar cobrança local falha:", error);
      }
    } catch (cleanupError) {
      console.warn(
        "Não foi possível limpar cobrança local falha:",
        cleanupError,
      );
    }
  }

  if (
    !state.paymentCreated && !remotePaymentMayExist && state.checkoutMatriculaId
  ) {
    try {
      const { error } = await admin
        .from("matriculas")
        .update({ status: "CANCELADO" })
        .eq("id", state.checkoutMatriculaId)
        .in("status", [
          "PENDENTE",
          "AGUARDANDO_PAGAMENTO",
          "AGUARDANDO_CONFIRMACAO",
        ]);
      if (error) {
        console.warn("Não foi possível cancelar matrícula local falha:", error);
      }
    } catch (cleanupError) {
      console.warn(
        "Não foi possível cancelar matrícula local falha:",
        cleanupError,
      );
    }

    try {
      const { error } = await admin
        .from("inscricoes_online")
        .update({
          status: "CANCELADO",
          erro:
            "Checkout cancelado automaticamente por falha antes da criação da cobrança bancária.",
          updated_at: new Date().toISOString(),
        })
        .eq("matricula_id", state.checkoutMatriculaId)
        .eq("status", PENDENTE_INSCRICAO_STATUS)
        .is("asaas_payment_id", null);
      if (error) {
        console.warn("Não foi possível cancelar inscrição online local falha:", error);
      }
    } catch (cleanupError) {
      console.warn(
        "Não foi possível cancelar inscrição online local falha:",
        cleanupError,
      );
    }
  }
};
