export interface TrancamentoBaneseCancellationCounts {
  pending: number;
  processing: number;
  reviewRequired: number;
  canceled: number;
}

export interface TrancamentoFinancialPreview {
  policy: 'TRANCAMENTO_FUTURO_V1';
  cutoffDate: string;
  academicStatus: string;
  paidPreserved: number;
  throughCutoffPreserved: number;
  futureLocalSuspended: number;
  futureProescPreserved: number;
  futureBaneseToCancel: number;
  futureBaneseReview: number;
  baneseCancellation: TrancamentoBaneseCancellationCounts;
  livePaymentsVerified: false;
  canceledExcludedFromOpenTotals: true;
}

const asRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Prévia de trancamento inválida: ${field}.`);
  }
  return value as Record<string, unknown>;
};

const asCount = (value: unknown, field: string) => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Prévia de trancamento inválida: ${field}.`);
  }
  return parsed;
};

export const parseTrancamentoFinancialPreview = (
  value: unknown,
): TrancamentoFinancialPreview => {
  const row = asRecord(value, 'resposta');
  const cancellation = asRecord(row.baneseCancellation, 'baneseCancellation');
  if (row.policy !== 'TRANCAMENTO_FUTURO_V1'
      || typeof row.cutoffDate !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.cutoffDate)
      || new Date(`${row.cutoffDate}T00:00:00.000Z`)
        .toISOString().slice(0, 10) !== row.cutoffDate
      || typeof row.academicStatus !== 'string'
      || !row.academicStatus.trim()
      || row.livePaymentsVerified !== false
      || row.canceledExcludedFromOpenTotals !== true) {
    throw new Error('O servidor não confirmou o contrato financeiro do trancamento.');
  }
  return {
    policy: row.policy,
    cutoffDate: row.cutoffDate,
    academicStatus: row.academicStatus,
    paidPreserved: asCount(row.paidPreserved, 'paidPreserved'),
    throughCutoffPreserved: asCount(row.throughCutoffPreserved, 'throughCutoffPreserved'),
    futureLocalSuspended: asCount(row.futureLocalSuspended, 'futureLocalSuspended'),
    futureProescPreserved: asCount(row.futureProescPreserved, 'futureProescPreserved'),
    futureBaneseToCancel: asCount(row.futureBaneseToCancel, 'futureBaneseToCancel'),
    futureBaneseReview: asCount(row.futureBaneseReview, 'futureBaneseReview'),
    baneseCancellation: {
      pending: asCount(cancellation.pending, 'baneseCancellation.pending'),
      processing: asCount(cancellation.processing, 'baneseCancellation.processing'),
      reviewRequired: asCount(cancellation.reviewRequired, 'baneseCancellation.reviewRequired'),
      canceled: asCount(cancellation.canceled, 'baneseCancellation.canceled'),
    },
    livePaymentsVerified: false,
    canceledExcludedFromOpenTotals: true,
  };
};
