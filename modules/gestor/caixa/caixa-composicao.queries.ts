import { isCancelledError, queryOptions } from '@tanstack/react-query';
import {
  CaixaComposicaoClientContractError,
  getCaixaComposicaoMensal,
  normalizeCaixaComposicaoPoloId,
} from './caixa-composicao.service.ts';

const NON_RETRYABLE_CODES = new Set([
  '22023',
  '42501',
  '57014',
  '28000',
  '28P01',
  'ABORT_ERR',
  'PGRST301',
  'PGRST302',
  'P0001',
]);

const errorProperty = (error: unknown, property: string): unknown => (
  error && typeof error === 'object' && property in error
    ? (error as Record<string, unknown>)[property]
    : undefined
);

export const retryCaixaComposicaoRead = (failureCount: number, error: unknown): boolean => {
  const code = errorProperty(error, 'code');
  const status = errorProperty(error, 'status') ?? errorProperty(error, 'statusCode');
  const name = errorProperty(error, 'name');
  if (
    failureCount >= 1
    || error instanceof CaixaComposicaoClientContractError
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
  const normalizedPoloId = normalizeCaixaComposicaoPoloId(poloId);
  return normalizedPoloId === null
    ? ['GLOBAL', null] as const
    : ['POLO', normalizedPoloId] as const;
};

export const caixaComposicaoQueryKeys = {
  root: ['caixa', 'composicao-mensal', 'v1'] as const,
  forScope: (poloId?: string | null) => [
    ...caixaComposicaoQueryKeys.root,
    'escopo',
    ...scopeKey(poloId),
  ] as const,
  detail: (poloId: string | null | undefined, competencia: string) => [
    ...caixaComposicaoQueryKeys.forScope(poloId),
    'competencia',
    competencia,
  ] as const,
};

export const caixaComposicaoQueryOptions = (
  poloId: string | null | undefined,
  competencia: string,
) => queryOptions({
  queryKey: caixaComposicaoQueryKeys.detail(poloId, competencia),
  queryFn: ({ signal }) => getCaixaComposicaoMensal(poloId, competencia, signal),
  retry: retryCaixaComposicaoRead,
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});
