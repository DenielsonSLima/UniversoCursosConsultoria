import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export const usePendingCommunicationCount = (enabled: boolean) => {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const refreshPendingCount = async () => {
      try {
        const { count, error: conversationsError } = await supabase
          .from('whatsapp_conversas')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'aberta')
          .eq('status_atendimento', 'pendente_setor');
        if (conversationsError) throw conversationsError;

        if (!cancelled) {
          setPendingCount(count || 0);
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
