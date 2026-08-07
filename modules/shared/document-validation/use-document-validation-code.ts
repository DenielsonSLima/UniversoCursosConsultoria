import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  createDocumentReissueKey,
  documentValidationService,
} from './document-validation.service';
import { IssueDocumentInput } from './document-validation.types';

export const documentValidationQueryKey = (
  input: IssueDocumentInput | null,
) => [
  'document-validation-code',
  input?.type,
  input?.enrollmentId,
  input?.referencePeriod,
  input?.sourceReference,
  input?.expiresAt,
] as const;

const asReadOnlyIssue = (input: IssueDocumentInput): IssueDocumentInput => {
  const {
    idempotencyKey: _idempotencyKey,
    registerReissue: _registerReissue,
    ...readOnlyInput
  } = input;
  return readOnlyInput;
};

export const useDocumentValidationCode = (
  input: IssueDocumentInput | null,
  enabled = true
) => {
  const queryClient = useQueryClient();
  const queryKey = documentValidationQueryKey(input);

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
    input?.sourceReference,
    input?.type,
    queryClient,
  ]);

  return useQuery({
    queryKey,
    queryFn: () => documentValidationService.issue(asReadOnlyIssue(input!)),
    enabled: enabled && !!input?.enrollmentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
};

export const useDocumentValidationReissue = (
  input: IssueDocumentInput | null,
) => {
  const queryClient = useQueryClient();
  const pendingRequest = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      request: IssueDocumentInput;
      idempotencyKey: string;
    }) => documentValidationService.reissue({
      ...asReadOnlyIssue(request),
      idempotencyKey,
    }),
    retry: 1,
    onSuccess: (issued, variables) => {
      queryClient.setQueryData(
        documentValidationQueryKey(variables.request),
        issued,
      );
    },
  });

  const reissue = async () => {
    if (!input?.enrollmentId) {
      throw new Error('Informe a matrícula do documento a reemitir.');
    }

    const request = asReadOnlyIssue(input);
    const fingerprint = JSON.stringify([
      request.type,
      request.enrollmentId,
      request.referencePeriod || null,
      request.sourceReference || null,
      request.issuedBy || null,
    ]);
    if (pendingRequest.current?.fingerprint !== fingerprint) {
      pendingRequest.current = {
        fingerprint,
        idempotencyKey: createDocumentReissueKey(),
      };
    }

    const activeRequest = pendingRequest.current;
    // Se mutateAsync falhar, a execução para antes da limpeza e a mesma chave
    // fica disponível para um retry manual seguro.
    const issued = await mutation.mutateAsync({
      request,
      idempotencyKey: activeRequest.idempotencyKey,
    });
    if (pendingRequest.current === activeRequest) {
      pendingRequest.current = null;
    }
    return issued;
  };

  return {
    ...mutation,
    reissue,
  };
};
