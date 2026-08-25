import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';
import {
  portalRealtimeSignalFilter,
  portalRealtimeTopics,
} from '../../shared/realtime/portal-realtime-signals';
import { professorComunicacaoQueryKeys } from './professor-comunicacao.query-keys';

export const useProfessorComunicacaoRealtime = (
  professorId: string,
  activeChatId: string | null,
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!professorId) return undefined;

    const invalidation = createRealtimeInvalidationController({
      invalidate: () => queryClient.invalidateQueries({
        queryKey: professorComunicacaoQueryKeys.chats(professorId),
        exact: true,
      }),
    });
    const channel = supabase
      .channel(`professor_chats_realtime_${professorId}`)
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(portalRealtimeTopics.professorChats(professorId)),
        invalidation.schedule,
      )
      .subscribe(invalidation.onChannelStatus);

    return () => {
      invalidation.dispose();
      void supabase.removeChannel(channel);
    };
  }, [professorId, queryClient]);

  useEffect(() => {
    if (!activeChatId) return undefined;

    const invalidation = createRealtimeInvalidationController({
      invalidate: () => queryClient.invalidateQueries({
        queryKey: professorComunicacaoQueryKeys.messages(activeChatId),
        exact: true,
      }),
    });
    const channel = supabase
      .channel(`chat_msgs_realtime_${activeChatId}`)
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(
          portalRealtimeTopics.professorChatMessages(professorId, activeChatId),
        ),
        invalidation.schedule,
      )
      .subscribe(invalidation.onChannelStatus);

    return () => {
      invalidation.dispose();
      void supabase.removeChannel(channel);
    };
  }, [activeChatId, professorId, queryClient]);
};
