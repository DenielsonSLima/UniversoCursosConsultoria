export interface ProescReceivableEvidence {
  sourceStatus: 'UNKNOWN' | 'OPEN' | 'PAID' | 'CANCELED';
  verification: 'REVIEW' | 'VERIFIED';
  observedAt: string | null;
  obligationLabel?: string;
}

// This field is projected by the authorized receivables RPC from a real Proesc
// link. Legacy payment origin alone never identifies the source as Proesc.
export const parseProescReceivableEvidence = (value: unknown): ProescReceivableEvidence | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const sourceStatus = ['UNKNOWN', 'OPEN', 'PAID', 'CANCELED'].includes(String(input.sourceStatus))
    ? input.sourceStatus as ProescReceivableEvidence['sourceStatus'] : 'UNKNOWN';
  const verification = input.verification === 'VERIFIED' && sourceStatus !== 'UNKNOWN'
    ? 'VERIFIED' : 'REVIEW';
  const observedAt = typeof input.observedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T/.test(input.observedAt)
    && input.observedAt.length <= 40 && Number.isFinite(Date.parse(input.observedAt))
    ? input.observedAt : null;
  const obligationLabel = typeof input.obligationLabel === 'string'
    && input.obligationLabel.trim().length > 0 && input.obligationLabel.length <= 80
    ? input.obligationLabel : undefined;
  return { sourceStatus, verification, observedAt, ...(obligationLabel ? { obligationLabel } : {}) };
};

type ReceivableEvidence = {
  status: string;
  gatewayProvider?: string;
  asaasPaymentId?: string;
  boletoNossoNumero?: string;
  proescEvidence?: ProescReceivableEvidence;
};

export const hasProescEvidence = (item: ReceivableEvidence) => Boolean(
  item.proescEvidence && !item.gatewayProvider?.trim() && !item.asaasPaymentId && !item.boletoNossoNumero,
);

// Payment review is separate from UNKNOWN cycle coverage. An applied payment
// remains PAGO even when a later observation still needs review.
export const isProescPaymentUnderReview = (item: ReceivableEvidence) =>
  hasProescEvidence(item) && ['PENDENTE', 'VENCIDO'].includes(item.status)
  && (item.proescEvidence?.verification === 'REVIEW'
    || item.proescEvidence?.sourceStatus !== 'OPEN');
