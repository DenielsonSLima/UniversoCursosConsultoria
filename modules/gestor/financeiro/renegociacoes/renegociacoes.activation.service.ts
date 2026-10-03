import { supabase } from '../../../../lib/supabase';
import { withRenegociacaoReadDeadline } from './renegociacoes.read-request';
import { parseActivationOperation, parseActivationResult, type ActivateRenegociacaoInput } from './renegociacoes.activation';

export const renegociacaoActivationService = {
  async get(agreementId: string, signal?: AbortSignal) {
    const request = supabase.rpc('get_receivable_renegotiation_activation_secure', { p_agreement_id: agreementId });
    const { data, error } = await withRenegociacaoReadDeadline(request, signal);
    if (error) throw error;
    return parseActivationOperation(data, agreementId);
  },
  async activate(input: ActivateRenegociacaoInput) {
    const { data, error } = await supabase.functions.invoke('receivable-renegotiation-activate', { body: input });
    if (error) {
      const response = error.context;
      // A revisão pode vir como HTTP 409. Erros de transporte não provam falha nem sucesso bancário.
      if (response instanceof Response && response.status === 409) {
        const payload: unknown = await response.clone().json();
        return parseActivationResult(payload, input);
      }
      throw error;
    }
    return parseActivationResult(data, input);
  },
};
