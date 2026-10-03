import type { RenegociacaoCandidateFilters, RenegociacaoLifecycleStatus } from './renegociacoes.types';

const scope = (poloId?: string | null) => poloId || 'todos';

export const renegociacoesQueryKeys = {
  all: ['financeiro', 'renegociacoes'] as const,
  readiness: (poloId?: string | null) => ['financeiro', 'renegociacoes', 'readiness', scope(poloId)] as const,
  candidatesRoot: (poloId?: string | null) => ['financeiro', 'renegociacoes', 'candidates', scope(poloId)] as const,
  candidates: (poloId: string | null | undefined, search: string, page: number, filters?: RenegociacaoCandidateFilters) =>
    ['financeiro', 'renegociacoes', 'candidates', scope(poloId), 'v2', search, page,
      filters?.courseType || '', filters?.turmaId || ''] as const,
  candidateItems: (matriculaId: string, asOf?: string | null) =>
    ['financeiro', 'renegociacoes', 'candidate-items', matriculaId, asOf || 'hoje'] as const,
  proposalsRoot: (poloId?: string | null) => ['financeiro', 'renegociacoes', 'proposals', scope(poloId)] as const,
  proposals: (poloId: string | null | undefined, status: RenegociacaoLifecycleStatus, search: string, page: number) =>
    ['financeiro', 'renegociacoes', 'proposals', scope(poloId), status, search, page] as const,
  detail: (agreementId: string) => ['financeiro', 'renegociacoes', 'detail', agreementId] as const,
};
