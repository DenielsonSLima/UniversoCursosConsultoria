import { useEffect, useMemo, useRef } from 'react';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { alunoNotificationKeys, alunoNotificationService } from './notificacoes.service';
import type {
  AlunoNotification,
  AlunoNotificationCursor,
  AlunoNotificationFilter,
  AlunoNotificationPage,
} from './notificacoes.types';

type NotificationInfiniteData = InfiniteData<
  AlunoNotificationPage,
  AlunoNotificationCursor | null
>;

/**
 * Uma invalidação de InfiniteQuery refaz todas as páginas mantidas no cache.
 * Antes de sincronizar uma mudança nova, descartamos páginas históricas já
 * vistas e refazemos somente a primeira; o aluno pode carregá-las novamente
 * de forma explícita pelo cursor estável.
 */
const keepOnlyFirstNotificationPage = (
  queryClient: QueryClient,
  alunoId: string,
) => {
  queryClient.setQueriesData<NotificationInfiniteData>(
    { queryKey: alunoNotificationKeys.lists(alunoId) },
    (current) => {
      if (!current || current.pages.length <= 1) return current;
      return {
        pages: current.pages.slice(0, 1),
        pageParams: current.pageParams.slice(0, 1),
      };
    },
  );
};

const useNotificationRealtime = (alunoId: string, enabled: boolean) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !alunoId) return;

    let invalidateTimer = 0;
    const invalidateNotificationQueries = () => {
      window.clearTimeout(invalidateTimer);
      invalidateTimer = window.setTimeout(() => {
        keepOnlyFirstNotificationPage(queryClient, alunoId);
        void queryClient.invalidateQueries({ queryKey: alunoNotificationKeys.lists(alunoId) });
        void queryClient.invalidateQueries({ queryKey: alunoNotificationKeys.unread(alunoId) });
      }, 250);
    };

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
        invalidateNotificationQueries,
      )
      .subscribe();

    return () => {
      window.clearTimeout(invalidateTimer);
      void supabase.removeChannel(channel);
    };
  }, [alunoId, enabled, queryClient]);
};

export const useAlunoUnreadNotifications = (alunoId: string, enabled: boolean) => {
  const canFetch = enabled && Boolean(alunoId);
  const queryClient = useQueryClient();
  const previousCountRef = useRef<{ alunoId: string; count: number } | null>(null);
  useNotificationRealtime(alunoId, canFetch);

  const { data } = useQuery({
    queryKey: alunoNotificationKeys.unread(alunoId),
    enabled: canFetch,
    queryFn: () => alunoNotificationService.unreadCount(alunoId),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!canFetch || data === undefined) {
      previousCountRef.current = null;
      return;
    }

    const previous = previousCountRef.current;
    previousCountRef.current = { alunoId, count: data };
    if (previous?.alunoId === alunoId && previous.count !== data) {
      keepOnlyFirstNotificationPage(queryClient, alunoId);
      void queryClient.invalidateQueries({
        queryKey: alunoNotificationKeys.lists(alunoId),
        refetchType: 'active',
      });
    }
  }, [alunoId, canFetch, data, queryClient]);

  return data ?? 0;
};

export const useAlunoNotifications = (
  alunoId: string,
  filter: AlunoNotificationFilter,
) => {
  const queryClient = useQueryClient();
  const rootKey = alunoNotificationKeys.root(alunoId);
  const listQuery = useInfiniteQuery({
    queryKey: alunoNotificationKeys.list(alunoId, filter),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => alunoNotificationService.listPage(
      alunoId,
      filter,
      pageParam as AlunoNotificationCursor | null,
      signal,
    ),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: Boolean(alunoId),
  });

  const notifications = useMemo(() => {
    const unique = new Map<string, AlunoNotification>();
    for (const page of listQuery.data?.pages || []) {
      for (const notification of page.items) unique.set(notification.id, notification);
    }
    return [...unique.values()];
  }, [listQuery.data?.pages]);

  const loadMore = () => {
    if (!listQuery.hasNextPage || listQuery.isFetchingNextPage) return Promise.resolve();
    return listQuery.fetchNextPage();
  };

  const refresh = () => {
    keepOnlyFirstNotificationPage(queryClient, alunoId);
    return queryClient.invalidateQueries({ queryKey: rootKey });
  };
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
    notifications,
    loading: listQuery.isLoading,
    error: listQuery.isLoadingError ? listQuery.error : null,
    refetch: listQuery.refetch,
    hasMore: listQuery.hasNextPage,
    loadingMore: listQuery.isFetchingNextPage,
    loadMoreError: listQuery.isFetchNextPageError ? listQuery.error : null,
    loadMore,
    markRead: markRead.mutateAsync,
    markingAllRead: markAllRead.isPending,
    markAllRead: markAllRead.mutateAsync,
    archivingId: archive.isPending ? archive.variables : null,
    archive: archive.mutateAsync,
  };
};

export const useAlunoNotificationDetail = (
  alunoId: string,
  reference: { notificationId?: string | null; sourceJobId?: string | null },
) => {
  const referenceKey = reference.notificationId || reference.sourceJobId || '';
  const detailQuery = useQuery({
    queryKey: alunoNotificationKeys.detail(alunoId, referenceKey),
    queryFn: () => alunoNotificationService.detail(alunoId, reference),
    enabled: Boolean(alunoId && referenceKey),
  });

  return {
    notification: detailQuery.data || null,
    loading: detailQuery.isLoading,
    error: detailQuery.error,
    refetch: detailQuery.refetch,
  };
};

export const useAlunoPushMarketingPreference = (alunoId: string) => {
  const queryClient = useQueryClient();
  const key = alunoNotificationKeys.marketingPreference(alunoId);
  const preferenceQuery = useQuery({
    queryKey: key,
    queryFn: alunoNotificationService.getMarketingPreference,
    enabled: Boolean(alunoId),
    staleTime: 5 * 60_000,
  });
  const updateMutation = useMutation({
    mutationFn: alunoNotificationService.updateMarketingPreference,
    onSuccess: (preference) => {
      queryClient.setQueryData(key, preference);
    },
  });

  return {
    preference: preferenceQuery.data || null,
    loading: preferenceQuery.isLoading,
    error: preferenceQuery.error || updateMutation.error,
    updating: updateMutation.isPending,
    update: updateMutation.mutateAsync,
  };
};
