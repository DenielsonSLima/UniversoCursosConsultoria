import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../../../lib/supabase';
import { isFinanceiroRequestReconciled } from '../matricula-tecnica-financeiro.echo';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';

type FinanceiroBroadcastEvent = 'config-changed' | 'title-changed' | 'rule-changed';

interface FinanceiroBroadcastPayload {
  changed?: boolean;
  turmaId?: string;
  matriculaId?: string | null;
  requestId?: string | null;
  origin?: 'MUTATION' | 'SCHEDULED_WORKER' | 'DATABASE';
}

interface FinanceiroBroadcastMessage {
  event?: FinanceiroBroadcastEvent;
  payload?: FinanceiroBroadcastPayload;
}

const isRelevantMessage = (
  message: FinanceiroBroadcastMessage,
  turmaId: string,
) => {
  const payload = message.payload;
  if (
    payload?.changed !== true
    || payload.turmaId !== turmaId
    || !['MUTATION', 'SCHEDULED_WORKER', 'DATABASE'].includes(String(payload.origin))
    || (payload.requestId !== null && typeof payload.requestId !== 'string')
  ) return false;
  if (message.event === 'rule-changed') return payload.matriculaId === null;
  return (
    (message.event === 'config-changed' || message.event === 'title-changed')
    && typeof payload.matriculaId === 'string'
  );
};

const isSafelyReconciledEcho = (message: FinanceiroBroadcastMessage) => {
  const payload = message.payload;
  return payload?.origin === 'MUTATION'
    && typeof payload.requestId === 'string'
    && isFinanceiroRequestReconciled(payload.requestId);
};

export const useMatriculaTecnicaFinanceiroRealtime = (turmaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!turmaId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingMessages: FinanceiroBroadcastMessage[] = [];
    let subscribedOnce = false;

    const scheduleRefresh = (message: FinanceiroBroadcastMessage) => {
      if (!isRelevantMessage(message, turmaId)) return;
      pendingMessages.push(message);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        const messages = pendingMessages;
        pendingMessages = [];
        if (messages.every(isSafelyReconciledEcho)) return;
        void queryClient.invalidateQueries({
          queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId),
          refetchType: 'active',
        });
      }, 300);
    };
    const scheduleEvent = (event: FinanceiroBroadcastEvent) => (
      { payload }: { payload: FinanceiroBroadcastPayload },
    ) => scheduleRefresh({ event, payload });

    const channel = supabase
      .channel(`financeiro-matricula:turma:${turmaId}`, { config: { private: true } })
      .on('broadcast', { event: 'config-changed' }, scheduleEvent('config-changed'))
      .on('broadcast', { event: 'title-changed' }, scheduleEvent('title-changed'))
      .on('broadcast', { event: 'rule-changed' }, scheduleEvent('rule-changed'))
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedOnce) {
          void queryClient.invalidateQueries({
            queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId),
            refetchType: 'active',
          });
        }
        subscribedOnce = true;
      });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, turmaId]);
};
