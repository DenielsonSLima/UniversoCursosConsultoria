import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../../../../lib/supabase';
import { calendarioAulasExportacaoQueryKeys } from '../calendarioAulasExportacao.queryKeys';
import { getCalendarioAulasRealtimeSubscription } from '../calendarioAulasExportacao.realtime';
import type { CalendarioAulasModalidade } from '../types';

/**
 * Observa exclusivamente a grade da turma aberta. O evento não carrega
 * snapshots para a interface: apenas invalida as leituras canônicas que a
 * próxima exportação pedirá à RPC.
 */
export function useCalendarioAulasGradeRealtime(
  poloId?: string | null,
  modalidade?: CalendarioAulasModalidade | null,
  turmaId?: string | null,
) {
  const queryClient = useQueryClient();
  const scopedPoloId = poloId?.trim() || '';
  const scopedTurmaId = turmaId?.trim() || '';

  useEffect(() => {
    if (!scopedPoloId || !modalidade || !scopedTurmaId) return undefined;

    const invalidateScopedExport = () => {
      void queryClient.invalidateQueries({
        queryKey: calendarioAulasExportacaoQueryKeys.turmas(scopedPoloId, modalidade),
      });
      void queryClient.invalidateQueries({
        queryKey: calendarioAulasExportacaoQueryKeys.documento(
          scopedPoloId,
          modalidade,
          scopedTurmaId,
        ),
      });
    };
    const subscription = getCalendarioAulasRealtimeSubscription(scopedTurmaId);
    const channel = supabase
      .channel(`gestor_calendario_aulas_export_${scopedPoloId}_${modalidade}_${scopedTurmaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', ...subscription },
        invalidateScopedExport,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [modalidade, queryClient, scopedPoloId, scopedTurmaId]);
}
