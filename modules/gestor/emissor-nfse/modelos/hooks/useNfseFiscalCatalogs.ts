import { useQuery } from '@tanstack/react-query';
import { loadNfseFiscalCatalogs } from '../services/nfse-fiscal-catalogs.service';
import { nfseFiscalCatalogsKeys } from '../queries/nfse-fiscal-catalogs.keys';

export function useNfseFiscalCatalogs() {
  return useQuery({
    queryKey: nfseFiscalCatalogsKeys.all,
    queryFn: loadNfseFiscalCatalogs,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
