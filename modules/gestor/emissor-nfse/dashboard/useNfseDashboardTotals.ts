import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeNfseChanges } from '../realtime/nfse-subscription';
import { nfseSummaryCacheOptions } from '../queries/nfse-summary-cache';
import { mapNfseTransportError } from '../services/nfse.errors';
import { NFSE_BACKEND_ENABLED } from '../services/nfse.runtime';
import type { NfseScope } from '../types/nfse.types';
import { parseNfseDashboardTotals } from './nfse-dashboard-totals';

export function useNfseDashboardTotals(scope: NfseScope | null) {
  const client = useQueryClient();
  const [contextKey, poloId, environment, month] = [scope?.contextKey, scope?.poloId, scope?.environment, scope?.month];
  const key = useMemo(() => ['nfse-issued-dashboard', 'v1', contextKey, poloId, environment, month] as const,
    [contextKey, poloId, environment, month]);
  const enabled = NFSE_BACKEND_ENABLED && Boolean(scope);
  const query = useQuery({
    ...nfseSummaryCacheOptions, enabled, queryKey: key,
    queryFn: async ({ signal }) => {
      if (!scope) throw new Error('Escopo fiscal indisponível.');
      const { supabase } = await import('../../../../lib/supabase');
      const { data, error } = await supabase.rpc('get_nfse_issued_dashboard_totals_secure', {
        p_context_key: scope.contextKey, p_polo_id: scope.poloId,
        p_environment: scope.environment, p_month: scope.month,
      }).abortSignal(signal);
      if (error) throw mapNfseTransportError(error);
      return parseNfseDashboardTotals(data, scope);
    },
  });

  useEffect(() => {
    if (!enabled || !environment || !poloId) return;
    let disposed = false;
    let close: (() => void) | undefined;
    void import('../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      close = subscribeNfseChanges(supabase, client, `nfse-dashboard:${poloId}:${crypto.randomUUID()}`,
        [{ table: 'nfse_queue_change_events', filter: `environment=eq.${environment}`, targets: payload => {
          const row = payload && typeof payload === 'object' && 'new' in payload ? payload.new : null;
          if (!row || typeof row !== 'object' || !('polo_id' in row) || !('version' in row) || row.version !== 1
            || !('environment' in row) || row.environment !== environment) return [];
          const current = client.getQueryData<ReturnType<typeof parseNfseDashboardTotals>>(key);
          // Queue month is a source month, not necessarily the fiscal emission month.
          return current?.byPolo.some(unit => unit.poloId === row.polo_id) ? [key] : [];
        } }], [key]);
    }).catch(() => { /* Focus and reconnect also refresh the projection. */ });
    return () => { disposed = true; close?.(); };
  }, [client, enabled, environment, key, poloId]);

  return query;
}
