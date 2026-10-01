export interface ReceivableOperationCapabilities {
  sourceSystem: 'PROESC' | 'BANESE' | 'LOCAL' | 'OTHER' | 'CONFLICT';
  provenanceKind: 'PROESC_HISTORY' | 'BANESE_LEGACY_IMPORTED' | 'NATIVE_ISSUED' | 'LOCAL' | 'OTHER' | 'CONFLICT';
  canSettle: boolean;
  canCancel: boolean;
  canEmit: boolean;
  canOpenExisting: boolean;
  canReconcile: boolean;
  readOnlyReason: string | null;
}

export interface BaneseCancellationPresentation {
  state: 'PENDING' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'CANCELED';
  reason: 'TRANCAMENTO_FUTURO';
  movementId: string;
  cutoffDate: string;
}

// These are server business capabilities, not a substitute for user/polo
// authorization. Missing metadata never grants a new financial operation.
export function parseReceivableOperationCapabilities(value: unknown): ReceivableOperationCapabilities | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (!['PROESC', 'BANESE', 'LOCAL', 'OTHER', 'CONFLICT'].includes(String(input.sourceSystem))
    || !['PROESC_HISTORY', 'BANESE_LEGACY_IMPORTED', 'NATIVE_ISSUED', 'LOCAL', 'OTHER', 'CONFLICT'].includes(String(input.provenanceKind))) return undefined;
  return {
    sourceSystem: input.sourceSystem as ReceivableOperationCapabilities['sourceSystem'],
    provenanceKind: input.provenanceKind as ReceivableOperationCapabilities['provenanceKind'],
    canSettle: input.canSettle === true,
    canCancel: input.canCancel === true,
    canEmit: input.canEmit === true,
    canOpenExisting: input.canOpenExisting === true,
    canReconcile: input.canReconcile === true,
    readOnlyReason: typeof input.readOnlyReason === 'string' ? input.readOnlyReason : null,
  };
}

export function parseBaneseCancellation(value: unknown): BaneseCancellationPresentation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (input.reason !== 'TRANCAMENTO_FUTURO'
    || !['PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'CANCELED'].includes(String(input.state))
    || typeof input.movementId !== 'string'
    || typeof input.cutoffDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.cutoffDate)) return undefined;
  return input as unknown as BaneseCancellationPresentation;
}

export function baneseCancellationLabel(item: { status: string; baneseCancellation?: BaneseCancellationPresentation }): string | null {
  // A confirmed payment always wins over stale cancellation metadata.
  if (item.status === 'PAGO') return null;
  const cancellation = item.baneseCancellation;
  if (!cancellation) return null;
  if (cancellation.state === 'CANCELED') return item.status === 'CANCELADO' ? 'CANCELADO' : 'Cancelamento em conferência';
  return cancellation.state === 'REVIEW_REQUIRED' ? 'Cancelamento em revisão' : 'Cancelamento aguardando Banese';
}
