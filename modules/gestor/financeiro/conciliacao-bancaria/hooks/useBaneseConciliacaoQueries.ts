import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { integracaoBancariaService } from '../../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { fetchConciliacaoData } from '../conciliacao-bancaria.fetch';
import {
  BANESE_CNAB240_OVERVIEW_QUERY_KEY,
  baneseCnab240Service,
} from '../conciliacao-bancaria.service';
import { EMPTY_API_SYNC_SUMMARY } from '../conciliacao-bancaria.utils';

export const useBaneseConciliacaoQueries = () => {
  const queryClient = useQueryClient();
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
    ] as const,
    [activeEnvironment],
  );
  const dataQuery = useQuery({
    queryKey: conciliacaoQueryKey,
    queryFn: () => fetchConciliacaoData(activeEnvironment!),
    enabled: Boolean(activeEnvironment),
    refetchOnWindowFocus: true,
  });

  const invalidateConciliacao = useCallback(() => queryClient.invalidateQueries({
    queryKey: conciliacaoQueryKey,
    refetchType: 'active',
  }), [conciliacaoQueryKey, queryClient]);
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
