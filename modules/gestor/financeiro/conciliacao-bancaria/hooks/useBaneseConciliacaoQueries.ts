import { useCallback, useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { integracaoBancariaService } from '../../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import {
  fetchConciliacaoData,
  type CanalBaixaConciliacao,
  type ConciliacaoChannelCounts,
} from '../conciliacao-bancaria.fetch';
import {
  BANESE_CNAB240_OVERVIEW_QUERY_KEY,
  baneseCnab240Service,
} from '../conciliacao-bancaria.service';
import { EMPTY_API_SYNC_SUMMARY } from '../conciliacao-bancaria.utils';

export interface UseBaneseConciliacaoQueriesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  canal?: CanalBaixaConciliacao | 'TODOS';
}

const DEFAULT_CHANNEL_COUNTS: ConciliacaoChannelCounts = {
  totalCount: 0,
  pendenteCount: 0,
  apiCount: 0,
  cnabCount: 0,
  caixaCount: 0,
  mpCount: 0,
};

export const useBaneseConciliacaoQueries = (params?: UseBaneseConciliacaoQueriesParams) => {
  const queryClient = useQueryClient();
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const search = params?.search ?? '';
  const status = params?.status ?? 'TODOS';
  const canal = params?.canal ?? 'TODOS';

  const bankingOverviewQuery = useQuery({
    queryKey: ['integracao_bancaria'],
    queryFn: integracaoBancariaService.getOverview,
    staleTime: 30_000,
  });

  const cnabOverviewQuery = useQuery({
    queryKey: BANESE_CNAB240_OVERVIEW_QUERY_KEY,
    queryFn: baneseCnab240Service.getOverview,
    staleTime: 30_000,
    retry: false,
  });

  const activeEnvironment = bankingOverviewQuery.data?.activeEnvironment;
  const conciliacaoQueryKey = useMemo(
    () => [
      ...financeiroQueryKeys.conciliacaoBancariaItems(null),
      activeEnvironment || 'environment-pending',
      page,
      pageSize,
      search.trim(),
      status,
      canal,
    ] as const,
    [activeEnvironment, page, pageSize, search, status, canal],
  );

  const dataQuery = useQuery({
    queryKey: conciliacaoQueryKey,
    queryFn: () => fetchConciliacaoData({
      environment: activeEnvironment!,
      page,
      pageSize,
      search,
      status,
      canal,
    }),
    enabled: Boolean(activeEnvironment),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });

  const invalidateConciliacao = useCallback(() => queryClient.invalidateQueries({
    queryKey: financeiroQueryKeys.conciliacaoBancariaItems(null),
    refetchType: 'active',
  }), [queryClient]);

  const invalidateCnabOverview = useCallback(() => queryClient.invalidateQueries({
    queryKey: BANESE_CNAB240_OVERVIEW_QUERY_KEY,
    refetchType: 'active',
  }), [queryClient]);

  const invalidateAll = useCallback(async () => {
    await Promise.allSettled([
      invalidateConciliacao(),
      invalidateCnabOverview(),
    ]);
  }, [invalidateCnabOverview, invalidateConciliacao]);

  useEffect(() => {
    const channel = supabase
      .channel('financeiro_conciliacao_bancaria_global')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_gateway_transactions',
          filter: 'provider_code=eq.banese_card',
        },
        () => { void invalidateConciliacao(); },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contas_receber',
          filter: 'gateway_provider=eq.banese_card',
        },
        () => { void invalidateConciliacao(); },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_gateway_cnab_files',
          filter: 'provider_code=eq.banese_card',
        },
        () => { void invalidateAll(); },
      );

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [invalidateAll, invalidateConciliacao]);

  return {
    activeEnvironment,
    bankingOverviewQuery,
    cnabOverviewQuery,
    conciliacaoQueryKey,
    dataQuery,
    invalidateAll,
    invalidateConciliacao,
    receivables: dataQuery.data?.receivables || [],
    transactions: dataQuery.data?.transactions || [],
    channelCounts: dataQuery.data?.channelCounts || DEFAULT_CHANNEL_COUNTS,
    totalCount: dataQuery.data?.totalCount || 0,
    page: dataQuery.data?.page || page,
    pageSize: dataQuery.data?.pageSize || pageSize,
    summary: dataQuery.data?.summary || {
      totalPendentes: 0,
      valorPendentes: null,
      totalPagoHoje: 0,
      totalComErro: 0,
      apiSync: { ...EMPTY_API_SYNC_SUMMARY },
      cnab240Sync: { ...EMPTY_API_SYNC_SUMMARY },
    },
  };
};

export type BaneseConciliacaoQueries = ReturnType<typeof useBaneseConciliacaoQueries>;
