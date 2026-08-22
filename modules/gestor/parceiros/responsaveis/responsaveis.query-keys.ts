import type { ResponsaveisLegaisScope } from './responsaveis.contract';

export const createResponsaveisLegaisScope = (
  poloId: string | null | undefined,
  includeGlobal: boolean | undefined,
): ResponsaveisLegaisScope | null => {
  const normalizedPoloId = poloId?.trim() || '';
  if (!normalizedPoloId || normalizedPoloId === 'todos') return null;
  return { poloId: normalizedPoloId, includeGlobal: includeGlobal === true };
};

const poloRoot = (poloId: string) => [
  'parceiros',
  'responsaveis-legais',
  'polo',
  poloId,
] as const;

const scopedRoot = (scope: ResponsaveisLegaisScope) => [
  ...poloRoot(scope.poloId),
  'include-global',
  scope.includeGlobal,
] as const;

const scopedLists = (scope: ResponsaveisLegaisScope) => [
  ...scopedRoot(scope),
  'list',
] as const;

export const responsaveisLegaisQueryKeys = {
  root: ['parceiros', 'responsaveis-legais'] as const,
  polo: poloRoot,
  scope: scopedRoot,
  lists: scopedLists,
  list: (scope: ResponsaveisLegaisScope, busca: string, status: string) => [
    ...scopedLists(scope),
    busca.trim(),
    status,
  ] as const,
  detail: (scope: ResponsaveisLegaisScope, id: string) => [
    ...scopedRoot(scope),
    'detail',
    id,
  ] as const,
  alunosParaVinculo: (scope: ResponsaveisLegaisScope) => [
    ...scopedRoot(scope),
    'alunos-para-vinculo',
  ] as const,
  access: (scope: ResponsaveisLegaisScope, id: string) => [
    ...scopedRoot(scope),
    'access',
    id,
  ] as const,
};
