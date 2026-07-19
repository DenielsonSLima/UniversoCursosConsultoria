import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export const usePendingCommunicationCount = (enabled: boolean) => {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const refreshPendingCount = async () => {
      try {
        const { data: sessions, error: sessionsError } = await supabase
          .from('whatsapp_flow_sessions')
          .select('conversa_id,data')
          .eq('handoff_required', true)
          .eq('status', 'handoff');
        if (sessionsError) throw sessionsError;

        const requestedConversationIds = [...new Set((sessions || [])
          .filter((session: any) => ['menu_attendant', 'requested_attendant'].includes(String(session.data?.handoffReason || '')))
          .map((session: any) => session.conversa_id)
          .filter(Boolean))];

        const { data: openConversations, error: conversationsError } = requestedConversationIds.length
          ? await supabase.from('whatsapp_conversas').select('id').in('id', requestedConversationIds).eq('status', 'aberta')
          : { data: [] as Array<{ id: string }>, error: null };
        if (conversationsError) throw conversationsError;

        if (!cancelled) {
          setPendingCount(openConversations?.length || 0);
        }
      } catch (error) {
        console.error('Erro ao buscar contagem de chamados pendentes:', error);
      }
    };

    void refreshPendingCount();
    const channel = supabase
      .channel('sidebar_pending_badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_flow_sessions' },
        () => { void refreshPendingCount(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversas' },
        () => { void refreshPendingCount(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return pendingCount;
};
