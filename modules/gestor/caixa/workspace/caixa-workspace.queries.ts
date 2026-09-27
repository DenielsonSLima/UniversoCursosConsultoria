import { isCancelledError, queryOptions } from '@tanstack/react-query';
import {
  CaixaWorkspaceV2ClientContractError,
  getCaixaWorkspaceV2,
  normalizeCaixaWorkspacePoloId,
} from './caixa-workspace.service.ts';
import type { CaixaWorkspaceV2Request } from './caixa-workspace.service.ts';

const NON_RETRYABLE_CODES = new Set([
  '22023',
  '42501',
  '57014',
  '28000',
  '28P01',
  'ABORT_ERR',
  'PGRST301',
  'PGRST302',
]);

const readErrorProperty = (error: unknown, property: string): unknown => (
  error && typeof error === 'object' && property in error
    ? (error as Record<string, unknown>)[property]
    : undefined
);

export const retryCaixaWorkspaceV2Read = (failureCount: number, error: unknown): boolean => {
  const code = readErrorProperty(error, 'code');
  const status = readErrorProperty(error, 'status') ?? readErrorProperty(error, 'statusCode');
  const name = readErrorProperty(error, 'name');
  if (
    failureCount >= 1
    || error instanceof CaixaWorkspaceV2ClientContractError
    || isCancelledError(error)
    || (typeof code === 'string' && NON_RETRYABLE_CODES.has(code))
    || status === 401
    || status === 403
    || name === 'AbortError'
    || (typeof name === 'string' && name.toLowerCase().includes('auth'))
  ) return false;
  return true;
};

const scopeKey = (poloId: string | null | undefined) => {
  const normalizedPoloId = normalizeCaixaWorkspacePoloId(poloId);
  return normalizedPoloId === null
    ? ['GLOBAL', null] as const
    : ['POLO', normalizedPoloId] as const;
};

export const caixaWorkspaceV2QueryKeys = {
  root: ['caixa', 'workspace', 'v2'] as const,
  forCompany: (empresaId: string) => [
    ...caixaWorkspaceV2QueryKeys.root,
    'empresa',
    empresaId,
  ] as const,
  forScope: (empresaId: string, poloId?: string | null) => [
    ...caixaWorkspaceV2QueryKeys.forCompany(empresaId),
    'escopo',
    ...scopeKey(poloId),
  ] as const,
  detail: ({
    empresaId,
    poloId,
    competencia,
    mesesHistorico,
  }: CaixaWorkspaceV2Request) => [
    ...caixaWorkspaceV2QueryKeys.forScope(empresaId, poloId),
    'competencia',
    competencia,
    'meses_historico',
    mesesHistorico,
  ] as const,
};

export const caixaWorkspaceV2QueryOptions = (request: CaixaWorkspaceV2Request) => queryOptions({
  queryKey: caixaWorkspaceV2QueryKeys.detail(request),
  queryFn: ({ signal }) => getCaixaWorkspaceV2(request, signal),
  retry: retryCaixaWorkspaceV2Read,
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});
