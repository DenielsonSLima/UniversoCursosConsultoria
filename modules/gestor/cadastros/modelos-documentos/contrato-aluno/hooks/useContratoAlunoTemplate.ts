import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contratosAlunoKeys } from '../../../../secretaria/contratos-aluno/contratos-aluno.keys';
import { contratoAlunoTemplateService, CONTRATO_ALUNO_TEMPLATE_KEY } from '../services/contrato-aluno-template.service';
import type {
  ConteudoModeloContratoAluno,
  ContratoAlunoModalidade,
  SalvarModeloDocumentoSeguroInput,
} from '../types/contrato-aluno.types';

export const contratoAlunoTemplateQueryKeys = {
  all: ['modelos-documentos', 'contrato-aluno'] as const,
  detail: (modalidade: ContratoAlunoModalidade) => [
    ...contratoAlunoTemplateQueryKeys.all,
    'template',
    modalidade,
  ] as const,
};

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('Seu navegador não suporta o identificador seguro necessário para salvar o modelo.');
};

export const useContratoAlunoTemplate = (modalidade: ContratoAlunoModalidade) => {
  const queryClient = useQueryClient();
  const templateQuery = useQuery({
    queryKey: contratoAlunoTemplateQueryKeys.detail(modalidade),
    queryFn: () => contratoAlunoTemplateService.getTemplate(modalidade),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const refreshRelatedWorkspaces = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: contratoAlunoTemplateQueryKeys.detail(modalidade),
        exact: true,
      }),
      queryClient.invalidateQueries({ queryKey: contratosAlunoKeys.all }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (conteudo: ConteudoModeloContratoAluno) => {
      const current = templateQuery.data;
      const input: SalvarModeloDocumentoSeguroInput<ConteudoModeloContratoAluno> = {
        templateKey: CONTRATO_ALUNO_TEMPLATE_KEY,
        modalidade,
        revisaoEsperada: current?.revisao ?? 0,
        conteudo,
        requestId: createRequestId(),
      };
      return contratoAlunoTemplateService.saveTemplate(input);
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(contratoAlunoTemplateQueryKeys.detail(modalidade), saved);
      await refreshRelatedWorkspaces();
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      const current = templateQuery.data;
      if (!current) throw new Error('Carregue a versão atual antes de aprovar o contrato.');
      return contratoAlunoTemplateService.approveTemplate({
        modalidade,
        revisaoEsperada: current.revisao,
        requestId: createRequestId(),
      });
    },
    onSuccess: async (approved) => {
      queryClient.setQueryData(contratoAlunoTemplateQueryKeys.detail(modalidade), approved);
      await refreshRelatedWorkspaces();
    },
  });

  return { templateQuery, saveMutation, approveMutation };
};
