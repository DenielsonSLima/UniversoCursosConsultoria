import type { ManualCycleObservationIdentity } from './manual-cycle-observation';

export interface PendingCycleObservation extends ManualCycleObservationIdentity { startedAt: number }
const prefix = 'universo:manual-cycle-observation:';
const memory = new Map<string, PendingCycleObservation | null>();
const listeners = new Set<() => void>();
interface StoragePort {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
const storage = (): StoragePort | null => {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
};

export function loadPendingCycleObservation(turmaId: string, port: StoragePort | null = storage()): PendingCycleObservation | null {
  try {
    const value = JSON.parse(port?.getItem(prefix + turmaId) ?? 'null');
    return value && value.turmaId === turmaId && typeof value.matriculaId === 'string'
      && [1, 2].includes(value.cicloNumero) && Number.isFinite(value.startedAt)
      && (value.requestId == null || typeof value.requestId === 'string') ? {
        turmaId, matriculaId: value.matriculaId, cicloNumero: value.cicloNumero,
        requestId: value.requestId ?? null, startedAt: value.startedAt,
      } : null;
  } catch { return null; }
}

export const getPendingCycleObservation = (turmaId: string) => {
  if (!memory.has(turmaId)) memory.set(turmaId, loadPendingCycleObservation(turmaId));
  return memory.get(turmaId) ?? null;
};
export const subscribePendingCycleObservation = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function rememberPendingCycleObservation(input: ManualCycleObservationIdentity, port: StoragePort | null = storage()) {
  const current = getPendingCycleObservation(input.turmaId);
  const value = { turmaId: input.turmaId, matriculaId: input.matriculaId,
    cicloNumero: input.cicloNumero, requestId: input.requestId ?? null,
    startedAt: current?.matriculaId === input.matriculaId
    && current.cicloNumero === input.cicloNumero && current.requestId === input.requestId ? current.startedAt : Date.now() };
  memory.set(input.turmaId, value);
  try { port?.setItem(prefix + input.turmaId, JSON.stringify(value)); } catch { /* In-memory monitoring still works. */ }
  listeners.forEach((listener) => listener());
}

export function forgetPendingCycleObservation(input: ManualCycleObservationIdentity, port: StoragePort | null = storage()) {
  const current = getPendingCycleObservation(input.turmaId);
  if (!current || current.matriculaId !== input.matriculaId || current.cicloNumero !== input.cicloNumero
    || (input.requestId && current.requestId !== input.requestId)) return;
  memory.set(input.turmaId, null);
  try { port?.removeItem(prefix + input.turmaId); } catch { /* Never turn a storage problem into issuance failure. */ }
  listeners.forEach((listener) => listener());
}
