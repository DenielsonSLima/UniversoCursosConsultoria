import { useMutation } from '@tanstack/react-query';
import { CursoFinanceiroConfig } from '../cadastros.types';

export type CursoPresencialStatusFilter = 'ativo' | 'inativo';
export type CursoPresencialToastType = 'success' | 'error' | 'warning';
export type ShowCursoPresencialToast = (message: string, type?: CursoPresencialToastType) => void;

export interface CreateCursoPresencialInput {
  nome: string;
  descricao: string;
  area: string;
  versao: string;
  cargaHoraria: number;
  imagemUrl?: string | null;
  publicarSite?: boolean;
  duracaoMeses?: number;
  financeiroConfig?: CursoFinanceiroConfig;
}

interface CursosPresenciaisMutationService<TStatus extends CursoPresencialStatusFilter> {
  createCurso: (input: CreateCursoPresencialInput) => Promise<unknown>;
  duplicateCurso: (cursoId: string, nome: string, versao: string) => Promise<void>;
  toggleStatus: (cursoId: string, novoStatus: TStatus) => Promise<void>;
  deleteCurso: (cursoId: string) => Promise<void>;
}

interface CursosPresenciaisMutationMessages {
  created: string;
  createError: string;
  duplicated: string;
  duplicateError: string;
  statusChanged: (status: CursoPresencialStatusFilter) => string;
  statusError: string;
  deleted: string;
  deleteError: string;
}

interface UseCursosPresenciaisMutationsParams<TStatus extends CursoPresencialStatusFilter> {
  service: CursosPresenciaisMutationService<TStatus>;
  invalidateCursos: () => void;
  showToast: ShowCursoPresencialToast;
  resetCreateForm: () => void;
  closeDuplicateModal: () => void;
  setIsCreatingCurso: (value: boolean) => void;
  setIsDuplicating: (value: boolean) => void;
  messages: CursosPresenciaisMutationMessages;
}

export function useCursosPresenciaisMutations<TStatus extends CursoPresencialStatusFilter>({
  service,
  invalidateCursos,
  showToast,
  resetCreateForm,
  closeDuplicateModal,
  setIsCreatingCurso,
  setIsDuplicating,
  messages,
}: UseCursosPresenciaisMutationsParams<TStatus>) {
  const createMutation = useMutation({
    mutationFn: (input: CreateCursoPresencialInput) => service.createCurso(input),
    onSuccess: () => {
      resetCreateForm();
      invalidateCursos();
      showToast(messages.created, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(messages.createError, 'error');
    },
    onSettled: () => setIsCreatingCurso(false),
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ cursoId, nome, versao }: { cursoId: string; nome: string; versao: string }) =>
      service.duplicateCurso(cursoId, nome, versao),
    onSuccess: () => {
      closeDuplicateModal();
      invalidateCursos();
      showToast(messages.duplicated, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(messages.duplicateError, 'error');
    },
    onSettled: () => setIsDuplicating(false),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ cursoId, novoStatus }: { cursoId: string; novoStatus: TStatus }) =>
      service.toggleStatus(cursoId, novoStatus),
    onSuccess: (_, vars) => {
      invalidateCursos();
      showToast(messages.statusChanged(vars.novoStatus), 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(messages.statusError, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (cursoId: string) => service.deleteCurso(cursoId),
    onSuccess: () => {
      invalidateCursos();
      showToast(messages.deleted, 'success');
    },
    onError: (err: any) => {
      console.error(err);
      showToast(err.message || messages.deleteError, 'error');
    },
  });

  return {
    createMutation,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation,
  };
}
