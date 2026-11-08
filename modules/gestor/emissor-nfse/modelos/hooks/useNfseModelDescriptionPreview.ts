import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { NfseAccessError } from '../../services/nfse.errors';
import { nfseModelsService } from '../services/nfse-models.service';
import { nfseModelsKeys } from '../queries/nfse-models.keys';

/** Only the RPC resolves variables; typing never publishes a previous preview. */
export function useNfseModelDescriptionPreview(scope: NfseScope | null, description: string) {
  const currentText = description.trim();
  const [debouncedText, setDebouncedText] = useState(currentText);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(currentText), 300);
    return () => clearTimeout(timer);
  }, [currentText]);
  const current = currentText === debouncedText;
  const hasText = currentText.length > 0;
  const validScope = isNfseScopeValid(scope);
  const query = useQuery({
    queryKey: nfseModelsKeys.descriptionPreview(scope, debouncedText),
    enabled: validScope && hasText && current,
    queryFn: ({ signal }) => {
      if (!isNfseScopeValid(scope)) throw new NfseAccessError();
      return nfseModelsService.previewDescription(scope, debouncedText, signal);
    },
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const pending = hasText && validScope && (!current || query.isPending || query.isFetching);
  const error = hasText && current ? query.error : null;
  const ready = Boolean(hasText && validScope && current && !pending && !error && query.data);
  return {
    data: ready ? query.data : undefined,
    pending,
    error,
    ready,
    hasText,
    retry: () => { if (hasText && current && validScope) void query.refetch(); },
  };
}
