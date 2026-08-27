import type {
  BanesePollingAttempt,
  BanesePollingDashboard,
} from './consulta-api-banese.types';

export type BaneseAttemptsContext = 'queries' | 'settlements' | 'errors';

export const selectBaneseAttemptFeed = (
  dashboard: BanesePollingDashboard | undefined,
  context: BaneseAttemptsContext,
): BanesePollingAttempt[] => {
  if (!dashboard) return [];
  if (context === 'settlements') return dashboard.lastSettlements || [];
  if (context === 'errors') return dashboard.lastErrorAttempts || [];
  return dashboard.lastAttempts || [];
};
