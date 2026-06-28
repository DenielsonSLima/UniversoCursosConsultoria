import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_PRAZOS,
  PrazoConfig,
  Solicitacao,
} from '../../gestor/secretaria/secretaria.service';
import {
  buildAlunoSecretariaEligibility,
} from './secretaria-aluno.rules';
import {
  alunoSecretariaKeys,
  alunoSecretariaService,
} from './secretaria-aluno.service';
import {
  AlunoSecretariaEligibility,
  AlunoSecretariaMatricula,
} from './secretaria-aluno.types';
import { useAlunoSecretariaRealtime } from './useAlunoSecretariaRealtime';

export const useAlunoSecretariaData = (alunoId: string) => {
  const queryClient = useQueryClient();
  useAlunoSecretariaRealtime(alunoId, queryClient);

  const alunoQuery = useQuery({
    queryKey: alunoSecretariaKeys.profile(alunoId),
    queryFn: () => alunoSecretariaService.getProfile(alunoId),
    enabled: !!alunoId,
    staleTime: 60_000,
  });

  const matriculasQuery = useQuery<AlunoSecretariaMatricula[]>({
    queryKey: alunoSecretariaKeys.matriculas(alunoId),
    queryFn: () => alunoSecretariaService.getMatriculas(alunoId),
    enabled: !!alunoId,
    staleTime: 30_000,
  });

  const solicitacoesQuery = useQuery<Solicitacao[]>({
    queryKey: alunoSecretariaKeys.solicitacoes(alunoId),
    queryFn: () => alunoSecretariaService.getSolicitacoes(alunoId),
    enabled: !!alunoId,
    staleTime: 30_000,
  });

  const prazosQuery = useQuery<Record<string, PrazoConfig>>({
    queryKey: alunoSecretariaKeys.prazos(),
    queryFn: alunoSecretariaService.getPrazos,
    staleTime: 5 * 60_000,
    placeholderData: DEFAULT_PRAZOS,
  });

  const matriculas = matriculasQuery.data || [];
  const eligibility: AlunoSecretariaEligibility = useMemo(
    () => buildAlunoSecretariaEligibility(matriculas),
    [matriculas]
  );

  return {
    aluno: alunoQuery.data || null,
    matriculas,
    solicitacoes: solicitacoesQuery.data || [],
    prazos: prazosQuery.data || DEFAULT_PRAZOS,
    eligibility,
    isLoading: alunoQuery.isLoading || matriculasQuery.isLoading,
    isError: alunoQuery.isError || matriculasQuery.isError,
    error: alunoQuery.error || matriculasQuery.error,
  };
};
