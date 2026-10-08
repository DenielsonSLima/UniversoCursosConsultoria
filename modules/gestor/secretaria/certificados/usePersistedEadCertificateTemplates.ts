import { useQuery } from '@tanstack/react-query';
import { diplomaService } from '../../cadastros/modelos-documentos/diploma/diploma.service';

export const usePersistedEadCertificateTemplates = (contextId: string, enabled = true) => useQuery<any[]>({
  queryKey: ['ead-certificate-persisted-templates', contextId],
  enabled,
  queryFn: () => diplomaService.getPersistedTemplates(),
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
});
