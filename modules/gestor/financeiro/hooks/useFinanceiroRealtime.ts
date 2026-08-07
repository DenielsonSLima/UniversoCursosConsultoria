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
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables });

        turmaIds.forEach((turmaId) => {
          void queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turmaId] });
        });
        alunoIds.forEach((alunoId) => {
          void queryClient.invalidateQueries({ queryKey: ['aluno-financeiro', alunoId] });
        });
      }

      if (accountsChanged) {
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos });
      }
      if (transfersChanged) {
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.transferenciasRoot });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis });
      }
      if (expensesChanged) {
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis });
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
      if (record.aluno_id || record.cliente_id) alunoIds.add(record.aluno_id || record.cliente_id);
      schedule();
    };

    const onAccountChange = (payload: any) => {
      accountsChanged = true;
      schedule();
    };

    // A tabela de eventos é compartilhada por receber, pagar, contas e
    // transferências. Não trate toda alteração como conta a receber: isso
    // refazia listas grandes de alunos para uma simples despesa ou baixa.
    const onFinanceEvent = (payload: any) => {
      const record = recordFromPayload(payload);
      if (activePoloId && record.polo_id && record.polo_id !== activePoloId) return;

      switch (record.source_table) {
        case 'contas_receber':
          onReceivableChange(payload);
          break;
        case 'contas_pagar':
        case 'despesas_lancamentos':
          expensesChanged = true;
          schedule();
          break;
        case 'transferencias_contas':
          transfersChanged = true;
          schedule();
          break;
        case 'contas_bancarias':
        case 'contas_bancarias_polos':
          onAccountChange(payload);
          break;
        default:
          // Novas fontes precisam ser classificadas explicitamente antes de
          // invalidarem consultas. Assim evitamos varreduras globais caras.
          break;
      }
    };

    const channelName = `financeiro_recebiveis_realtime_${activePoloId || 'todos'}`;
    let channel = supabase.channel(channelName);

    channel = channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'finance_realtime_events',
        ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
      },
      onFinanceEvent,
    );
    channel = channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'contas_bancarias',
      }, onAccountChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'contas_bancarias_polos',
      }, onAccountChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transferencias_contas',
      }, () => {
        transfersChanged = true;
        schedule();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'despesas_lancamentos',
        ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
      }, () => {
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
