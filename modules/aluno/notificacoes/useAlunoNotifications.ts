import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { alunoNotificationKeys, alunoNotificationService } from './notificacoes.service';
import type { AlunoNotificationFilter } from './notificacoes.types';

const useNotificationRealtime = (alunoId: string, enabled: boolean) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !alunoId) return;

    const channel = supabase
      .channel(`aluno_notification_inbox_${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'aluno_notificacoes',
          filter: `aluno_id=eq.${alunoId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: alunoNotificationKeys.root(alunoId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alunoId, enabled, queryClient]);
};

export const useAlunoUnreadNotifications = (alunoId: string, enabled: boolean) => {
  const canFetch = enabled && Boolean(alunoId);
  useNotificationRealtime(alunoId, canFetch);

  const { data = 0 } = useQuery({
    queryKey: alunoNotificationKeys.unread(alunoId),
    enabled: canFetch,
    queryFn: () => alunoNotificationService.unreadCount(alunoId),
    refetchInterval: 60_000,
  });

  return data;
};

export const useAlunoNotifications = (
  alunoId: string,
  filter: AlunoNotificationFilter,
) => {
  const queryClient = useQueryClient();
  const rootKey = alunoNotificationKeys.root(alunoId);
  const listQuery = useQuery({
    queryKey: alunoNotificationKeys.list(alunoId, filter),
    queryFn: () => alunoNotificationService.list(alunoId, filter),
    enabled: Boolean(alunoId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: rootKey });
  const markRead = useMutation({
    mutationFn: alunoNotificationService.markRead,
    onSuccess: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: alunoNotificationService.markAllRead,
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: alunoNotificationService.archive,
    onSuccess: refresh,
  });

  return {
    notifications: listQuery.data || [],
    loading: listQuery.isLoading,
    error: listQuery.error,
    refetch: listQuery.refetch,
    markRead: markRead.mutateAsync,
    markingAllRead: markAllRead.isPending,
    markAllRead: markAllRead.mutateAsync,
    archivingId: archive.isPending ? archive.variables : null,
    archive: archive.mutateAsync,
  };
};
