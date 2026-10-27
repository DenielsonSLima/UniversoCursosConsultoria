import { supabase } from '../../../../../../../lib/supabase';
import { requireManualCycleObservation, type ManualCycleObservationIdentity } from './manual-cycle-observation';

export const manualCycleProgressKey = (input: ManualCycleObservationIdentity) => [
  'manual-cycle-progress', input.turmaId, input.matriculaId, input.cicloNumero, input.requestId ?? 'existing',
] as const;

export async function readManualCycleProgress(input: ManualCycleObservationIdentity) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const { data, error } = await supabase.rpc('obter_progresso_ciclo_financeiro_tecnico_manual_secure', {
      p_matricula_id: input.matriculaId, p_ciclo_numero: input.cicloNumero,
    }).abortSignal(controller.signal);
    if (error) throw new Error('Não foi possível consultar o progresso agora. Isso não significa que a emissão falhou.');
    return requireManualCycleObservation(data, input);
  } finally { clearTimeout(timeout); }
}

export const manualCycleProgressOptions = (input: ManualCycleObservationIdentity) => ({
  queryKey: manualCycleProgressKey(input), queryFn: () => readManualCycleProgress(input),
  staleTime: 0, gcTime: 15 * 60_000, retry: false as const,
  refetchOnWindowFocus: false as const, refetchOnReconnect: false as const,
});
