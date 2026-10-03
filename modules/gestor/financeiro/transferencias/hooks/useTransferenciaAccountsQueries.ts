import { useEffect, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { financeiroSharedServiceMethods } from '../../financeiro.shared.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import type { ContaBancaria } from '../../financeiro.types';

export const transferenciaAccountsKey = (poloId: string) => [
  ...financeiroQueryKeys.contasBancariasSaldos,
  'transferencias-polo',
  poloId || 'sem-polo',
] as const;

export const transferenciaAccountsOptions = (poloId: string, enabled = true) => ({
  queryKey: transferenciaAccountsKey(poloId),
  queryFn: async (): Promise<ContaBancaria[]> => {
    if (!poloId || poloId === 'todos') return [];
    const accounts = await financeiroSharedServiceMethods.getContasBancariasSaldos(poloId);
    const available = accounts.filter((account) => account.ativo !== false && account.polosUso.includes(poloId));
    // The shared account's accounting balance cannot substitute the selected polo's balance.
    if (available.some((account) => !Number.isFinite(account.saldoGerencialPolo))) {
      throw new Error('Não foi possível consultar o saldo por polo. Atualize as contas para tentar novamente.');
    }
    return available;
  },
  enabled: enabled && Boolean(poloId) && poloId !== 'todos',
  staleTime: 0,
  gcTime: 30 * 60_000,
  retry: false,
  refetchOnMount: 'always' as const,
});

export function useTransferenciaAccountsQueries(
  poloOrigemId: string,
  poloDestinoId: string,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const instanceId = useId();
  const originAccountsQuery = useQuery(transferenciaAccountsOptions(poloOrigemId, enabled));
  const destinationAccountsQuery = useQuery(transferenciaAccountsOptions(poloDestinoId, enabled));

  useEffect(() => {
    if (!enabled) return;
    const poloIds = [...new Set([poloOrigemId, poloDestinoId])].filter((id) => id && id !== 'todos');
    if (!poloIds.length) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let channel = supabase.channel(`transferencias_saldos_${instanceId}`);
    poloIds.forEach((poloId) => {
      channel = channel.on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'finance_realtime_events',
        filter: `polo_id=eq.${poloId}`,
      }, () => {
        clearTimeout(timers.get(poloId));
        timers.set(poloId, setTimeout(() => {
          timers.delete(poloId);
          void queryClient.invalidateQueries({ queryKey: transferenciaAccountsKey(poloId), exact: true });
        }, 500));
      });
    });
    channel.subscribe();
    return () => {
      timers.forEach(clearTimeout);
      void supabase.removeChannel(channel);
    };
  }, [enabled, instanceId, poloDestinoId, poloOrigemId, queryClient]);

  return { originAccountsQuery, destinationAccountsQuery };
}
