import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { integracaoBancariaService } from '../../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import {
  fetchConciliacaoDiagnosticsData,
  fetchConciliacaoListData,
  fetchConciliacaoOverviewData,
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
  diagnosticsEnabled?: boolean;
}

const DEFAULT_CHANNEL_COUNTS: ConciliacaoChannelCounts = {
  totalCount: 0,
  pendenteCount: 0,
  apiCount: 0,
  cnabCount: 0,
  caixaCount: 0,
  mpCount: 0,
};

const CONCILIACAO_OVERVIEW_QUERY_KEY = [
  ...financeiroQueryKeys.conciliacaoBancariaRoot,
  'overview',
] as const;
const REALTIME_INVALIDATION_DEBOUNCE_MS = 2_000;

export const useBaneseConciliacaoQueries = (params?: UseBaneseConciliacaoQueriesParams) => {
  const queryClient = useQueryClient();
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const search = params?.search ?? '';
  const status = params?.status ?? 'TODOS';
  const canal = params?.canal ?? 'TODOS';
  const diagnosticsEnabled = params?.diagnosticsEnabled === true;
  const receivablesInvalidationTimerRef = useRef<number | null>(null);
  const diagnosticsInvalidationTimerRef = useRef<number | null>(null);

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
    queryFn: () => fetchConciliacaoListData({
      environment: activeEnvironment!,
      page,
      pageSize,
      search,
      status,
      canal,
    }),
    enabled: Boolean(activeEnvironment),
    refetchOnWindowFocus: true,
  });

  const overviewDataQuery = useQuery({
    queryKey: [
      ...CONCILIACAO_OVERVIEW_QUERY_KEY,
      activeEnvironment || 'environment-pending',
    ],
    queryFn: () => fetchConciliacaoOverviewData(activeEnvironment!),
    enabled: Boolean(activeEnvironment),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const diagnosticsDataQuery = useQuery({
    queryKey: [
      ...financeiroQueryKeys.conciliacaoBancariaTransacoes(null),
      activeEnvironment || 'environment-pending',
    ],
    queryFn: () => fetchConciliacaoDiagnosticsData(activeEnvironment!),
    enabled: Boolean(activeEnvironment) && diagnosticsEnabled,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const invalidateListAndOverview = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: financeiroQueryKeys.conciliacaoBancariaItems(null),
        refetchType: 'active',
      }),
      queryClient.invalidateQueries({
        queryKey: CONCILIACAO_OVERVIEW_QUERY_KEY,
        refetchType: 'active',
      }),
    ]);
  }, [queryClient]);

  const invalidateDiagnostics = useCallback(() => queryClient.invalidateQueries({
    queryKey: financeiroQueryKeys.conciliacaoBancariaTransacoes(null),
    refetchType: 'active',
  }), [queryClient]);

  const invalidateConciliacao = useCallback(async () => {
    await Promise.allSettled([
      invalidateListAndOverview(),
      invalidateDiagnostics(),
    ]);
  }, [invalidateDiagnostics, invalidateListAndOverview]);

  const scheduleReceivablesInvalidation = useCallback(() => {
    if (receivablesInvalidationTimerRef.current !== null) {
      window.clearTimeout(receivablesInvalidationTimerRef.current);
    }
    receivablesInvalidationTimerRef.current = window.setTimeout(() => {
      receivablesInvalidationTimerRef.current = null;
      void invalidateListAndOverview();
    }, REALTIME_INVALIDATION_DEBOUNCE_MS);
  }, [invalidateListAndOverview]);

  const scheduleDiagnosticsInvalidation = useCallback(() => {
    if (diagnosticsInvalidationTimerRef.current !== null) {
      window.clearTimeout(diagnosticsInvalidationTimerRef.current);
    }
    diagnosticsInvalidationTimerRef.current = window.setTimeout(() => {
      diagnosticsInvalidationTimerRef.current = null;
      void invalidateDiagnostics();
    }, REALTIME_INVALIDATION_DEBOUNCE_MS);
  }, [invalidateDiagnostics]);

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
        scheduleDiagnosticsInvalidation,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contas_receber',
          filter: 'gateway_provider=eq.banese_card',
        },
        scheduleReceivablesInvalidation,
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
      if (receivablesInvalidationTimerRef.current !== null) {
        window.clearTimeout(receivablesInvalidationTimerRef.current);
        receivablesInvalidationTimerRef.current = null;
      }
      if (diagnosticsInvalidationTimerRef.current !== null) {
        window.clearTimeout(diagnosticsInvalidationTimerRef.current);
        diagnosticsInvalidationTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [invalidateAll, scheduleDiagnosticsInvalidation, scheduleReceivablesInvalidation]);

  const overviewSummary = overviewDataQuery.data?.summary || {
    totalPendentes: 0,
    valorPendentes: null,
    totalPagoHoje: 0,
    totalComErro: 0,
    apiSync: { ...EMPTY_API_SYNC_SUMMARY },
    cnab240Sync: { ...EMPTY_API_SYNC_SUMMARY },
  };
  const diagnosticsError = diagnosticsDataQuery.data?.error
    || (diagnosticsDataQuery.isError
      ? 'O diagnóstico bancário não pôde ser carregado neste momento.'
      : null);
  const overviewError = overviewDataQuery.isError
    ? 'Os indicadores consolidados da conciliação estão temporariamente indisponíveis. A lista abaixo continua filtrada normalmente.'
    : null;

  return {
    activeEnvironment,
    bankingOverviewQuery,
    cnabOverviewQuery,
    conciliacaoQueryKey,
    dataQuery,
    overviewDataQuery,
    diagnosticsDataQuery,
    invalidateAll,
    invalidateConciliacao,
    receivables: dataQuery.data?.receivables || [],
    transactions: diagnosticsDataQuery.data?.transactions || [],
    channelCounts: overviewDataQuery.data?.channelCounts || DEFAULT_CHANNEL_COUNTS,
    totalCount: dataQuery.data?.totalCount || 0,
    page: dataQuery.data?.page || page,
    pageSize: dataQuery.data?.pageSize || pageSize,
    overviewError,
    diagnosticsError,
    transactionsError: diagnosticsDataQuery.data?.transactionsError || null,
    summary: {
      ...overviewSummary,
      apiSync: diagnosticsDataQuery.data?.apiSync || overviewSummary.apiSync,
      cnab240Sync: diagnosticsDataQuery.data?.cnab240Sync || overviewSummary.cnab240Sync,
    },
  };
};

export type BaneseConciliacaoQueries = ReturnType<typeof useBaneseConciliacaoQueries>;
