import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { listEadExamsInWait, releaseEadExamEarly } from './provas-ead.service';

const scopeKey = (contextId: string, poloId: string) =>
  ['secretaria', 'provas-ead', contextId, poloId] as const;

const sources = new Set(['matriculas', 'cursos', 'turmas']);

export function useProvasEad(contextId: string, poloId: string, search: string, page: number) {
  const client = useQueryClient();
  const scope = scopeKey(contextId, poloId);
  const list = useQuery({
    queryKey: [...scope, search, page],
    queryFn: ({ signal }) => listEadExamsInWait(poloId, search, page, signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const release = useMutation({
    mutationFn: ({ matriculaId, reason }: { matriculaId: string; reason: string }) =>
      releaseEadExamEarly(poloId, matriculaId, reason),
    retry: false,
    onSettled: () => { void client.invalidateQueries({ queryKey: scope }); },
  });

  useEffect(() => {
    let connected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void client.invalidateQueries({ queryKey: scopeKey(contextId, poloId), refetchType: 'active' });
      }, 200);
    };
    const channel = supabase.channel(`secretaria-provas-ead:${contextId}:${poloId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'gestao_realtime_events', filter: `polo_id=eq.${poloId}`,
      }, ({ new: event }) => {
        if (sources.has(String(event.source_table))) invalidate();
      })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        if (connected) invalidate();
        connected = true;
      });
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [client, contextId, poloId]);

  return { list, release };
}
