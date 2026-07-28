import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { documentValidationPolicyKeys } from './document-validation-policies.service';

let realtimeChannelInstance = 0;

interface DocumentValidationRealtimeRow {
  documento?: string;
  versao?: number;
}

interface DocumentValidationRealtimePayload {
  new?: DocumentValidationRealtimeRow;
  old?: DocumentValidationRealtimeRow;
}

const getPayloadDocument = (
  payload: DocumentValidationRealtimePayload,
): string | null => (
  payload.new?.documento
  || payload.old?.documento
  || null
);

export const useDocumentValidationPoliciesRealtime = (
  onRemotePolicyChange: (documento: string, versao?: number) => void,
) => {
  const queryClient = useQueryClient();
  const remoteChangeRef = useRef(onRemotePolicyChange);
  const channelNameRef = useRef<string>();
  if (!channelNameRef.current) {
    realtimeChannelInstance += 1;
    channelNameRef.current = `document-validation-policies-realtime-v2-${realtimeChannelInstance}`;
  }

  useEffect(() => {
    remoteChangeRef.current = onRemotePolicyChange;
  }, [onRemotePolicyChange]);

  useEffect(() => {
    const invalidateDocument = (
      documento: string | null,
    ) => {
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.list(),
        exact: true,
      });
      if (!documento) return;

      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.detail(documento),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.history(documento),
        exact: true,
      });
    };

    const resyncPolicies = () => {
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.list(),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.details(),
      });
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.histories(),
      });
    };

    let active = true;
    const channel = supabase
      .channel(channelNameRef.current as string)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documentos_validacao_politicas',
        },
        (payload) => {
          if (!active) return;
          const typedPayload = payload as DocumentValidationRealtimePayload;
          const documento = getPayloadDocument(typedPayload);
          invalidateDocument(documento);
          if (documento) {
            remoteChangeRef.current(documento, typedPayload.new?.versao);
          }
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          // Postgres Changes não reproduz os eventos perdidos durante uma
          // desconexão. Toda assinatura/reassinatura reconcilia o cache
          // canônico, inclusive históricos ativos.
          resyncPolicies();
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
