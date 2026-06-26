import { useMutation } from '@tanstack/react-query';
import { cadastrosService } from '../../cadastros.service';

interface ToastApi {
  (message: string, type?: 'success' | 'error' | 'warning'): void;
}

interface DuplicateInput {
  cursoId: string;
  nome: string;
  versao: string;
}

export const useCursosEadMutations = (
  invalidateEadQueries: () => void,
  showToast: ToastApi,
  setIsDuplicating: (value: boolean) => void,
  setShowDuplicateModal: (value: boolean) => void,
  setDuplicateTargetId: (value: string | null) => void,
) => {
  const duplicateMutation = useMutation({
    mutationFn: ({ cursoId, nome, versao }: DuplicateInput) =>
      cadastrosService.duplicateEadCurso(cursoId, nome, versao),
    onSuccess: () => {
      setShowDuplicateModal(false);
      setDuplicateTargetId(null);
      invalidateEadQueries();
      showToast('Curso EAD duplicado com sucesso!', 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast('Erro ao duplicar curso EAD: ' + err.message, 'error');
    },
    onSettled: () => setIsDuplicating(false)
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ cursoId, novoStatus }: { cursoId: string; novoStatus: 'ativo' | 'inativo' }) =>
      cadastrosService.toggleStatus(cursoId, novoStatus),
    onSuccess: (_, vars) => {
      invalidateEadQueries();
      showToast(`Curso EAD ${vars.novoStatus === 'inativo' ? 'inativado' : 'ativado'} com sucesso!`, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast('Erro ao alterar status do curso EAD: ' + err.message, 'error');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (cursoId: string) => cadastrosService.deleteCurso(cursoId),
    onSuccess: () => {
      invalidateEadQueries();
      showToast('Curso EAD excluído com sucesso!', 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast('Erro ao excluir curso EAD: ' + err.message, 'error');
    }
  });

  return {
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation,
  };
};
