import { useMutation } from '@tanstack/react-query';
import {
  CursoCadastroModalidade,
  CursoCadastroStatusFilter,
  cursoModalidadeService
} from '../curso-modalidade.service';

type ToastType = 'success' | 'error' | 'warning';
type ShowToast = (message: string, type?: ToastType) => void;

interface CursoModalidadeMessages {
  createSuccess: string;
  createError: string;
  duplicateSuccess: string;
  duplicateError: string;
  deleteSuccess: string;
  deleteError: string;
  toggleSuccess: (novoStatus: CursoCadastroStatusFilter) => string;
  toggleError: string;
}

interface UseCursoModalidadeMutationsParams {
  modalidade: CursoCadastroModalidade;
  invalidateCursosModalidade: () => void;
  showToast: ShowToast;
  resetCreateForm: () => void;
  closeDuplicateModal: () => void;
  setIsCreatingCurso: (value: boolean) => void;
  setIsDuplicating: (value: boolean) => void;
  messages: CursoModalidadeMessages;
}

export function useCursoModalidadeMutations({
  modalidade,
  invalidateCursosModalidade,
  showToast,
  resetCreateForm,
  closeDuplicateModal,
  setIsCreatingCurso,
  setIsDuplicating,
  messages
}: UseCursoModalidadeMutationsParams) {
  const createMutation = useMutation({
    mutationFn: (input: { nome: string; descricao: string; area: string; versao: string }) =>
      cursoModalidadeService.createCurso({ modalidade, ...input }),
    onSuccess: () => {
      resetCreateForm();
      invalidateCursosModalidade();
      showToast(messages.createSuccess, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(messages.createError, 'error');
    },
    onSettled: () => setIsCreatingCurso(false)
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ cursoId, nome, versao }: { cursoId: string; nome: string; versao: string }) =>
      cursoModalidadeService.duplicateCurso(cursoId, nome, versao),
    onSuccess: () => {
      closeDuplicateModal();
      invalidateCursosModalidade();
      showToast(messages.duplicateSuccess, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(messages.duplicateError, 'error');
    },
    onSettled: () => setIsDuplicating(false)
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ cursoId, novoStatus }: { cursoId: string; novoStatus: CursoCadastroStatusFilter }) =>
      cursoModalidadeService.toggleStatus(cursoId, novoStatus),
    onSuccess: (_, vars) => {
      invalidateCursosModalidade();
      showToast(messages.toggleSuccess(vars.novoStatus), 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(messages.toggleError, 'error');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (cursoId: string) => cursoModalidadeService.deleteCurso(cursoId),
    onSuccess: () => {
      invalidateCursosModalidade();
      showToast(messages.deleteSuccess, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(err.message || messages.deleteError, 'error');
    }
  });

  return {
    createMutation,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation
  };
}
