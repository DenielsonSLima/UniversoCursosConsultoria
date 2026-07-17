import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { caixaQueryKeys, PRINCIPAL_POLO_ID } from './caixa.service';

const DEBOUNCE_MS = 500;

export const useCaixaRealtime = (poloId?: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!poloId) return;

    const activePoloId = poloId === 'todos' ? null : poloId;
    const canUseServerPoloFilter = Boolean(activePoloId && activePoloId !== PRINCIPAL_POLO_ID);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.dashboard(poloId),
          exact: true,
          refetchType: 'active',
        });
      }, DEBOUNCE_MS);
    };

    const scopedChange = (payload: any) => {
      if (!activePoloId || canUseServerPoloFilter) {
        refresh();
        return;
      }

      const next = Object.keys(payload.new || {}).length > 0 ? payload.new : null;
      const previous = Object.keys(payload.old || {}).length > 0 ? payload.old : null;
      const belongsToPrincipal = (row: any) => row && (row.polo_id === activePoloId || !row.polo_id);
      if (belongsToPrincipal(next) || belongsToPrincipal(previous) || payload.eventType === 'DELETE') {
        refresh();
      }
    };

    const channelName = `caixa-realtime-${activePoloId || 'todos'}`;
    let channel = supabase.channel(channelName);
    const addScopedTable = (table: 'contas_receber' | 'contas_pagar' | 'contas_bancarias') => {
      if (!canUseServerPoloFilter) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, scopedChange);
        return;
      }

      const filter = `polo_id=eq.${activePoloId}`;
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, scopedChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, scopedChange)
        // DELETE pode trazer apenas a chave primária; mantém fallback sem filtro.
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, scopedChange);
    };

    addScopedTable('contas_receber');
    addScopedTable('contas_pagar');
    addScopedTable('contas_bancarias');
    channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias_contas' }, refresh)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
};
