import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { documentValidationService } from './document-validation.service';
import { IssueDocumentInput } from './document-validation.types';

export const useDocumentValidationCode = (
  input: IssueDocumentInput | null,
  enabled = true
) => {
  const queryClient = useQueryClient();
  const queryKey = [
    'document-validation-code',
    input?.type,
    input?.enrollmentId,
    input?.referencePeriod,
    input?.sourceReference,
    input?.expiresAt,
    input?.registerReissue,
  ] as const;

  useEffect(() => {
    if (!enabled || !input?.enrollmentId) return;

    const channel = supabase
      .channel(`document_validation_${input.type}_${input.enrollmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_validacao',
          filter: `matricula_id=eq.${input.enrollmentId}`,
        },
        () => queryClient.invalidateQueries({ queryKey })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    enabled,
    input?.enrollmentId,
    input?.expiresAt,
    input?.referencePeriod,
    input?.registerReissue,
    input?.sourceReference,
    input?.type,
    queryClient,
  ]);

  return useQuery({
    queryKey,
    queryFn: () => documentValidationService.issue(input!),
    enabled: enabled && !!input?.enrollmentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
};
