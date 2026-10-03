import { supabase } from '../../../../lib/supabase';
import type { RenegociacaoIdentity } from './renegociacoes.types';
import { canonicalSelectionIds, parseSelectionSummary } from './renegociacoes.selection-summary';
import { withRenegociacaoReadDeadline } from './renegociacoes.read-request';

export const getRenegociacaoSelectionSummary = async (
  identity: RenegociacaoIdentity,
  ids: readonly string[],
  asOf: string | null | undefined,
  signal?: AbortSignal,
) => {
  const selectedIds = canonicalSelectionIds(ids);
  const request = supabase.rpc('summarize_receivable_renegotiation_selection_secure', {
    p_receivable_ids: selectedIds,
    p_as_of: asOf || null,
  });
  const { data, error } = await withRenegociacaoReadDeadline(request, signal);
  if (error) throw error;
  return parseSelectionSummary(data, identity, selectedIds, asOf);
};
