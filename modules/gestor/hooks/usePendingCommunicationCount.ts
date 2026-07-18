import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export const usePendingCommunicationCount = (enabled: boolean) => {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const refreshPendingCount = async () => {
      try {
        const { data } = await supabase
          .from('comunicacao_mensagens')
          .select('chat_id')
          .eq('lida', false)
          .in('remetente_tipo', ['aluno', 'professor']);
        if (!cancelled) {
          setPendingCount(new Set(data?.map(message => message.chat_id) || []).size);
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
        { event: '*', schema: 'public', table: 'comunicacao_mensagens' },
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
