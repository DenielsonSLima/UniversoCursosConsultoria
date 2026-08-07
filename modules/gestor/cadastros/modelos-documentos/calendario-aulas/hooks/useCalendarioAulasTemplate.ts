import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarioAulasTemplateService } from '../services/calendario-aulas-template.service';
import type { ConteudoModeloCalendarioAulas } from '../types/calendario-aulas.types';

export const calendarioAulasTemplateQueryKeys = {
  all: ['modelos-documentos', 'calendario-aulas'] as const,
  detail: () => [...calendarioAulasTemplateQueryKeys.all, 'template'] as const,
};

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  throw new Error('Seu navegador não suporta o identificador seguro necessário para salvar o modelo.');
};

export const useCalendarioAulasTemplate = () => {
  const queryClient = useQueryClient();
  const templateQuery = useQuery({
    queryKey: calendarioAulasTemplateQueryKeys.detail(),
    queryFn: () => calendarioAulasTemplateService.getTemplate(),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: (conteudo: ConteudoModeloCalendarioAulas) => calendarioAulasTemplateService.saveTemplate({
      revisaoEsperada: templateQuery.data?.revisao ?? 0,
      conteudo,
      requestId: createRequestId(),
    }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(calendarioAulasTemplateQueryKeys.detail(), saved);
      await queryClient.invalidateQueries({
        queryKey: calendarioAulasTemplateQueryKeys.detail(),
        exact: true,
      });
    },
  });

  return { templateQuery, saveMutation };
};
