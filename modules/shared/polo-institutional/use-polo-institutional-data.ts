import { useQuery } from '@tanstack/react-query';
import { poloInstitutionalService } from './polo-institutional.service';

export const poloInstitutionalKeys = {
  detail: (poloId: string) => ['polo-institutional', poloId] as const,
};

export const usePoloInstitutionalData = (poloId?: string | null) =>
  useQuery({
    queryKey: poloInstitutionalKeys.detail(poloId || 'nenhum'),
    queryFn: () => poloInstitutionalService.getByPoloId(poloId!),
    enabled: !!poloId,
    staleTime: 5 * 60 * 1000,
  });
