export type GatewayPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export const normalizeGatewayPaymentMethod = (
  value: unknown,
): GatewayPaymentMethod | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PIX') return 'PIX';
  if (normalized === 'BOLETO') return 'BOLETO';
  if (normalized === 'CREDIT_CARD') return 'CREDIT_CARD';
  return null;
};

export const requireGatewayPaymentMethod = (
  value: unknown,
): GatewayPaymentMethod => {
  const paymentMethod = normalizeGatewayPaymentMethod(value);
  if (!paymentMethod) {
    throw new Error('Escolha Pix, boleto ou cartão de crédito para a cobrança inicial.');
  }
  return paymentMethod;
};

export const buildEnrollmentSyncPayload = (
  matriculaId: string,
  paymentMethod: GatewayPaymentMethod | null,
) => ({
  matriculaId,
  paymentMethod,
});
