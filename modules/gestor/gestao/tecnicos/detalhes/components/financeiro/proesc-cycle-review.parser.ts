export interface ProescCycleReview {
  classification: 'C1' | 'FULL' | 'UNKNOWN';
  eligible: boolean;
  observedAt: string;
  validUntil: string | null;
  reason: string;
  source: 'API_SCHEDULE_REVIEW';
}

const validTimestamp = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);

export const requireProescCycleReview = (value: unknown): ProescCycleReview => {
  const result = value && typeof value === 'object'
    ? value as Record<string, unknown> : {};
  if (
    !['C1', 'FULL', 'UNKNOWN'].includes(String(result.classification))
    || typeof result.eligible !== 'boolean'
    || !validTimestamp(result.observedAt)
    || !(result.validUntil === null || validTimestamp(result.validUntil))
    || typeof result.reason !== 'string' || !result.reason.trim()
    || result.source !== 'API_SCHEDULE_REVIEW'
    || (result.eligible && (
      result.classification !== 'C1'
      || result.validUntil === null
      || Date.parse(result.validUntil as string) <= Date.parse(result.observedAt as string)
      || Date.parse(result.validUntil as string) - Date.parse(result.observedAt as string) > 300_000
    ))
  ) {
    throw new Error('O Proesc não retornou uma conferência válida dos ciclos. Nenhuma cobrança foi gerada.');
  }
  return result as unknown as ProescCycleReview;
};

export const requireEligibleProescCycleReview = (
  result: ProescCycleReview,
  now = Date.now(),
) => {
  if (!result.eligible || result.classification !== 'C1') {
    throw new Error(result.reason);
  }
  if (!result.validUntil || Date.parse(result.validUntil) <= now) {
    throw new Error('A conferência do Proesc expirou. Confira novamente os ciclos antes de continuar.');
  }
  return result;
};
