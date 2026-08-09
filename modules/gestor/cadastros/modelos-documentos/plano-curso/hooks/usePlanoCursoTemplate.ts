import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { planoCursoTemplateService } from '../services/plano-curso-template.service';
import type { ConteudoModeloPlanoCurso } from '../types/plano-curso.types';

export const planoCursoTemplateQueryKeys = {
  all: ['modelos-documentos', 'plano-curso'] as const,
  detail: () => [...planoCursoTemplateQueryKeys.all, 'template'] as const,
};

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('Seu navegador não suporta o identificador seguro necessário para salvar o modelo.');
};

export const usePlanoCursoTemplate = () => {
  const queryClient = useQueryClient();
  const pendingSave = useRef<{ signature: string; requestId: string } | null>(null);
  const templateQuery = useQuery({
    queryKey: planoCursoTemplateQueryKeys.detail(),
    queryFn: () => planoCursoTemplateService.getTemplate(),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: (conteudo: ConteudoModeloPlanoCurso) => {
      const revisaoEsperada = templateQuery.data?.revisao ?? 0;
      const signature = `${revisaoEsperada}:${JSON.stringify(conteudo)}`;
      if (pendingSave.current?.signature !== signature) {
        pendingSave.current = { signature, requestId: createRequestId() };
      }
      return planoCursoTemplateService.saveTemplate({
        revisaoEsperada,
        conteudo,
        requestId: pendingSave.current.requestId,
      });
    },
    onSuccess: (saved) => {
      pendingSave.current = null;
      queryClient.setQueryData(planoCursoTemplateQueryKeys.detail(), saved);
    },
  });

  return { templateQuery, saveMutation };
};
