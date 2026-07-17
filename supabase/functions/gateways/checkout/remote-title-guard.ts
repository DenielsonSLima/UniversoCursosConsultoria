const NON_PAYABLE_REMOTE_STATUSES = new Set([
  "CANCELED",
  "CANCELLED",
  "CANCELED_BY_BANK",
  "DELETED",
  "EXPIRED",
  "REJECTED",
  "REJECTED_TIMEOUT",
]);

export const remoteTitleStatus = (receivable: any) =>
  String(receivable?.gateway_status || receivable?.asaas_status || "")
    .trim()
    .toUpperCase();

export const isRemoteTitleNonPayable = (receivable: any) =>
  NON_PAYABLE_REMOTE_STATUSES.has(remoteTitleStatus(receivable));

export const hasRemoteTitleReference = (receivable: any) => Boolean(
  receivable?.gateway_payment_id ||
    receivable?.gateway_payment_link_id ||
    receivable?.gateway_boleto_nosso_numero ||
    receivable?.asaas_payment_id ||
    receivable?.asaas_payment_link_id,
);

export const hasActiveRemoteTitleReference = (receivable: any) =>
  hasRemoteTitleReference(receivable) && !isRemoteTitleNonPayable(receivable);

export const boletoIssuedAtAfterReset = (
  receivable: any,
  preserveSameBaneseTitle: boolean,
) => preserveSameBaneseTitle ? receivable?.gateway_boleto_issued_at || null : null;

export const assertGatewayTitleCanBeReset = (
  receivable: any,
  options: { allowBaneseRecovery?: boolean } = {},
) => {
  if (!hasActiveRemoteTitleReference(receivable)) return;
  if (options.allowBaneseRecovery === true) return;

  throw new Error(
    "Ja existe um titulo bancario ativo para esta cobranca. Cancele e confirme a baixa no provedor antes de trocar a forma de pagamento ou emitir outro titulo.",
  );
};
