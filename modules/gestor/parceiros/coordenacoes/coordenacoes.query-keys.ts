import type { CoordenacoesScope } from './coordenacoes.contract';

export const createCoordenacoesScope = (
  poloId: string | null | undefined,
  includeGlobal: boolean | undefined,
): CoordenacoesScope | null => {
  const normalizedPoloId = poloId?.trim() || '';
  if (!normalizedPoloId || normalizedPoloId === 'todos') return null;
  return { poloId: normalizedPoloId, includeGlobal: includeGlobal === true };
};

const poloRoot = (poloId: string) => [
  'parceiros',
  'coordenacoes',
  'polo',
  poloId,
] as const;

const scopedRoot = (scope: CoordenacoesScope) => [
  ...poloRoot(scope.poloId),
  'include-global',
  scope.includeGlobal,
] as const;

const scopedLists = (scope: CoordenacoesScope) => [
  ...scopedRoot(scope),
  'list',
] as const;

export const coordenacoesQueryKeys = {
  root: ['parceiros', 'coordenacoes'] as const,
  polo: poloRoot,
  scope: scopedRoot,
  lists: scopedLists,
  list: (scope: CoordenacoesScope, busca: string, status: string) => [
    ...scopedLists(scope),
    busca.trim(),
    status,
  ] as const,
  opcoes: (scope: CoordenacoesScope) => [
    ...scopedRoot(scope),
    'opcoes',
  ] as const,
};
