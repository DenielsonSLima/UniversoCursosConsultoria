import { supabase } from '../../../../lib/supabase.ts';
import { assertCaixaWorkspaceV2Payload } from './caixa-workspace.contracts.ts';
import type { CaixaWorkspacePayload } from './caixa-workspace.types.ts';
import { UUID_PATTERN } from './caixa-workspace.validation.ts';

const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export interface CaixaWorkspaceV2Request {
  empresaId: string;
  poloId?: string | null;
  competencia: string;
  mesesHistorico: number;
}

export class CaixaWorkspaceV2ClientContractError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CaixaWorkspaceV2ClientContractError';
  }
}

export const normalizeCaixaWorkspacePoloId = (
  poloId: string | null | undefined,
): string | null => (poloId && poloId !== 'todos' ? poloId : null);

const assertRequest = ({
  empresaId,
  poloId,
  competencia,
  mesesHistorico,
}: CaixaWorkspaceV2Request) => {
  if (!UUID_PATTERN.test(empresaId)) {
    throw new CaixaWorkspaceV2ClientContractError('Empresa inválida para o Caixa Workspace v2.');
  }
  const normalizedPoloId = normalizeCaixaWorkspacePoloId(poloId);
  if (normalizedPoloId !== null && !UUID_PATTERN.test(normalizedPoloId)) {
    throw new CaixaWorkspaceV2ClientContractError('Polo inválido para o Caixa Workspace v2.');
  }
  if (!COMPETENCE_PATTERN.test(competencia)) {
    throw new CaixaWorkspaceV2ClientContractError(
      'Competência inválida para o Caixa Workspace v2.',
    );
  }
  if (!Number.isSafeInteger(mesesHistorico) || mesesHistorico < 1 || mesesHistorico > 12) {
    throw new CaixaWorkspaceV2ClientContractError(
      'Faixa de histórico inválida para o Caixa Workspace v2.',
    );
  }
  return normalizedPoloId;
};

export const assertCaixaWorkspaceV2ResponseMatchesRequest = (
  payload: CaixaWorkspacePayload,
  request: CaixaWorkspaceV2Request,
) => {
  const normalizedPoloId = normalizeCaixaWorkspacePoloId(request.poloId);
  const expectedScope = normalizedPoloId === null ? 'GLOBAL' : 'POLO';
  if (
    payload.meta.empresa_id !== request.empresaId
    || payload.meta.escopo_tipo !== expectedScope
    || payload.meta.polo_id !== normalizedPoloId
    || payload.meta.competencia !== request.competencia
    || payload.meta.meses_historico !== request.mesesHistorico
  ) {
    throw new CaixaWorkspaceV2ClientContractError(
      'O Caixa Workspace v2 retornou empresa, escopo, competência ou histórico diferente do solicitado.',
    );
  }
};

export const getCaixaWorkspaceV2 = async (
  request: CaixaWorkspaceV2Request,
  signal?: AbortSignal,
): Promise<CaixaWorkspacePayload> => {
  const normalizedPoloId = assertRequest(request);
  const rpcRequest = supabase.rpc('get_caixa_workspace_v2_secure', {
    p_company_id: request.empresaId,
    p_polo_id: normalizedPoloId,
    p_competencia: request.competencia,
    p_meses_historico: request.mesesHistorico,
  });
  if (signal) rpcRequest.abortSignal(signal);
  const { data, error } = await rpcRequest;

  if (error) throw error;

  try {
    assertCaixaWorkspaceV2Payload(data);
  } catch (contractError) {
    throw new CaixaWorkspaceV2ClientContractError(
      'Contrato físico inválido retornado pelo Caixa Workspace v2.',
      { cause: contractError },
    );
  }
  assertCaixaWorkspaceV2ResponseMatchesRequest(data, request);
  return data;
};
