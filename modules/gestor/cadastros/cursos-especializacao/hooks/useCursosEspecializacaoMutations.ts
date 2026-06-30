import { useMutation } from '@tanstack/react-query';
import {
  ShowCursoPresencialToast,
  useCursosPresenciaisMutations,
} from '../../hooks/useCursosPresenciaisMutations';
import {
  CursoEspecializacaoStatusFilter,
  cursosEspecializacaoService,
} from '../cursos-especializacao.service';

interface UseCursosEspecializacaoMutationsParams {
  invalidateCursosEspecializacao: () => void;
  showToast: ShowCursoPresencialToast;
  resetCreateForm: () => void;
  closeDuplicateModal: () => void;
  setIsCreatingCurso: (value: boolean) => void;
  setIsDuplicating: (value: boolean) => void;
}

export function useCursosEspecializacaoMutations({
  invalidateCursosEspecializacao,
  showToast,
  resetCreateForm,
  closeDuplicateModal,
  setIsCreatingCurso,
  setIsDuplicating,
}: UseCursosEspecializacaoMutationsParams) {
  const baseMutations = useCursosPresenciaisMutations<CursoEspecializacaoStatusFilter>({
    service: cursosEspecializacaoService,
    invalidateCursos: invalidateCursosEspecializacao,
    showToast,
    resetCreateForm,
    closeDuplicateModal,
    setIsCreatingCurso,
    setIsDuplicating,
    messages: {
      created: 'Especialização criada com sucesso!',
      createError: 'Erro ao criar especialização no Supabase.',
      duplicated: 'Especialização duplicada com sucesso!',
      duplicateError: 'Erro ao duplicar especialização.',
      statusChanged: (status) => `Especialização ${status === 'inativo' ? 'inativada' : 'ativada'} com sucesso!`,
      statusError: 'Erro ao alterar status da especialização.',
      deleted: 'Especialização excluída com sucesso!',
      deleteError: 'Erro ao excluir a especialização.',
    },
  });

  const uploadImagemMutation = useMutation({
    mutationFn: (file: File) => cursosEspecializacaoService.uploadImagem(file),
    onError: (err: any) => {
      console.error('Erro ao fazer upload da imagem:', err);
      showToast('Erro ao fazer upload da imagem: ' + err.message, 'error');
    }
  });

  return {
    ...baseMutations,
    uploadImagemMutation
  };
}
