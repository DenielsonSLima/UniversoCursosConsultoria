import type {
  BaneseCnabExchangeFileStatus,
  BaneseCnabReturnRecord,
  BaneseCnabReturnSummary,
} from './conciliacao-bancaria.types';
import type { GatewayEnvironment } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';

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
  lastError?: string | null;
}

export const BANESE_CNAB_RETURN_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const BANESE_CNAB_RETURN_ACCEPT = '.ret,.txt,.cnab';
export const BANESE_RECONCILIATION_TIME_ZONE = 'America/Maceio';

export interface CnabAvailabilityNotice {
  reason: 'EDI7_MISSING' | 'UNAVAILABLE';
  title: string;
  message: string;
  detail: string;
}

export const describeCnabAvailabilityError = (
  error?: string | null,
): CnabAvailabilityNotice | null => {
  const detail = String(error || '').trim();
  if (!detail) return null;
  if (/EDI\s*7|EDI7/i.test(detail)) {
    return {
      reason: 'EDI7_MISSING',
      title: 'CNAB240 aguardando código EDI7',
      message: 'Remessa e retorno permanecem bloqueados até o banco fornecer e a configuração salvar o código EDI7 de seis dígitos. A API Banese continua sendo o canal principal.',
      detail,
    };
  }
  return {
    reason: 'UNAVAILABLE',
    title: 'Disponibilidade do CNAB240 não confirmada',
    message: 'A API Banese continua sendo o canal principal. Não use a contingência até a consulta CNAB voltar a confirmar ambiente e configuração.',
    detail,
  };
};

const maceioDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BANESE_RECONCILIATION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export type BaneseCnabReturnFileValidation =
  | { valid: true; extension: '.ret' | '.txt' | '.cnab' }
  | { valid: false; message: string };

export const validateBaneseCnabReturnFile = (
  file: Pick<File, 'name' | 'size'>,
): BaneseCnabReturnFileValidation => {
  const normalizedName = file.name.trim().toLowerCase();
  const extensionIndex = normalizedName.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? normalizedName.slice(extensionIndex) : '';

  if (extension === '.rem') {
    return {
      valid: false,
      message: 'Arquivo .rem é uma remessa bancária e não pode ser usado como retorno. Selecione .ret, .txt ou .cnab.',
    };
  }

  if (!['.ret', '.txt', '.cnab'].includes(extension)) {
    return {
      valid: false,
      message: 'Formato inválido. O retorno Banese deve usar a extensão .ret, .txt ou .cnab.',
    };
  }

  if (file.size <= 0) {
    return { valid: false, message: 'O arquivo selecionado está vazio.' };
  }

  if (file.size > BANESE_CNAB_RETURN_MAX_FILE_SIZE) {
    return { valid: false, message: 'Arquivo maior que 5 MB. Selecione o retorno CNAB240 original do Banese.' };
  }

  return {
    valid: true,
    extension: extension as '.ret' | '.txt' | '.cnab',
  };
};

export const summarizeBaneseCnabReturn = (
  records: BaneseCnabReturnRecord[] = [],
): BaneseCnabReturnSummary => ({
  events: records.length,
  matched: records.filter((record) => record.status === 'MATCHED').length,
  reviewRequired: records.filter((record) => record.status === 'REVIEW_REQUIRED').length,
  applied: records.filter((record) => (
    record.status === 'ACTIVATION_PENDING'
    || record.status === 'ACTIVATED'
  )).length,
  errors: records.filter((record) => record.status === 'ERROR').length,
  skipped: records.filter((record) => record.status === 'SKIPPED').length,
});

export const canConfirmBaneseCnabReturn = (records: BaneseCnabReturnRecord[] = []) => {
  const hasMatched = records.some((record) => record.status === 'MATCHED');
  const hasBlockingStatus = records.some((record) => (
    record.status === 'REVIEW_REQUIRED'
    || record.status === 'ERROR'
    || record.status === 'ACTIVATION_PENDING'
  ));
  return hasMatched && !hasBlockingStatus;
};

export const countRetryableBaneseCnabReturnRecords = (
  records: BaneseCnabReturnRecord[] = [],
) => records.filter((record) => (
  record.status === 'MATCHED'
  || record.status === 'ERROR'
  || record.status === 'ACTIVATION_PENDING'
)).length;

export const canRevalidateBaneseCnabReturn = (
  status: BaneseCnabExchangeFileStatus | null | undefined,
  records: BaneseCnabReturnRecord[] = [],
) => (
  (status === 'PREVIEWED' || status === 'PARTIAL')
  && records.some((record) => record.status === 'REVIEW_REQUIRED')
);

export const canResumeBaneseCnabReturn = (
  status: BaneseCnabExchangeFileStatus | null | undefined,
) => status === 'PROCESSING';

export const requiresBaneseCnabProductionAcknowledgement = (
  environment: GatewayEnvironment | null | undefined,
) => environment === 'production';

const parseDateSafe = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getMaceioDateKey = (reference: Date = new Date()) => {
  if (Number.isNaN(reference.getTime())) throw new Error('Data de referência inválida.');
  const parts = maceioDateFormatter.formatToParts(reference);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Não foi possível calcular a data de Maceió.');
  return `${year}-${month}-${day}`;
};

const startOfWeekDateKey = (dateKey: string) => {
  const calendarDate = new Date(`${dateKey}T12:00:00.000Z`);
  const shiftToMonday = (calendarDate.getUTCDay() + 6) % 7;
  calendarDate.setUTCDate(calendarDate.getUTCDate() - shiftToMonday);
  return calendarDate.toISOString().slice(0, 10);
};

const buildBaneseSyncSummary = (
  rows: BaneseTransactionAuditRow[] = [],
  reference: Date = new Date(),
): BaneseSyncSummary => {
  const todayKey = getMaceioDateKey(reference);
  const weekStartKey = startOfWeekDateKey(todayKey);
  const monthKey = todayKey.slice(0, 7);

  let lastConsultaAt: string | null = null;
  let lastSincronizacaoAt: string | null = null;
  let lastApiSyncAt: string | null = null;
  let syncsToday = 0;
  let syncsThisWeek = 0;
  let syncsThisMonth = 0;
  let hasApiSyncError = false;

  for (const row of rows) {
    const parsedDate = parseDateSafe(row.createdAt || null);
    if (!parsedDate) continue;
    const candidateDateKey = getMaceioDateKey(parsedDate);

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

    if (candidateDateKey.slice(0, 7) === monthKey) {
      syncsThisMonth += 1;
    }
    if (startOfWeekDateKey(candidateDateKey) === weekStartKey) {
      syncsThisWeek += 1;
    }
    if (candidateDateKey === todayKey) {
      syncsToday += 1;
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

export const buildApiSyncSummary = (
  rows: BaneseTransactionAuditRow[] = [],
  reference: Date = new Date(),
): BaneseSyncSummary => buildBaneseSyncSummary(rows, reference);

export const buildCnab240SyncSummary = (
  rows: BaneseTransactionAuditRow[] = [],
  reference: Date = new Date(),
): BaneseSyncSummary => buildBaneseSyncSummary(rows, reference);

export const formatApiSyncDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = parseDateSafe(value);
  if (!date) return '-';
  return date.toLocaleString('pt-BR', {
    timeZone: BANESE_RECONCILIATION_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
  });
};
