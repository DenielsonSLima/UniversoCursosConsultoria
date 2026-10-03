import { supabase } from '../../../lib/supabase.ts';
import type { CaixaComposicaoMensalPayload } from './caixa-composicao.types.ts';
import { assertCaixaComposicaoMensalPayload } from './caixa-composicao.validation.ts';

const COMPETENCIA_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CaixaComposicaoClientContractError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CaixaComposicaoClientContractError';
  }
}

export const normalizeCaixaComposicaoPoloId = (
  poloId: string | null | undefined,
): string | null => (poloId && poloId !== 'todos' ? poloId : null);

const assertRequest = (poloId: string | null | undefined, competencia: string) => {
  const normalizedPoloId = normalizeCaixaComposicaoPoloId(poloId);
  if (normalizedPoloId !== null && !UUID_PATTERN.test(normalizedPoloId)) {
    throw new CaixaComposicaoClientContractError(
      'Polo inválido para a composição mensal do Caixa.',
    );
  }
  if (!COMPETENCIA_PATTERN.test(competencia)) {
    throw new CaixaComposicaoClientContractError(
      'Competência inválida para a composição mensal do Caixa.',
    );
  }
  return normalizedPoloId;
};

export const assertCaixaComposicaoMatchesRequest = (
  payload: CaixaComposicaoMensalPayload,
  poloId: string | null,
  competencia: string,
) => {
  const expectedScope = poloId === null ? 'GLOBAL' : 'POLO';
  if (
    payload.competencia !== competencia
    || payload.periodo_inicio !== competencia
    || payload.escopo_tipo !== expectedScope
    || payload.polo_id !== poloId
  ) {
    throw new CaixaComposicaoClientContractError(
      'A composição mensal do Caixa retornou escopo ou competência diferente do solicitado.',
    );
  }
};

export const getCaixaComposicaoMensal = async (
  poloId: string | null | undefined,
  competencia: string,
  signal?: AbortSignal,
): Promise<CaixaComposicaoMensalPayload> => {
  const normalizedPoloId = assertRequest(poloId, competencia);
  const read = (name: string) => {
    const request = supabase.rpc(name, {
      p_polo_id: normalizedPoloId,
      p_competencia: competencia,
    });
    if (signal) request.abortSignal(signal);
    return request;
  };
  let { data, error } = await read('get_caixa_composicao_mensal_v2_secure');
  // Deployment compatibility only: never mask authorization, transport or
  // contract errors. Both versions retain their original secure RPC guards.
  if (error?.code === 'PGRST202'
    && error.message.includes('public.get_caixa_composicao_mensal_v2_secure')
    && !signal?.aborted) {
    ({ data, error } = await read('get_caixa_composicao_mensal_secure'));
  }

  if (error) throw error;

  try {
    assertCaixaComposicaoMensalPayload(data);
  } catch (contractError) {
    throw new CaixaComposicaoClientContractError(
      'Contrato físico inválido retornado pela composição mensal do Caixa.',
      { cause: contractError },
    );
  }
  assertCaixaComposicaoMatchesRequest(data, normalizedPoloId, competencia);
  return data;
};
