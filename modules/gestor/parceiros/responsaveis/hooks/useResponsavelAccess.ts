import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResponsaveisLegaisScope } from '../responsaveis.contract';
import { responsaveisLegaisQueryKeys } from '../responsaveis.query-keys';
import { responsavelAccessService } from '../responsavel-access.service';

const createStableRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('Este navegador não consegue identificar esta tentativa com segurança.');
};

const getStableRequestId = (registry: Map<string, string>, fingerprint: string) => {
  const current = registry.get(fingerprint);
  if (current) return current;
  const created = createStableRequestId();
  registry.set(fingerprint, created);
  return created;
};

export const useResponsavelAccess = (
  responsavelLegalId: string,
  scope: ResponsaveisLegaisScope,
  enabled = true,
) => {
  const queryClient = useQueryClient();
  const requestIdsRef = useRef(new Map<string, string>());
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [isIssuingTemporaryPassword, setIsIssuingTemporaryPassword] = useState(false);

  const invalidateResponsavelQueries = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: responsaveisLegaisQueryKeys.polo(scope.poloId),
    });
  }, [queryClient, scope.poloId]);

  const statusQuery = useQuery({
    queryKey: responsaveisLegaisQueryKeys.access(scope, responsavelLegalId),
    queryFn: async () => {
      const statuses = await responsavelAccessService.listarStatus([responsavelLegalId]);
      const status = statuses.find((item) => item.responsavelLegalId === responsavelLegalId);
      if (!status) throw new Error('O serviço não devolveu a situação deste responsável.');
      return status;
    },
    enabled: Boolean(responsavelLegalId && enabled),
    staleTime: 15_000,
    retry: false,
  });

  const prepareMutation = useMutation({
    mutationFn: async () => {
      const fingerprint = `prepare:${responsavelLegalId}`;
      const result = await responsavelAccessService.preparar(
        responsavelLegalId,
        getStableRequestId(requestIdsRef.current, fingerprint),
      );
      requestIdsRef.current.delete(fingerprint);
      return result;
    },
    onSuccess: invalidateResponsavelQueries,
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const fingerprint = `resend:${responsavelLegalId}`;
      const result = await responsavelAccessService.reenviar(
        responsavelLegalId,
        getStableRequestId(requestIdsRef.current, fingerprint),
      );
      if (result.requestFinalized === true) {
        requestIdsRef.current.delete(fingerprint);
      }
      return result;
    },
    onSuccess: invalidateResponsavelQueries,
  });

  const confirmEmailMutation = useMutation({
    mutationFn: () => responsavelAccessService.confirmarEmail(responsavelLegalId),
    onSuccess: invalidateResponsavelQueries,
  });

  const issueTemporaryPassword = useCallback(async () => {
    if (isIssuingTemporaryPassword) return null;
    setTemporaryPassword('');
    setIsIssuingTemporaryPassword(true);
    try {
      // A senha permanece apenas no estado efêmero deste componente. Ela nunca
      // entra no QueryClient nem no cache de mutation do TanStack Query.
      const result = await responsavelAccessService.emitirSenhaTemporaria(responsavelLegalId);
      setTemporaryPassword(result.temporaryPassword);
      await invalidateResponsavelQueries();
      return result;
    } finally {
      setIsIssuingTemporaryPassword(false);
    }
  }, [invalidateResponsavelQueries, isIssuingTemporaryPassword, responsavelLegalId]);

  useEffect(() => {
    setTemporaryPassword('');
    requestIdsRef.current.clear();
  }, [responsavelLegalId]);

  return {
    statusQuery,
    prepareMutation,
    resendMutation,
    confirmEmailMutation,
    temporaryPassword,
    clearTemporaryPassword: () => setTemporaryPassword(''),
    issueTemporaryPassword,
    isIssuingTemporaryPassword,
  };
};
