import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../../../parceiros.service';
import { documentosAlunoKeys } from '../../../../../shared/documentos-aluno/documentos-aluno.query-keys';
import { documentosAlunoV2Service } from '../../../../../shared/documentos-aluno/documentos-aluno.service';
import type {
  DocumentoAlunoDecisaoRevisao,
  DocumentoAlunoMapeamentoPagina,
} from '../../../../../shared/documentos-aluno/documentos-aluno.types';
import { useDocumentosAlunoRealtime } from '../../../../../shared/documentos-aluno/use-documentos-aluno-realtime';

export const useParceiroAlunoDocumentosWorkflow = (alunoId: string) => {
  const queryClient = useQueryClient();
  useDocumentosAlunoRealtime(alunoId);

  const painelQuery = useQuery({
    queryKey: documentosAlunoKeys.painel(alunoId),
    queryFn: () => documentosAlunoV2Service.getPainel(alunoId),
    enabled: Boolean(alunoId),
  });

  const matriculasQuery = useQuery({
    queryKey: ['matriculas-tecnicas-documentos-pendentes', alunoId],
    queryFn: () => parceirosService.getMatriculasTecnicasPendentes(alunoId),
    enabled: Boolean(alunoId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: documentosAlunoKeys.aluno(alunoId) });
  };

  const reviewMutation = useMutation({
    mutationFn: (input: {
      versaoId: string;
      status: DocumentoAlunoDecisaoRevisao;
      observacao?: string;
    }) => documentosAlunoV2Service.revisar(input.versaoId, input.status, input.observacao),
    onSuccess: invalidate,
  });

  const uploadMutation = useMutation({
    mutationFn: (input: { documentoId: string; files: File[] }) =>
      documentosAlunoV2Service.uploadSeparado(input.documentoId, input.files),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { versaoId: string; motivo: string }) =>
      documentosAlunoV2Service.arquivar(input.versaoId, input.motivo),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { arquivoIds: string[]; motivo: string }) =>
      documentosAlunoV2Service.excluirArquivos(input.arquivoIds, input.motivo),
    onSuccess: invalidate,
  });

  const pagesMutation = useMutation({
    mutationFn: (input: { arquivoId: string; totalPaginas: number }) =>
      documentosAlunoV2Service.definirTotalPaginas(input.arquivoId, input.totalPaginas),
    onSuccess: invalidate,
  });

  const mappingMutation = useMutation({
    mutationFn: (input: {
      loteId: string;
      totalPaginas: number;
      mappings: DocumentoAlunoMapeamentoPagina[];
    }) => documentosAlunoV2Service.mapearPdf(
      input.loteId,
      input.mappings,
      input.totalPaginas,
    ),
    onSuccess: invalidate,
  });

  const cancelPdfMutation = useMutation({
    mutationFn: (input: {
      loteId: string;
      arquivoIds: string[];
      motivo: string;
    }) => documentosAlunoV2Service.cancelarLoteComoGestor(
      input.loteId,
      input.arquivoIds,
      input.motivo,
    ),
    onSettled: invalidate,
  });

  const activateMutation = useMutation({
    mutationFn: (matriculaId: string) =>
      parceirosService.ativarMatriculaTecnicaAposDocumentos(matriculaId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['matriculas-tecnicas-documentos-pendentes', alunoId],
      });
      await queryClient.invalidateQueries({ queryKey: ['matriculas', alunoId] });
    },
  });

  return {
    painelQuery,
    matriculasQuery,
    reviewMutation,
    uploadMutation,
    archiveMutation,
    deleteMutation,
    pagesMutation,
    mappingMutation,
    cancelPdfMutation,
    activateMutation,
  };
};
