import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { renegociacoesQueryKeys } from '../renegociacoes.queryKeys';
import { renegociacoesService } from '../renegociacoes.service';
import type {
  DiscardRenegociacaoProposalInput,
  PreviewRenegociacaoInput,
  RenegociacaoCandidateFilters,
  RenegociacaoLifecycleStatus,
  SaveRenegociacaoProposalInput,
} from '../renegociacoes.types';

const refreshOnReturn = { refetchOnWindowFocus: true, refetchOnReconnect: true } as const;

export const useRenegociacaoReadiness = (poloId?: string | null) =>
  useQuery({
    queryKey: renegociacoesQueryKeys.readiness(poloId),
    queryFn: ({ signal }) => renegociacoesService.readiness(poloId, signal),
    staleTime: 30_000,
    ...refreshOnReturn,
  });

export const useRenegociacaoCandidates = (
  poloId: string | null | undefined,
  search: string,
  page: number,
  enabled: boolean,
  filters?: RenegociacaoCandidateFilters,
) =>
  useQuery({
    queryKey: renegociacoesQueryKeys.candidates(poloId, search, page, filters),
    queryFn: ({ signal }) => renegociacoesService.listCandidates(poloId, search, page, signal, filters),
    enabled,
    retry: false,
    staleTime: 10_000,
    ...refreshOnReturn,
  });

export const useRenegociacaoCandidateItems = (matriculaId?: string | null, asOf?: string | null) =>
  useQuery({
    queryKey: renegociacoesQueryKeys.candidateItems(matriculaId || 'sem-matricula', asOf),
    queryFn: ({ signal }) => renegociacoesService.listCandidateItems(matriculaId!, asOf, signal),
    enabled: Boolean(matriculaId),
    retry: false,
    staleTime: 5_000,
    ...refreshOnReturn,
  });

export const useRenegociacaoProposals = (
  poloId: string | null | undefined,
  status: RenegociacaoLifecycleStatus,
  search: string,
  page: number,
  enabled: boolean,
) =>
  useQuery({
    queryKey: renegociacoesQueryKeys.proposals(poloId, status, search, page),
    queryFn: ({ signal }) => renegociacoesService.listProposals(poloId, status, search, page, signal),
    enabled,
    staleTime: 10_000,
    ...refreshOnReturn,
  });

export const useRenegociacaoProposal = (agreementId?: string | null) =>
  useQuery({
    queryKey: renegociacoesQueryKeys.detail(agreementId || 'sem-acordo'),
    queryFn: ({ signal }) => renegociacoesService.getProposal(agreementId!, signal),
    enabled: Boolean(agreementId),
    staleTime: 5_000,
    ...refreshOnReturn,
  });

export const useRenegociacaoMutations = (poloId?: string | null) => {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: renegociacoesQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
    ]);
  };
  return {
    preview: useMutation({ mutationFn: (input: PreviewRenegociacaoInput) => renegociacoesService.preview(input) }),
    save: useMutation({
      mutationFn: (input: SaveRenegociacaoProposalInput) => renegociacoesService.save(input),
      onSuccess: invalidate,
    }),
    discard: useMutation({
      mutationFn: (input: DiscardRenegociacaoProposalInput) => renegociacoesService.discard(input),
      onSuccess: invalidate,
    }),
    invalidate,
    poloId,
  };
};
