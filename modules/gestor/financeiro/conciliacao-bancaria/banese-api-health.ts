import type {
  GatewayEnvironment,
  GatewayOverview,
} from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';

export type BaneseReconciliationEvidence = 'NO_RECORD' | 'RECORDED_WITHOUT_ERROR' | 'RECORDED_WITH_ERROR';

export interface BaneseApiHealthEvidence {
  environment: GatewayEnvironment;
  credentialConfigured: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastReconciliationAt: string | null;
  lastReconciliationUpdatedAt: string | null;
  lastReconciliationError: string | null;
  reconciliationEvidence: BaneseReconciliationEvidence;
}

export interface BaneseReconciliationAuditRow {
  attemptedAt?: string | null;
  persistedAt?: string | null;
  lastError?: string | null;
}

const meaningfulText = (value: unknown) => {
  if (value === null || value === undefined) return null;
  let normalized = '';
  if (typeof value === 'object') {
    const valObj = value as Record<string, unknown>;
    if (typeof valObj.message === 'string' && valObj.message.trim()) {
      normalized = valObj.message.trim();
    } else if (typeof valObj.error === 'string' && valObj.error.trim()) {
      normalized = valObj.error.trim();
    } else {
      try {
        normalized = JSON.stringify(value).trim();
      } catch {
        normalized = String(value).trim();
      }
    }
  } else {
    normalized = String(value).trim();
  }
  return normalized && normalized !== '-' && normalized !== '[object Object]' ? normalized : null;
};

export const buildBaneseApiHealthEvidence = (
  overview: GatewayOverview,
  latestReconciliation?: BaneseReconciliationAuditRow | null,
): BaneseApiHealthEvidence => {
  const environment = overview.activeEnvironment;
  const credential = overview.credentials.find((item) => (
    item.providerCode === 'banese_card' && item.environment === environment
  ));
  const lastReconciliationAt = meaningfulText(latestReconciliation?.attemptedAt);
  const lastReconciliationError = meaningfulText(latestReconciliation?.lastError);

  return {
    environment,
    credentialConfigured: credential?.configured === true,
    lastTestAt: meaningfulText(credential?.lastTestAt),
    lastTestStatus: meaningfulText(credential?.lastTestStatus),
    lastTestMessage: meaningfulText(credential?.lastTestMessage),
    lastReconciliationAt,
    lastReconciliationUpdatedAt: meaningfulText(latestReconciliation?.persistedAt),
    lastReconciliationError,
    reconciliationEvidence: !lastReconciliationAt
      ? 'NO_RECORD'
      : lastReconciliationError
        ? 'RECORDED_WITH_ERROR'
        : 'RECORDED_WITHOUT_ERROR',
  };
};
