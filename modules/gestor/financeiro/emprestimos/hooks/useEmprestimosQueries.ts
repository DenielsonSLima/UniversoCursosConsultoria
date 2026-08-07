import { useQuery } from '@tanstack/react-query';
import { emprestimosQueryKeys } from '../emprestimos.queryKeys';
import { emprestimosService } from '../emprestimos.service';

const normalizePoloResponsavelId = (poloId?: string | null) => (
  poloId && poloId !== 'todos' ? poloId : ''
);

export function useEmprestimosQuery(
  poloResponsavelId?: string | null,
  enabled = true,
) {
  const poloId = normalizePoloResponsavelId(poloResponsavelId);

  return useQuery({
    queryKey: emprestimosQueryKeys.list(poloId),
    queryFn: () => emprestimosService.listar(poloId),
    enabled: enabled && Boolean(poloId),
    staleTime: 15_000,
    gcTime: 30 * 60_000,
  });
}
