import { useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';

export type CursoPresencialModalidade = 'LIVRE' | 'ESPECIALIZACAO';

interface UseCursosPresenciaisRealtimeParams {
  channelName: string;
  modalidade: CursoPresencialModalidade;
  onChange: () => void;
}

export function useCursosPresenciaisRealtime({ channelName, modalidade, onChange }: UseCursosPresenciaisRealtimeParams) {
  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cursos', filter: `modalidade=eq.${modalidade}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turmas', filter: `modalidade=eq.${modalidade}` },
        onChange,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, modalidade, onChange]);
}
