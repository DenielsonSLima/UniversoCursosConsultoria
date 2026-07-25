import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { invalidateAlunoCourseAccessQueries } from '../../aluno/shared/aluno-course-access.queries';
import type { EadPaymentPanelData } from '../components/EadPaymentModal';

const RECEIVABLE_PAID_STATUSES = new Set(['PAGO', 'RECEIVED', 'CONFIRMED']);
const ENROLLMENT_ACCESS_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);

const normalizeStatus = (status?: string | null) => String(status || '').toUpperCase();

const isPaidReceivable = (row: any) => (
  RECEIVABLE_PAID_STATUSES.has(normalizeStatus(row?.status)) ||
  RECEIVABLE_PAID_STATUSES.has(normalizeStatus(row?.gateway_status)) ||
  RECEIVABLE_PAID_STATUSES.has(normalizeStatus(row?.asaas_status))
);

const isActiveEnrollment = (row: any) => ENROLLMENT_ACCESS_STATUSES.has(normalizeStatus(row?.status));

/** @deprecated Use invalidateAlunoCourseAccessQueries. */
export const invalidateAlunoEadPaymentQueries = invalidateAlunoCourseAccessQueries;

interface UseEadPaymentConfirmationWatcherOptions {
  alunoId?: string | null;
  panel: EadPaymentPanelData | null;
  queryClient: QueryClient;
  enabled?: boolean;
  onConfirmed: (message?: string) => void;
}

export const useEadPaymentConfirmationWatcher = ({
  alunoId,
  panel,
  queryClient,
  enabled = true,
  onConfirmed,
}: UseEadPaymentConfirmationWatcherOptions) => {
  useEffect(() => {
    if (!enabled || !alunoId || !panel) return;

    const receivableId = String(panel.receivableId || '').trim();
    const matriculaId = String(panel.matriculaId || '').trim();

    if (panel.alreadyPaid) {
      onConfirmed('Pagamento já confirmado. Curso liberado em Meus Cursos.');
      return;
    }

    if (!receivableId && !matriculaId) return;

    let stopped = false;
    let confirmed = false;

    const invalidate = () => invalidateAlunoEadPaymentQueries(queryClient, alunoId);
    const confirmOnce = (message?: string) => {
      if (confirmed || stopped) return;
      confirmed = true;
      invalidate();
      onConfirmed(message);
    };

    const checkPaymentStatus = async () => {
      if (stopped || confirmed) return;
      try {
        let paymentConfirmed = false;
        if (receivableId) {
          const { data } = await supabase
            .from('contas_receber')
            .select('status,gateway_status,asaas_status')
            .eq('id', receivableId)
            .maybeSingle();

          if (isPaidReceivable(data)) {
            paymentConfirmed = true;
          }
        }

        if (matriculaId) {
          const { data: matricula } = await supabase
            .from('matriculas')
            .select('status')
            .eq('id', matriculaId)
            .maybeSingle();

          if (isActiveEnrollment(matricula)) {
            confirmOnce('Pagamento confirmado automaticamente. Curso liberado em Meus Cursos.');
          }
          return;
        }

        if (paymentConfirmed) {
          confirmOnce('Pagamento confirmado automaticamente.');
        }
      } catch (error) {
        console.warn('Nao foi possivel conferir confirmacao do Pix EAD:', error);
      }
    };

    let channel = supabase.channel(`ead_payment_confirmation_${alunoId}_${receivableId || matriculaId}`);

    if (receivableId) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber', filter: `id=eq.${receivableId}` },
        (payload) => {
          invalidate();
          if (isPaidReceivable(payload.new)) {
            void checkPaymentStatus();
          }
        },
      );
    }

    if (matriculaId) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `id=eq.${matriculaId}` },
        (payload) => {
          invalidate();
          if (isActiveEnrollment(payload.new)) {
            confirmOnce('Pagamento confirmado automaticamente. Curso liberado em Meus Cursos.');
          }
        },
      );
    }

    channel.subscribe();
    void checkPaymentStatus();

    const paymentCheckTimer = window.setInterval(checkPaymentStatus, 1800);
    const focusHandler = () => {
      invalidate();
      void checkPaymentStatus();
    };
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') focusHandler();
    };

    window.addEventListener('focus', focusHandler);
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      stopped = true;
      window.clearInterval(paymentCheckTimer);
      window.removeEventListener('focus', focusHandler);
      document.removeEventListener('visibilitychange', visibilityHandler);
      supabase.removeChannel(channel);
    };
  }, [alunoId, enabled, onConfirmed, panel, queryClient]);
};
