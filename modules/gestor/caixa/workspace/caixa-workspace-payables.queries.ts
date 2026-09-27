import { queryOptions } from '@tanstack/react-query';
import { caixaWorkspaceV2QueryKeys, retryCaixaWorkspaceV2Read } from './caixa-workspace.queries';
import { normalizeCaixaWorkspacePoloId } from './caixa-workspace.service';
import type { CaixaWorkspacePayablesRequest } from './caixa-workspace-payables.types';
import { getCaixaWorkspacePayables } from './caixa-workspace-payables.service';

export const caixaWorkspacePayablesQueryKeys = {
  root: (empresaId: string, poloId?: string | null) => [
    ...caixaWorkspaceV2QueryKeys.forScope(empresaId, normalizeCaixaWorkspacePoloId(poloId)),
    'contas-pagar-drilldown',
  ] as const,
  detail: (request: CaixaWorkspacePayablesRequest) => [
    ...caixaWorkspacePayablesQueryKeys.root(request.empresaId, request.poloId),
    request.competencia,
    request.filtro,
    request.pagina,
    request.tamanhoPagina,
    'snapshot',
    request.snapshotId ?? null,
  ] as const,
};

export const retryCaixaWorkspacePayablesRead = (
  failureCount: number,
  error: unknown,
) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === '40001') {
    return false;
  }
  return retryCaixaWorkspaceV2Read(failureCount, error);
};

export const caixaWorkspacePayablesQueryOptions = (
  request: CaixaWorkspacePayablesRequest,
) => queryOptions({
  queryKey: caixaWorkspacePayablesQueryKeys.detail(request),
  queryFn: ({ signal }) => getCaixaWorkspacePayables(request, signal),
  retry: retryCaixaWorkspacePayablesRead,
  staleTime: 30_000,
  gcTime: 15 * 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});
