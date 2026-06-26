import { useMutation } from '@tanstack/react-query';
import { CreateCursoTecnicoInput, CursoTecnicoStatusFilter, cursosTecnicosService } from '../cursos-tecnicos.service';

type ToastType = 'success' | 'error' | 'warning';
type ShowToast = (message: string, type?: ToastType) => void;

interface UseCursosTecnicosMutationsParams {
  invalidateCursosTecnicos: () => void;
  showToast: ShowToast;
  resetCreateForm: () => void;
  closeDuplicateModal: () => void;
  setIsCreatingCurso: (value: boolean) => void;
  setIsDuplicating: (value: boolean) => void;
}

export function useCursosTecnicosMutations({
  invalidateCursosTecnicos,
  showToast,
  resetCreateForm,
  closeDuplicateModal,
  setIsCreatingCurso,
  setIsDuplicating
}: UseCursosTecnicosMutationsParams) {
  const createMutation = useMutation({
    mutationFn: (input: CreateCursoTecnicoInput) => cursosTecnicosService.createCurso(input),
    onSuccess: () => {
      resetCreateForm();
      invalidateCursosTecnicos();
      showToast('Curso técnico criado com sucesso!', 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast('Erro ao criar curso no Supabase.', 'error');
    },
    onSettled: () => setIsCreatingCurso(false)
  });

  const deleteMutation = useMutation({
    mutationFn: (cursoId: string) => cursosTecnicosService.deleteCurso(cursoId),
    onSuccess: () => {
      invalidateCursosTecnicos();
      showToast('Curso técnico excluído com sucesso!', 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(err.message || 'Erro ao excluir o curso.', 'error');
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ cursoId, nome, versao }: { cursoId: string; nome: string; versao: string }) =>
      cursosTecnicosService.duplicateCurso(cursoId, nome, versao),
    onSuccess: () => {
      closeDuplicateModal();
      invalidateCursosTecnicos();
      showToast('Curso e grade curricular duplicados com sucesso!', 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast('Erro ao duplicar curso.', 'error');
    },
    onSettled: () => setIsDuplicating(false)
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ cursoId, novoStatus }: { cursoId: string; novoStatus: CursoTecnicoStatusFilter }) =>
      cursosTecnicosService.toggleStatus(cursoId, novoStatus),
    onSuccess: (_, vars) => {
      invalidateCursosTecnicos();
      showToast(`Curso ${vars.novoStatus === 'inativo' ? 'inativado' : 'ativado'} com sucesso!`, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast('Erro ao alterar status do curso.', 'error');
    }
  });

  const uploadImagemMutation = useMutation({
    mutationFn: (file: File) => cursosTecnicosService.uploadImagem(file),
    onError: (err: any) => {
      console.error('Erro ao fazer upload da imagem:', err);
      showToast('Erro ao fazer upload da imagem: ' + err.message, 'error');
    }
  });

  return {
    createMutation,
    deleteMutation,
    duplicateMutation,
    toggleStatusMutation,
    uploadImagemMutation
  };
}
