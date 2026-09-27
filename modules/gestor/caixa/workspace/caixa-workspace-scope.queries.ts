import { queryOptions } from '@tanstack/react-query';
import { resolveCaixaWorkspaceScope } from './caixa-workspace-scope.service.ts';

export const caixaWorkspaceScopeQueryOptions = (poloId: string) => queryOptions({
  queryKey: ['caixa', 'workspace', 'v2', 'scope', poloId] as const,
  queryFn: () => resolveCaixaWorkspaceScope(poloId),
  staleTime: 5 * 60 * 1000,
});
