import { supabase } from '../../../../lib/supabase';
import type { OtherCreditPlan, OtherCreditPlanInput, OtherCreditPlanPreview } from './other-credit-plan.types';
import { OtherCreditPlanRpcError } from './other-credit-plan-error';

async function rpc<T>(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const request = supabase.rpc(name, args);
  const { data, error, status } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw new OtherCreditPlanRpcError(error.message || 'Não foi possível consultar o carnê.', error.code, status);
  if (!data) throw new Error('O servidor não retornou os dados do carnê.');
  return data as T;
}

export const otherCreditPlanService = {
  preview: (poloId: string, input: OtherCreditPlanInput) => rpc<OtherCreditPlanPreview>(
    'preview_outros_creditos_plano_secure', { p_polo_id: poloId, p_input: input },
  ),
  create: (requestId: string, poloId: string, input: OtherCreditPlanInput) => rpc<OtherCreditPlan>(
    'criar_outros_creditos_plano_secure', { p_request_id: requestId, p_polo_id: poloId, p_input: input },
  ),
  get: (id: string, signal?: AbortSignal) => rpc<OtherCreditPlan>(
    'obter_outros_creditos_plano_secure', { p_plano_id: id }, signal,
  ),
  async document(planId: string): Promise<Blob> {
    const { data, error } = await supabase.functions.invoke<Blob>('other-credit-carnet-document', { body: { planId } });
    if (error) {
      const context = (error as { context?: Response }).context;
      const body = context instanceof Response ? await context.json().catch(() => null) : null;
      throw new Error(body?.error || 'Não foi possível baixar o carnê. Confira se todos os boletos foram emitidos.');
    }
    if (!(data instanceof Blob) || !data.type.toLowerCase().startsWith('application/pdf')) {
      throw new Error('O servidor não retornou um carnê PDF válido.');
    }
    return data;
  },
};
