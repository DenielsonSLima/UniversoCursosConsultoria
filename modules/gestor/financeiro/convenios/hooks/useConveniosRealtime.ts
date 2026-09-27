import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { invalidateConveniosScope } from '../convenios.cache';

const CONVENIO_SOURCES = new Set([
  'convenios_financeiros',
  'convenios_financeiros_competencias',
  'convenios_financeiros_creditos',
  'convenios_financeiros_despesas',
]);

export const useConveniosRealtime = (poloId: string, enabled = true) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !poloId) return undefined;

    let timer: number | undefined;
    const schedule = (payload: { new?: Record<string, unknown> }) => {
      const row = payload.new || {};
      if (!CONVENIO_SOURCES.has(String(row.source_table || ''))) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        void invalidateConveniosScope(queryClient, poloId);
      }, 250);
    };

    const channel = supabase
      .channel(`convenios_financeiros_realtime_${poloId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'finance_realtime_events',
        filter: `polo_id=eq.${poloId}`,
      }, schedule)
      .subscribe();

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, poloId, queryClient]);
};
