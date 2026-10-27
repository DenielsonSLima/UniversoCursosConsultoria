import { isIssuedCycleReceivable, readCycleQuantities } from './matricula-tecnica-ciclo-manual-destination';
import type { GerarCicloFinanceiroTecnicoManualResult } from './matricula-tecnica-ciclo-manual.types';

export interface ManualCycleObservationIdentity {
  matriculaId: string;
  turmaId: string;
  cicloNumero: number;
  requestId?: string | null;
}

export interface ManualCycleObservation extends ManualCycleObservationIdentity {
  versao: 1;
  encontrado: boolean;
  requestId: string | null;
  observadoEm: string;
  ciclo: (Omit<GerarCicloFinanceiroTecnicoManualResult['ciclo'], 'status'> & { status: string }) | null;
}

export type ObservedCycleCompletion = Pick<GerarCicloFinanceiroTecnicoManualResult,
  'success' | 'requestId' | 'replayed' | 'ciclo'> & { confirmadoPorConsulta: true };

const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown) => Number.isInteger(v) && Number(v) >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function requireManualCycleObservation(value: unknown, expected: ManualCycleObservationIdentity): ManualCycleObservation {
  if (!record(value) || value.versao !== 1 || typeof value.encontrado !== 'boolean'
    || value.matriculaId !== expected.matriculaId || value.turmaId !== expected.turmaId
    || value.cicloNumero !== expected.cicloNumero || !text(value.observadoEm)
    || !Number.isFinite(Date.parse(value.observadoEm))) {
    throw new Error('A consulta não confirmou a identidade do acompanhamento. Nenhuma nova emissão foi solicitada.');
  }
  if (!value.encontrado) {
    if (value.requestId !== null || value.ciclo !== null) throw new Error('Consulta de preparação inconsistente.');
    return value as unknown as ManualCycleObservation;
  }
  const cycle = value.ciclo;
  if (!text(value.requestId) || (expected.requestId && value.requestId !== expected.requestId)
    || !record(cycle) || cycle.numero !== expected.cicloNumero || !text(cycle.status)
    || !readCycleQuantities(cycle, true) || !['emitidosBanese', 'pendentesEmissao', 'emRevisao'].every((k) => integer(cycle[k]))
    || Number(cycle.emitidosBanese) + Number(cycle.pendentesEmissao) + Number(cycle.emRevisao) !== cycle.quantidadeBancaria
    || !text(cycle.total) || !/^\d+(?:\.\d+)?$/.test(cycle.total)
    || !Array.isArray(cycle.recebiveis) || cycle.recebiveis.length !== cycle.quantidadeItens
    || !cycle.recebiveis.every((item) => record(item) && text(item.id) && text(item.chave)
      && ['MATRICULA', 'REMATRICULA', 'PARCELA'].includes(String(item.tipo)) && integer(item.numero)
      && text(item.descricao) && text(item.valor) && /^\d+(?:\.\d+)?$/.test(item.valor) && date(item.vencimento))
    || new Set(cycle.recebiveis.map((item) => item.id)).size !== cycle.quantidadeItens
    || new Set(cycle.recebiveis.map((item) => item.chave)).size !== cycle.quantidadeItens
    || cycle.recebiveis.filter((item) => item.destinoCobranca === 'LOCAL').length !== cycle.quantidadeLocal) {
    throw new Error('O servidor não confirmou o progresso desta operação. Não envie uma nova emissão.');
  }
  return value as unknown as ManualCycleObservation;
}

export function observedCycleCompletion(observation: ManualCycleObservation): ObservedCycleCompletion | null {
  const cycle = observation.ciclo;
  if (!observation.encontrado || !cycle || !observation.requestId
    || cycle.pendentesEmissao !== 0 || cycle.emRevisao !== 0
    || cycle.emitidosBanese !== cycle.quantidadeBancaria
    || !cycle.recebiveis.every((item) => isIssuedCycleReceivable(item as unknown as Record<string, unknown>, cycle.numero))) return null;
  return { success: true, requestId: observation.requestId, replayed: true,
    ciclo: { ...cycle, status: 'EMITIDO_BANESE' }, confirmadoPorConsulta: true };
}

export class ManualCycleOutcomeUnconfirmed extends Error {
  readonly code = 'MANUAL_CYCLE_OUTCOME_UNCONFIRMED';
  readonly remoteOutcomeUnknown = true;
  constructor() {
    super('O tempo de acompanhamento terminou sem confirmação final. A emissão pode ter continuado no banco. Consulte o progresso ou o extrato; não gere novamente.');
  }
}

/** One send only. Reads may confirm completion even when the POST response never arrives. */
export async function observeManualCycleIssuance<T>(sendOnce: () => Promise<T>, read: () => Promise<ManualCycleObservation>, options: {
  timeoutMs?: number; intervalMs?: number; failureIntervalMs?: number;
} = {}): Promise<T | ObservedCycleCompletion> {
  let stopped = false;
  let wake: (() => void) | undefined;
  let interval: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const wait = (ms: number) => new Promise<void>((resolve) => {
    wake = resolve; interval = setTimeout(resolve, ms);
  });
  const observe = async (): Promise<ObservedCycleCompletion> => {
    while (!stopped) {
      let delay = options.intervalMs ?? 2_000;
      try {
        const completion = observedCycleCompletion(await read());
        if (!stopped && completion) return completion;
      } catch { delay = options.failureIntervalMs ?? 5_000; }
      if (!stopped) await wait(delay);
    }
    return new Promise<never>(() => {});
  };
  try {
    const sent = sendOnce().catch(async (error: unknown) => {
      // A failed transport/response may follow a committed bank result. Reconcile
      // by reading once; never retry the command or infer that nothing was issued.
      if (stopped) throw error;
      try {
        const completion = observedCycleCompletion(await read());
        if (!stopped && completion) return completion;
      } catch { /* Preserve the original error when the outcome cannot be proven. */ }
      throw error;
    });
    return await Promise.race([sent, observe(), new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new ManualCycleOutcomeUnconfirmed()), options.timeoutMs ?? 180_000);
    })]);
  } finally {
    stopped = true;
    if (interval) clearTimeout(interval);
    if (deadline) clearTimeout(deadline);
    wake?.();
  }
}
