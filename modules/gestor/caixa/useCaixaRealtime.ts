import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  getCaixaRealtimeInvalidationScopes,
  getCaixaRealtimeInvalidationTarget,
} from './caixa.realtime';
import { caixaQueryKeys } from './caixa.service';
import { caixaReportQueryKeys } from './report/caixa-report.service';

const DEBOUNCE_MS = 500;

export const useCaixaRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingFinancialScopes = new Set<string>();
    const pendingPatrimonioScopes = new Set<string>();
    let requiresBroadFinancialInvalidation = false;
    let requiresBroadPatrimonioInvalidation = false;

    const invalidatePendingScopes = (refetchType: 'active' | 'none') => {
      if (requiresBroadFinancialInvalidation) {
        void queryClient.invalidateQueries({ queryKey: caixaQueryKeys.statements, refetchType });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.financiamentoResumos,
          refetchType,
        });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.posicoesLiquidas,
          refetchType,
        });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.posicoesTotais,
          refetchType,
        });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.custosOperacionais,
          refetchType,
        });
        void queryClient.invalidateQueries({ queryKey: caixaReportQueryKeys.monthly, refetchType });
      } else {
        pendingFinancialScopes.forEach((scope) => {
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.statementsForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.financiamentoResumosForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.posicoesLiquidasForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.posicoesTotaisForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.custosOperacionaisForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaReportQueryKeys.monthlyForPolo(scope),
            refetchType,
          });
        });
      }

      if (requiresBroadPatrimonioInvalidation) {
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.patrimonioResumos,
          refetchType,
        });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.posicoesLiquidas,
          refetchType,
        });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.posicoesTotais,
          refetchType,
        });
        void queryClient.invalidateQueries({
          queryKey: caixaReportQueryKeys.monthly,
          refetchType,
        });
      } else {
        pendingPatrimonioScopes.forEach((scope) => {
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.patrimonioResumosForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.posicoesLiquidasForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.posicoesTotaisForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaReportQueryKeys.monthlyForPolo(scope),
            refetchType,
          });
        });
      }

      pendingFinancialScopes.clear();
      pendingPatrimonioScopes.clear();
      requiresBroadFinancialInvalidation = false;
      requiresBroadPatrimonioInvalidation = false;
    };

    const invalidatePolos = () => {
      void queryClient.invalidateQueries({
        queryKey: caixaQueryKeys.polos,
        refetchType: 'active',
      });
    };

    const refresh = (payload: { new?: unknown }) => {
      const scopes = getCaixaRealtimeInvalidationScopes(payload);
      const target = getCaixaRealtimeInvalidationTarget(payload);
      if (target === 'PATRIMONIO') {
        if (scopes === null) {
          requiresBroadPatrimonioInvalidation = true;
        } else {
          scopes.forEach((scope) => pendingPatrimonioScopes.add(scope));
        }
      } else if (scopes === null) {
        requiresBroadFinancialInvalidation = true;
      } else {
        scopes.forEach((scope) => pendingFinancialScopes.add(scope));
      }

      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        invalidatePendingScopes('active');
      }, DEBOUNCE_MS);
    };

    const financeChannel = supabase
      .channel('caixa-prestacao-mensal-realtime')
      .on('postgres_changes', {
        // A tabela é append-only. DELETE representa somente a limpeza de
        // eventos antigos e não uma nova alteração financeira.
        event: 'INSERT',
        schema: 'public',
        table: 'finance_realtime_events',
      }, refresh)
      .subscribe();

    const polosChannel = supabase
      .channel('caixa-polos-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'polos',
      }, invalidatePolos)
      .subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        invalidatePendingScopes('none');
      }
      void supabase.removeChannel(financeChannel);
      void supabase.removeChannel(polosChannel);
    };
  }, [queryClient]);
};
