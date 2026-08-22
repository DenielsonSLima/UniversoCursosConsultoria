import { useQuery } from '@tanstack/react-query';
import { responsavelQueryKeys } from '../responsavel.contract';
import { listarDependentesResponsavel } from '../responsavel.service';

export const useResponsavelDependentes = (responsavelLegalId: string | null | undefined) => (
  useQuery({
    queryKey: responsavelQueryKeys.dependentes(responsavelLegalId || 'sem-contexto'),
    queryFn: () => listarDependentesResponsavel(responsavelLegalId || ''),
    enabled: Boolean(responsavelLegalId),
    staleTime: 30_000,
    retry: false,
  })
);
