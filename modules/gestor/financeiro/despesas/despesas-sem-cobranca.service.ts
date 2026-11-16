import { supabase } from '../../../../lib/supabase';

export interface ExpenseWithoutChargeAttempt {
  requestId: string;
  sourceId: string;
  version: number;
  reason: string;
}

export class ExpenseWithoutChargeError extends Error {
  constructor(message: string, readonly safeToEdit = false) { super(message); }
}

const attemptKey = (userId: string, sourceId: string) => `universo:expense-without-charge:v1:${userId}:${sourceId}`;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export function isExpenseWithoutChargeAttempt(value: unknown, sourceId: string): value is ExpenseWithoutChargeAttempt {
  const input = value as ExpenseWithoutChargeAttempt | null;
  return Boolean(input && input.sourceId === sourceId && uuid.test(input.requestId)
    && Number.isSafeInteger(input.version) && input.version >= 0
    && typeof input.reason === 'string' && input.reason.length <= 1000);
}

export const storeExpenseWithoutChargeAttempt = (key: string, value: ExpenseWithoutChargeAttempt | null) => {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
    return true;
  } catch { return false; }
};

export async function readExpenseWithoutChargeSession(sourceId: string) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new ExpenseWithoutChargeError('Sua sessão precisa ser renovada para encerrar este mês.');
  const key = attemptKey(userId, sourceId);
  let attempt: ExpenseWithoutChargeAttempt | null = null;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null');
    if (isExpenseWithoutChargeAttempt(stored, sourceId)) attempt = stored;
  } catch { /* A guarda do backend continua impedindo reencerramento da mesma competência. */ }
  return { key, attempt };
}

export async function resolveExpenseWithoutCharge(attempt: ExpenseWithoutChargeAttempt) {
  if (!isExpenseWithoutChargeAttempt(attempt, attempt.sourceId)) throw new ExpenseWithoutChargeError('Confira os dados do encerramento deste mês.');
  const { data, error } = await supabase.rpc('resolve_estimated_expense_without_charge_secure', {
    p_despesa_id: attempt.sourceId, p_versao: attempt.version, p_request_id: attempt.requestId,
    p_motivo: attempt.reason.trim() || null,
  });
  if (error) {
    const message = error.message || '';
    const safeToEdit = /PAYMENT_ESTIMATE_(VERSION_CHANGED|NOT_PENDING|HISTORY_LOCKED)/.test(message);
    const known: Array<[RegExp, string]> = [
      [/PAYMENT_ESTIMATE_VERSION_CHANGED/, 'A previsão mudou. Feche e abra o lançamento para conferir o estado atual.'],
      [/PAYMENT_ESTIMATE_NOT_PENDING/, 'Este mês já foi confirmado ou encerrado. Feche e abra o lançamento para conferir o histórico.'],
      [/PAYMENT_ESTIMATE_HISTORY_LOCKED/, 'Este lançamento já possui pagamento. Consulte o histórico antes de continuar.'],
      [/PAYMENT_UNAUTHORIZED/, 'Seu acesso ao encerramento deste lançamento não está autorizado.'],
      [/PAYMENT_REQUEST_REUSED/, 'Esta tentativa já existe com outros dados. Retome a solicitação original.'],
    ];
    throw new ExpenseWithoutChargeError(known.find(([pattern]) => pattern.test(message))?.[1]
      || 'Encerramento ainda não confirmado. Confira esta mesma tentativa para consultar o resultado.', safeToEdit);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.id !== attempt.sourceId || row.status !== 'CANCELADO' || !row.valor_sem_cobranca_em) {
    throw new ExpenseWithoutChargeError('Resultado do encerramento incompleto. Confira esta mesma tentativa.');
  }
  return row;
}
