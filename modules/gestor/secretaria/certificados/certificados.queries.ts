import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diplomaService } from '../../cadastros/modelos-documentos/diploma/diploma.service';
import { certificadosService } from './certificados.service';
import { CertificadoModalidade, CertificadoStatus } from './certificados.types';

interface CertificadosFilters {
  modalidade: CertificadoModalidade;
  status: CertificadoStatus;
  turmaId: string;
  poloId?: string;
}

export const certificadosKeys = {
  all: ['certificados-academicos'] as const,
  lists: () => [...certificadosKeys.all, 'list'] as const,
  list: (filters: CertificadosFilters) => [...certificadosKeys.lists(), filters] as const,
  turmas: (modalidade: CertificadoModalidade, poloId?: string) =>
    [...certificadosKeys.all, 'turmas', modalidade, poloId || 'todos'] as const,
  templates: () => [...certificadosKeys.all, 'templates'] as const,
};

export const useCertificadosQuery = (filters: CertificadosFilters) => useQuery({
  queryKey: certificadosKeys.list(filters),
  queryFn: () => certificadosService.list(filters),
  staleTime: 30_000,
});

export const useCertificadoTurmasQuery = (
  modalidade: CertificadoModalidade,
  poloId?: string,
) => useQuery({
  queryKey: certificadosKeys.turmas(modalidade, poloId),
  queryFn: () => certificadosService.getTurmas(modalidade, poloId),
  staleTime: 5 * 60_000,
});

export const useCertificadoTemplatesQuery = () => useQuery({
  queryKey: certificadosKeys.templates(),
  queryFn: () => diplomaService.getTemplates(),
  staleTime: 5 * 60_000,
});

export const useFinalizarCertificadoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof certificadosService.finalizar>[1];
    }) => certificadosService.finalizar(id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: certificadosKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: ['relatorios', 'matriculas-academicas'] }),
      ]);
    },
  });
};
