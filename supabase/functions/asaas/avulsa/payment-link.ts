export const isAvulsaReceivable = (receivable: any) =>
  String(receivable?.categoria || "").toUpperCase() === "OUTROS_CREDITOS"
  && !receivable?.matricula_id;

export const canCreateDetachedPaymentLink = (receivable: any) =>
  isAvulsaReceivable(receivable) && !receivable?.cliente_id;
