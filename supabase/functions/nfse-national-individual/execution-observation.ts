import { NfseContractError } from '../_shared/nfse-national/xml.ts';
type Action = 'ISSUE' | 'RECONCILE' | 'CANCEL' | 'RECONCILE_CANCEL';
type Result = { state: string; code?: string; diagnostics?: unknown };
const states = new Set(['AUTHORIZED', 'REJECTED', 'AWAITING_CONFIRMATION', 'BLOCKED', 'CONFIRMED']);
const code = (value: unknown) => typeof value === 'string' && /^[A-Z][A-Z_]{1,79}$/.test(value) ? value : undefined;
/** Shape-only evidence survives later ledger transitions; never log payloads, keys, IDs or XML. */
export async function observeFiscalExecution<T extends Result>(action: Action, task: () => Promise<T>,
  emit: (record: Record<string, unknown>) => void = record => console.info(JSON.stringify(record)),
  now: () => number = () => globalThis.performance.now()): Promise<T> {
  const started = now();
  const record = (state: string, reason?: string, diagnostics?: unknown) => {
    const data: Record<string, unknown> = { event: 'nfse_execution_result', action, state,
      elapsedMs: Math.max(0, Math.round(now() - started)), ...(reason ? { code: reason } : {}) };
    const d = diagnostics && typeof diagnostics === 'object' ? diagnostics as Record<string, unknown> : {};
    if (typeof d.postAttemptedInThisExecution === 'boolean') data.postAttempted = d.postAttemptedInThisExecution;
    if (Number.isInteger(d.postResponseStatus) && Number(d.postResponseStatus) >= 100 && Number(d.postResponseStatus) <= 599) data.postStatus = d.postResponseStatus;
    const consult = d.consult && typeof d.consult === 'object' ? d.consult as Record<string, unknown> : {};
    if (['BEFORE_POST', 'AFTER_POST', 'RECONCILE'].includes(String(consult.phase))) data.consultPhase = consult.phase;
    if (Number.isInteger(consult.httpStatus) && Number(consult.httpStatus) >= 100 && Number(consult.httpStatus) <= 599) data.consultStatus = consult.httpStatus;
    try { emit(data); } catch { /* Observability never changes fiscal processing. */ }
  };
  try {
    const result = await task();
    record(states.has(result.state) ? result.state : 'UNKNOWN', code(result.code), result.diagnostics);
    return result;
  } catch (error) {
    record('EXCEPTION', error instanceof NfseContractError ? code(error.code) : 'UNEXPECTED_EXECUTION_ERROR');
    throw error;
  }
}
