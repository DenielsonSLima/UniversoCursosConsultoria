export const isOutrosCreditosReceivable = (receivable: any) =>
  String(receivable?.categoria || "").toUpperCase() === "OUTROS_CREDITOS"
  && !receivable?.matricula_id;

export const canCreateDetachedPaymentLink = (receivable: any) =>
  isOutrosCreditosReceivable(receivable) && !receivable?.cliente_id;
