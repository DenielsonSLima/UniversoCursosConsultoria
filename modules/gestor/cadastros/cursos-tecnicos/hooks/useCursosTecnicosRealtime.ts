import { useEffect } from 'react';
import { supabase } from '../../../../../lib/supabase';

export function useCursosTecnicosRealtime(onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel('cadastros_cursos_tecnicos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cursos', filter: 'modalidade=eq.TECNICO' },
        onChange
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas' }, onChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onChange]);
}
