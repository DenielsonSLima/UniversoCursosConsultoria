import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nfseStudentKeys } from '../queries/nfse-students.keys';
import { isNfseReceiptScopeValid } from '../services/nfse-students.contract';
import type { NfseReceiptScope } from '../types/nfse-students.types';

export function useNfseReceiptRealtime(scope: NfseReceiptScope | null, enabled: boolean) {
  const client = useQueryClient();
  const contextId = scope?.contextId;
  const poloId = scope?.poloId;
  const environment = scope?.environment;
  const paymentMonth = scope?.paymentMonth;
  useEffect(() => {
    const captured = contextId && poloId && paymentMonth ? { contextId, poloId, environment, paymentMonth } : null;
    if (!enabled || !isNfseReceiptScopeValid(captured)) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed) void client.invalidateQueries({ queryKey: nfseStudentKeys.scope(captured) });
      }, 300);
    };
    void import('../../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      let subscribed = false;
      const channel = supabase.channel(`nfse-receipts:${poloId}:${crypto.randomUUID()}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'finance_realtime_events', filter: `polo_id=eq.${poloId}`,
        }, invalidate)
        .subscribe(status => {
          if (status !== 'SUBSCRIBED') return;
          if (subscribed) invalidate();
          subscribed = true;
        });
      cleanup = () => { void supabase.removeChannel(channel); };
    }).catch(() => { /* Queries recover on focus/reconnect; no polling. */ });
    return () => { disposed = true; if (timer) clearTimeout(timer); cleanup?.(); };
  }, [client, enabled, contextId, poloId, environment, paymentMonth]);
}
