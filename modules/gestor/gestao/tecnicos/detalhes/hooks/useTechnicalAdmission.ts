import { useQuery } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { technicalAdmissionService } from '../technical-admission.service';
import { technicalAdmissionUiState } from '../../../../../shared/utils/technicalAdmissionPolicy';

export const useTechnicalAdmission = (turmaId: string, required: boolean, phaseAllowed = true) => {
  const query = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turmaId), 'ingresso-direto'],
    queryFn: () => technicalAdmissionService.getPolicy(turmaId),
    enabled: required && Boolean(turmaId),
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  });
  const requireAllowed = async () => {
    if (!phaseAllowed) throw new Error('A fase atual da turma não permite novas matrículas.');
    if (!required) return;
    const result = await query.refetch({ throwOnError: true });
    if (!result.data?.matriculaDiretaPermitida) {
      throw new Error(result.data?.mensagem || 'A política de ingresso não foi confirmada.');
    }
  };
  return {
    ...query,
    requireAllowed,
    verify: async (onDenied: (message: string) => void): Promise<boolean> => {
      try {
        await requireAllowed();
        return true;
      } catch (error) {
        onDenied(error instanceof Error ? error.message : 'Não foi possível conferir a política de ingresso.');
        return false;
      }
    },
    admission: technicalAdmissionUiState({
      required, phaseAllowed, policy: query.data, pending: query.isPending,
      fetching: query.isFetching, error: query.isError,
    }),
  };
};
