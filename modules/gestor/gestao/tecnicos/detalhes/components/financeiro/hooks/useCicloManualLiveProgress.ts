import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query';
import { manualCycleProgressOptions } from '../manual-cycle-progress.service';
import { observedCycleCompletion, type ManualCycleObservationIdentity } from '../manual-cycle-observation';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';

export const manualCycleObservationMutationKey = ['manual-cycle-issuance-observation'] as const;
const OBSERVATION_WINDOW_MS = 180_000;

export function useCicloManualLiveProgress(input: ManualCycleObservationIdentity & { startedAt?: number }) {
  const queryClient = useQueryClient();
  const { turmaId, matriculaId, cicloNumero, requestId, startedAt } = input;
  const beginning = useMemo(() => startedAt ?? Date.now(),
    [turmaId, matriculaId, cicloNumero, requestId, startedAt]);
  const [expired, setExpired] = useState(() => Date.now() - beginning >= OBSERVATION_WINDOW_MS);
  const reconciled = useRef(new Set<string>());
  const sameOperation = useCallback((value: unknown) => {
    const variables = value as (ManualCycleObservationIdentity & { correctionOperationId?: string }) | undefined;
    return !variables?.correctionOperationId
      && variables?.turmaId === turmaId && variables?.matriculaId === matriculaId
      && variables?.cicloNumero === cicloNumero
      && (variables?.requestId ?? null) === (requestId ?? null);
  }, [turmaId, matriculaId, cicloNumero, requestId]);
  const observers = useIsMutating({
    mutationKey: manualCycleObservationMutationKey,
    exact: true,
    predicate: (mutation) => sameOperation(mutation.state.variables),
  });

  useEffect(() => {
    const remaining = beginning + OBSERVATION_WINDOW_MS - Date.now();
    setExpired(remaining <= 0);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [beginning]);

  const query = useQuery({
    ...manualCycleProgressOptions(input),
    enabled: true,
    refetchOnMount: 'always',
    // The command observer owns polling while this exact operation is active.
    // Reopening after reload has no command observer, so only GETs resume here.
    refetchInterval: (current) => {
      if (observers > 0 || expired || Date.now() - beginning >= OBSERVATION_WINDOW_MS) return false;
      const observation = current.state.data;
      if (observation && (observedCycleCompletion(observation)
        || (observation.ciclo?.emRevisao ?? 0) > 0)) return false;
      return current.state.status === 'error' ? 5_000 : 2_000;
    },
  });
  const completed = Boolean(query.data && observedCycleCompletion(query.data));
  const review = (query.data?.ciclo?.emRevisao ?? 0) > 0;

  useEffect(() => {
    if (!completed || observers > 0 || !query.data?.requestId) return;
    const key = JSON.stringify([turmaId, matriculaId, cicloNumero, query.data.requestId]);
    if (reconciled.current.has(key)) return;
    reconciled.current.add(key);
    const confirmedByCommand = queryClient.getMutationCache().findAll({
      mutationKey: manualCycleObservationMutationKey,
      exact: true,
      predicate: (mutation) => {
        const data = mutation.state.data as { success?: boolean; requestId?: string; ciclo?: { numero?: number } } | undefined;
        return sameOperation(mutation.state.variables) && mutation.state.status === 'success'
          && data?.success === true && data.requestId === query.data?.requestId
          && data.ciclo?.numero === cicloNumero;
      },
    }).length > 0;
    if (confirmedByCommand) return; // Its onSettled already reconciled this terminal result.
    // Refresh the class/carnet projection and this student's statement only.
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: ['turma-financeiro-extrato-aluno', matriculaId], exact: true }),
    ]).catch(() => undefined);
  }, [completed, observers, sameOperation, query.data?.requestId, queryClient, turmaId, matriculaId, cicloNumero]);

  return { query, completed, automaticCheckPaused: observers === 0 && expired && !completed && !review };
}
