import { supabase } from '../../../../lib/supabase';
import type { GatewayOverview } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import {
  buildBaneseApiHealthEvidence,
  type BaneseApiHealthEvidence,
} from './banese-api-health';

export { buildBaneseApiHealthEvidence } from './banese-api-health';
export type {
  BaneseApiHealthEvidence,
  BaneseReconciliationAuditRow,
  BaneseReconciliationEvidence,
} from './banese-api-health';

export const fetchBaneseApiHealthEvidence = async (
  overview: GatewayOverview,
): Promise<BaneseApiHealthEvidence> => {
  const { data, error } = await supabase
    .from('contas_receber')
    .select('gateway_synced_at, updated_at, gateway_last_error')
    .eq('gateway_provider', 'banese_card')
    .eq('gateway_environment', overview.activeEnvironment)
    .eq('gateway_payment_method', 'BOLETO')
    .not('gateway_synced_at', 'is', null)
    .order('gateway_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return buildBaneseApiHealthEvidence(overview, data ? {
    attemptedAt: data.gateway_synced_at,
    persistedAt: data.updated_at,
    lastError: data.gateway_last_error,
  } : null);
};
