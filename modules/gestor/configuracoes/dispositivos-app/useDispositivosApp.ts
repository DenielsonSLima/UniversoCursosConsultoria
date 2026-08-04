import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import {
  dispositivosAppKeys,
  dispositivosAppService,
  type ListAppDeviceUsersParams,
} from './dispositivos-app.service';

export const useDispositivosApp = (params: ListAppDeviceUsersParams) => {
  const queryClient = useQueryClient();
  const polosQuery = useQuery({
    queryKey: dispositivosAppKeys.polos,
    queryFn: dispositivosAppService.listPolos,
    staleTime: 10 * 60 * 1000,
  });
  const summaryQuery = useQuery({
    queryKey: dispositivosAppKeys.summary(params.poloId),
    queryFn: () => dispositivosAppService.getSummary(params.poloId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const usersQuery = useQuery({
    queryKey: dispositivosAppKeys.list(params),
    queryFn: () => dispositivosAppService.listUsers(params),
    placeholderData: (previous) => previous,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    const channel = supabase
      .channel('configuracoes-aluno-app-dispositivos')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'aluno_app_dispositivo_eventos',
      }, () => {
        void queryClient.invalidateQueries({ queryKey: dispositivosAppKeys.all });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'aluno_app_dispositivos',
      }, () => {
        void queryClient.invalidateQueries({ queryKey: dispositivosAppKeys.all });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  useEffect(() => {
    const presenceClock = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void queryClient.invalidateQueries({ queryKey: dispositivosAppKeys.all, refetchType: 'active' });
    }, 60_000);
    return () => window.clearInterval(presenceClock);
  }, [queryClient]);

  return { polosQuery, summaryQuery, usersQuery };
};

export const useAlunoAppDeviceDetail = (alunoId: string) => {
  const detailQuery = useQuery({
    queryKey: dispositivosAppKeys.detail(alunoId),
    queryFn: () => dispositivosAppService.getStudentDetail(alunoId),
    staleTime: 30_000,
  });
  const eventsQuery = useQuery({
    queryKey: dispositivosAppKeys.events(alunoId),
    queryFn: () => dispositivosAppService.listStudentEvents(alunoId),
    staleTime: 30_000,
  });
  return { detailQuery, eventsQuery };
};
