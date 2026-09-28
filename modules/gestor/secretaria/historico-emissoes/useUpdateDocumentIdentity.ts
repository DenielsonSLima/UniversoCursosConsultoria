import { useRef, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { EmissionLog } from './historico-emissoes.types';

export const canUpdateDocumentIdentity = (emission: EmissionLog) => (
  ['pasta_identificacao', 'ficha_matricula', 'carteirinha'].includes(emission.documento)
  && emission.status !== 'REVOGADO'
);

export const identityUpdateError = (error: unknown) => {
  const message = String((error as { message?: string })?.message || '');
  if (message.includes('já corresponde ao cadastro atual')) {
    return 'A identificação deste documento já corresponde ao cadastro atual.';
  }
  if (/CIN|RG/.test(message)) {
    return 'Confirme o tipo de identificação no cadastro do aluno antes de criar uma nova versão.';
  }
  if (/revogad/i.test(message)) return 'O documento foi revogado e não pode gerar uma nova versão.';
  if (/autoriz|acesso/i.test(message)) return 'Você não tem permissão para atualizar a identificação deste documento.';
  return 'Não foi possível atualizar a identificação. Confira o cadastro e tente novamente.';
};

export const requestDocumentIdentityUpdate = async (
  emission: EmissionLog,
  requestId: string,
  dependencies = {
    client: supabase,
    load: async (code: string) => {
      const { historicoEmissoesService } = await import('./historico-emissoes.service');
      return historicoEmissoesService.loadEmissionByCode(code);
    },
  },
) => {
  const { data, error } = await dependencies.client.rpc('atualizar_identidade_documento_portal', {
    p_codigo_origem: emission.codigo,
    p_request_id: requestId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.codigo || result.documento !== emission.documento) {
    throw new Error('A nova versão não retornou uma identificação válida.');
  }
  const updated = await dependencies.load(result.codigo);
  if (updated.codigo !== result.codigo || updated.documento !== emission.documento
    || updated.aluno_id !== emission.aluno_id || updated.matricula_id !== emission.matricula_id) {
    throw new Error('A nova versão retornada não corresponde à emissão solicitada.');
  }
  return updated;
};

export const useUpdateDocumentIdentity = (
  emission: EmissionLog,
  onUpdated?: (emission: EmissionLog) => void | Promise<void>,
) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const request = useRef<{ code: string; id: string } | null>(null);
  const updateIdentity = async () => {
    if (busy.current || !onUpdated || !canUpdateDocumentIdentity(emission)) return;
    busy.current = true;
    setIsUpdating(true);
    setError(null);
    if (request.current?.code !== emission.codigo) {
      request.current = { code: emission.codigo, id: crypto.randomUUID() };
    }
    try {
      const updated = await requestDocumentIdentityUpdate(emission, request.current.id);
      await onUpdated(updated);
      request.current = null;
    } catch (error) {
      setError(identityUpdateError(error));
    } finally {
      busy.current = false;
      setIsUpdating(false);
    }
  };
  return { isUpdating, error, updateIdentity };
};
