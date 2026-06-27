import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { despesasQueryKeys } from '../despesas/despesas.queryKeys';

export function useFinanceiroRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateFinanceiro = () => {
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot });
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot });
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.transferenciasRoot });
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos });
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis });
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables });
      queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] });
      queryClient.invalidateQueries({ queryKey: ['turma-financeiro'] });
    };

    const invalidateDespesas = () => {
      queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot });
    };

    const channel = supabase
      .channel('financeiro_recebiveis_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_receber' }, invalidateFinanceiro)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_bancarias' }, invalidateFinanceiro)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias_contas' }, invalidateFinanceiro)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despesas_lancamentos' }, invalidateDespesas)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
