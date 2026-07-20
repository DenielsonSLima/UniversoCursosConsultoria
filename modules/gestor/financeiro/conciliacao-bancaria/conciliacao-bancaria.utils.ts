export interface BaneseSyncSummary {
  lastConsultaAt: string | null;
  lastSincronizacaoAt: string | null;
  lastApiSyncAt: string | null;
  syncsToday: number;
  syncsThisWeek: number;
  syncsThisMonth: number;
  hasApiSyncError: boolean;
}

export const EMPTY_API_SYNC_SUMMARY: BaneseSyncSummary = {
  lastConsultaAt: null,
  lastSincronizacaoAt: null,
  lastApiSyncAt: null,
  syncsToday: 0,
  syncsThisWeek: 0,
  syncsThisMonth: 0,
  hasApiSyncError: false,
};

export interface BaneseTransactionAuditRow {
  createdAt?: string | null;
  updatedAt?: string | null;
  rawPayload: unknown;
  lastError?: string | null;
}

const parseDateSafe = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const atOrAfter = (candidate: Date | null, limit: Date) =>
  !!candidate && candidate.getTime() >= limit.getTime();

const startOfLocalDay = (reference: Date) => {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfLocalWeek = (reference: Date) => {
  const date = new Date(reference);
  const day = date.getDay();
  const shiftToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - shiftToMonday);
  return startOfLocalDay(date);
};

const startOfLocalMonth = (reference: Date) => {
  const date = new Date(reference);
  date.setDate(1);
  return startOfLocalDay(date);
};

const hasReconciliationPayload = (rawPayload: unknown) => {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(rawPayload as Record<string, unknown>, 'reconciliation');
};

const hasCnabPayload = (rawPayload: unknown) => {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(rawPayload as Record<string, unknown>, 'cnab240');
};

const buildBaneseSyncSummary = (
  rows: BaneseTransactionAuditRow[] = [],
  matchPayload: (row: BaneseTransactionAuditRow) => boolean,
): BaneseSyncSummary => {
  const now = new Date();
  const today = startOfLocalDay(now);
  const weekStart = startOfLocalWeek(now);
  const monthStart = startOfLocalMonth(now);

  let lastConsultaAt: string | null = null;
  let lastSincronizacaoAt: string | null = null;
  let lastApiSyncAt: string | null = null;
  let syncsToday = 0;
  let syncsThisWeek = 0;
  let syncsThisMonth = 0;
  let hasApiSyncError = false;

  for (const row of rows) {
    if (!matchPayload(row)) continue;

    const parsedDate = parseDateSafe(row.createdAt || null);
    if (!parsedDate) continue;

    if (!lastConsultaAt) {
      lastConsultaAt = row.createdAt || null;
      lastSincronizacaoAt = row.updatedAt || row.createdAt || null;
    }
    if (!lastApiSyncAt) {
      lastApiSyncAt = row.createdAt || null;
    }
    if (row.lastError && String(row.lastError).trim() !== '-') {
      hasApiSyncError = true;
    }

    if (atOrAfter(parsedDate, monthStart)) {
      syncsThisMonth += 1;
      if (atOrAfter(parsedDate, weekStart)) {
        syncsThisWeek += 1;
        if (atOrAfter(parsedDate, today)) {
          syncsToday += 1;
        }
      }
      continue;
    }
  }

  return {
    lastConsultaAt,
    lastSincronizacaoAt,
    lastApiSyncAt,
    syncsToday,
    syncsThisWeek,
    syncsThisMonth,
    hasApiSyncError,
  };
};

export const buildApiSyncSummary = (rows: BaneseTransactionAuditRow[] = []): BaneseSyncSummary =>
  buildBaneseSyncSummary(rows, (row) => hasReconciliationPayload(row.rawPayload));

export const buildCnab240SyncSummary = (rows: BaneseTransactionAuditRow[] = []): BaneseSyncSummary =>
  buildBaneseSyncSummary(rows, (row) => hasCnabPayload(row.rawPayload));

export const formatApiSyncDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = parseDateSafe(value);
  if (!date) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
  });
};
