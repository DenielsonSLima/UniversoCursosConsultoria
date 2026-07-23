import type { CheckoutMutableState } from "./checkout-context.ts";

export const cleanupFailedCheckout = (
  _admin: any,
  state: CheckoutMutableState,
  remotePaymentMayExist: boolean,
) => {
  // A RPC de matricula pode reutilizar registros preexistentes e outra chamada
  // pode possuir o lock do recebivel. Sem um token comprovadamente pertencente
  // a esta requisicao, qualquer DELETE/CANCEL aqui destruiria estado concorrente.
  // O fluxo preserva os registros para retry/recovery idempotente e deixa a
  // liberacao de matricula para uma operacao explicita e auditavel.
  console.warn("Checkout falhou; estado local preservado para conciliacao.", {
    checkoutMatriculaId: state.checkoutMatriculaId,
    checkoutReceivableId: state.checkoutReceivableId,
    paymentCreated: state.paymentCreated,
    remotePaymentMayExist,
  });
};
