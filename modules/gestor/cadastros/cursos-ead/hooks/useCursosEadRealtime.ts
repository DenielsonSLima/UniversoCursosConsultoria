import { useEffect } from 'react';
import { supabase } from '../../../../../lib/supabase';

export const useCursosEadRealtime = (invalidateEadQueries: () => void) => {
  useEffect(() => {
    const channel = supabase
      .channel('ead_gestor_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cursos' }, invalidateEadQueries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas' }, invalidateEadQueries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas' }, invalidateEadQueries)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidateEadQueries]);
};
