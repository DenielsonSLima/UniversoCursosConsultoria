import { supabase } from '../../../../lib/supabase';
import { CaixaWorkspaceV2ClientContractError, normalizeCaixaWorkspacePoloId } from './caixa-workspace.service';
import type {
  CaixaWorkspacePayablesPayload,
  CaixaWorkspacePayablesRequest,
} from './caixa-workspace-payables.types';
import { assertCaixaWorkspacePayablesPayload } from './caixa-workspace-payables.validation';
import { UUID_PATTERN } from './caixa-workspace.validation';

const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const SNAPSHOT_PATTERN = /^caixa-v2-drilldown-[0-9a-f]{32}$/;

const assertRequest = (request: CaixaWorkspacePayablesRequest) => {
  const poloId = normalizeCaixaWorkspacePoloId(request.poloId);
  if (
    !UUID_PATTERN.test(request.empresaId)
    || (poloId !== null && !UUID_PATTERN.test(poloId))
    || !COMPETENCE_PATTERN.test(request.competencia)
    || !Number.isSafeInteger(request.pagina)
    || request.pagina < 1
    || !Number.isSafeInteger(request.tamanhoPagina)
    || request.tamanhoPagina < 1
    || request.tamanhoPagina > 100
    || (request.snapshotId != null && !SNAPSHOT_PATTERN.test(request.snapshotId))
  ) throw new CaixaWorkspaceV2ClientContractError('Pedido inválido do drill-down do Caixa.');
  return poloId;
};

export const assertCaixaWorkspacePayablesResponseMatchesRequest = (
  payload: CaixaWorkspacePayablesPayload,
  request: CaixaWorkspacePayablesRequest,
) => {
  const poloId = normalizeCaixaWorkspacePoloId(request.poloId);
  if (
    payload.meta.empresa_id !== request.empresaId
    || payload.meta.polo_id !== poloId
    || payload.meta.escopo_tipo !== (poloId === null ? 'GLOBAL' : 'POLO')
    || payload.meta.competencia !== request.competencia
    || payload.filtro !== request.filtro
    || payload.paginacao.pagina !== request.pagina
    || payload.paginacao.tamanho_pagina !== request.tamanhoPagina
    || (request.snapshotId != null && payload.meta.snapshot_id !== request.snapshotId)
  ) throw new CaixaWorkspaceV2ClientContractError(
    'O drill-down do Caixa retornou um contexto diferente do solicitado.',
  );
};

export const getCaixaWorkspacePayables = async (
  request: CaixaWorkspacePayablesRequest,
  signal?: AbortSignal,
): Promise<CaixaWorkspacePayablesPayload> => {
  const poloId = assertRequest(request);
  const rpcRequest = supabase.rpc('list_caixa_workspace_v2_contas_pagar_secure', {
    p_company_id: request.empresaId,
    p_polo_id: poloId,
    p_competencia: request.competencia,
    p_filtro: request.filtro,
    p_pagina: request.pagina,
    p_tamanho_pagina: request.tamanhoPagina,
    p_snapshot_id: request.snapshotId ?? null,
  });
  if (signal) rpcRequest.abortSignal(signal);
  const { data, error } = await rpcRequest;
  if (error) throw error;

  try {
    assertCaixaWorkspacePayablesPayload(data);
  } catch (contractError) {
    throw new CaixaWorkspaceV2ClientContractError(
      'Contrato físico inválido retornado pelo drill-down do Caixa.',
      { cause: contractError },
    );
  }
  assertCaixaWorkspacePayablesResponseMatchesRequest(data, request);
  return data;
};
