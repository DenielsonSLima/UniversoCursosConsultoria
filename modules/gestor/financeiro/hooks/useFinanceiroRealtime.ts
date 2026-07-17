import { useEffect } from 'react';
import { QueryKey, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { despesasQueryKeys } from '../despesas/despesas.queryKeys';
import { caixaQueryKeys } from '../../caixa/caixa.service';

const REALTIME_DEBOUNCE_MS = 500;

const recordFromPayload = (payload: any) => {
  if (payload?.new && Object.keys(payload.new).length > 0) return payload.new;
  return payload?.old || {};
};

export function useFinanceiroRealtime(poloId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const activePoloId = poloId && poloId !== 'todos' ? poloId : null;
    let refreshTimer: number | undefined;
    let receivablesChanged = false;
    let accountsChanged = false;
    let transfersChanged = false;
    let expensesChanged = false;
    const turmaIds = new Set<string>();
    const alunoIds = new Set<string>();

    const queryMatchesPolo = (queryKey: QueryKey) => {
      if (!activePoloId) return true;
      return queryKey.some((part) => {
        if (part === activePoloId) return true;
        return Boolean(part && typeof part === 'object' && 'poloId' in part && part.poloId === activePoloId);
      });
    };

    const flush = () => {
      refreshTimer = undefined;

      if (receivablesChanged || accountsChanged || transfersChanged || expensesChanged) {
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.dashboards,
          refetchType: 'none',
        });
      }

      if (receivablesChanged) {
        void queryClient.invalidateQueries({
          predicate: (query) => (
            query.queryKey[0] === financeiroQueryKeys.receivablesRoot[0]
            && query.queryKey[1] === financeiroQueryKeys.receivablesRoot[1]
            && queryMatchesPolo(query.queryKey)
          ),
          refetchType: 'active',
        });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis, exact: true });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos, exact: true });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables });

        turmaIds.forEach((turmaId) => {
          void queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turmaId] });
        });
        alunoIds.forEach((alunoId) => {
          void queryClient.invalidateQueries({ queryKey: ['aluno-financeiro', alunoId] });
        });
      }

      if (accountsChanged) {
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos, exact: true });
      }
      if (transfersChanged) {
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.transferenciasRoot });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos, exact: true });
      }
      if (expensesChanged) {
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos, exact: true });
      }

      receivablesChanged = false;
      accountsChanged = false;
      transfersChanged = false;
      expensesChanged = false;
      turmaIds.clear();
      alunoIds.clear();
    };

    const schedule = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(flush, REALTIME_DEBOUNCE_MS);
    };

    const onReceivableChange = (payload: any) => {
      const record = recordFromPayload(payload);
      if (activePoloId && record.polo_id && record.polo_id !== activePoloId) return;
      receivablesChanged = true;
      if (record.turma_id) turmaIds.add(record.turma_id);
      if (record.cliente_id) alunoIds.add(record.cliente_id);
      schedule();
    };

    const onAccountChange = (payload: any) => {
      const record = recordFromPayload(payload);
      if (activePoloId && record.polo_id && record.polo_id !== activePoloId) return;
      accountsChanged = true;
      schedule();
    };

    const channelName = `financeiro_recebiveis_realtime_${activePoloId || 'todos'}`;
    let channel = supabase.channel(channelName);

    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'contas_receber',
        ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
      },
      onReceivableChange,
    );
    channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_bancarias' }, onAccountChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias_contas' }, () => {
        transfersChanged = true;
        schedule();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despesas_lancamentos' }, () => {
        expensesChanged = true;
        schedule();
      })
      .subscribe();

    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
}
