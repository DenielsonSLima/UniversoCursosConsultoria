import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { carteirinhasPreceptorKeys } from '../../../../secretaria/carteirinhas-preceptor/carteirinhas-preceptor.keys';
import { carteirinhaPreceptorTemplateService } from '../services/carteirinha-preceptor-template.service';
import type { ConteudoModeloCarteirinhaPreceptor } from '../types/carteirinha-preceptor.types';

export const carteirinhaPreceptorTemplateQueryKeys = {
  all: ['modelos-documentos', 'carteirinha-preceptor'] as const,
  detail: () => [...carteirinhaPreceptorTemplateQueryKeys.all, 'template'] as const,
};

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  throw new Error('Seu navegador não suporta o identificador seguro necessário para salvar o modelo.');
};

export const useCarteirinhaPreceptorTemplate = () => {
  const queryClient = useQueryClient();
  const templateQuery = useQuery({
    queryKey: carteirinhaPreceptorTemplateQueryKeys.detail(),
    queryFn: () => carteirinhaPreceptorTemplateService.getTemplate(),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: (conteudo: ConteudoModeloCarteirinhaPreceptor) => carteirinhaPreceptorTemplateService.saveTemplate({
      revisaoEsperada: templateQuery.data?.revisao ?? 0,
      conteudo,
      requestId: createRequestId(),
    }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(carteirinhaPreceptorTemplateQueryKeys.detail(), saved);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: carteirinhaPreceptorTemplateQueryKeys.detail(),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: carteirinhasPreceptorKeys.all }),
      ]);
    },
  });

  return { templateQuery, saveMutation };
};
