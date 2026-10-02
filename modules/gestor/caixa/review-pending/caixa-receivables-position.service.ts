import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { assertCaixaReviewRequest, caixaReviewKeys } from './caixa-review-pending.service';

export interface CaixaReceivablesPositionGroup {
  openConfirmed: string;
  overdue: string;
  toDue: string;
  count: number;
  reviewCount: number;
  reviewNominal: string;
}
export interface CaixaReceivablesPosition {
  poloId: string | null;
  competencia: string;
  dataCorte: string;
  geradoEm: string;
  monthly: CaixaReceivablesPositionGroup;
  portfolio: CaixaReceivablesPositionGroup;
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Posição de recebíveis inválida.');
  return value as Record<string, unknown>;
};
const exactKeys = (value: Record<string, unknown>, expected: string[]) => {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('Posição de recebíveis incompatível.');
  }
};

export function parseCaixaReceivablesPosition(value: unknown, poloId: string | null, competencia: string): CaixaReceivablesPosition {
  const envelope = record(value);
  exactKeys(envelope, ['success', 'data']);
  const data = record(envelope.data);
  exactKeys(data, ['poloId', 'competencia', 'dataCorte', 'geradoEm', 'monthly', 'portfolio']);
  if (envelope.success !== true || data.poloId !== poloId || data.competencia !== competencia
    || typeof data.dataCorte !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.dataCorte)
    || !Number.isFinite(Date.parse(`${data.dataCorte}T00:00:00Z`))
    || new Date(`${data.dataCorte}T00:00:00Z`).toISOString().slice(0, 10) !== data.dataCorte
    || typeof data.geradoEm !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(data.geradoEm)
    || !Number.isFinite(Date.parse(data.geradoEm))) throw new Error('Posição retornada fora do recorte solicitado.');
  for (const key of ['monthly', 'portfolio']) {
    const group = record(data[key]);
    exactKeys(group, ['openConfirmed', 'overdue', 'toDue', 'count', 'reviewCount', 'reviewNominal']);
    if (!['openConfirmed', 'overdue', 'toDue', 'reviewNominal'].every((field) =>
      typeof group[field] === 'string' && /^\d+\.\d{2}$/.test(group[field] as string))
      || !['count', 'reviewCount'].every((field) => Number.isSafeInteger(group[field]) && Number(group[field]) >= 0)) {
      throw new Error('Valores canônicos da posição de recebíveis inválidos.');
    }
  }
  const [year, month] = competencia.split('-').map(Number);
  if (data.dataCorte >= new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)) {
    throw new Error('Corte retornado fora da competência solicitada.');
  }
  return data as unknown as CaixaReceivablesPosition;
}

export async function getCaixaReceivablesPosition(poloId: string | null, competencia: string, signal?: AbortSignal) {
  assertCaixaReviewRequest({ poloId, competencia, context: 'MONTHLY', page: 1, pageSize: 20 });
  const call = supabase.rpc('get_caixa_receivables_position_secure', { p_polo_id: poloId, p_competencia: competencia });
  if (signal) call.abortSignal(signal);
  let result;
  try { result = await call; } catch { throw new Error('Não foi possível consultar a posição de recebíveis.'); }
  if (result.error) throw new Error(result.error.code === '42501'
    ? 'Seu acesso não permite consultar esta posição.' : 'Não foi possível consultar a posição de recebíveis.');
  return parseCaixaReceivablesPosition(result.data, poloId, competencia);
}

export const caixaReceivablesPositionQueryOptions = (poloId: string | null, competencia: string) => queryOptions({
  queryKey: [...caixaReviewKeys.forPolo(poloId), 'position', competencia],
  queryFn: ({ signal }) => getCaixaReceivablesPosition(poloId, competencia, signal),
  staleTime: 15_000, gcTime: 0, retry: false, retryOnMount: false,
  refetchOnWindowFocus: false, refetchOnReconnect: false,
});
